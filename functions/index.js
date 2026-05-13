const admin = require("firebase-admin");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const functions = require("firebase-functions");

admin.initializeApp();

const nukiApiToken = defineSecret("NUKI_API_TOKEN");

const ACTIONS = Object.freeze({
  unlock: 1,
  lock: 2,
  unlatch: 3,
  lockngo: 4,
  lockngo_unlatch: 5
});

const PRIVILEGED_ROLE_KEYS = new Set(["admin", "manager", "supervisor"]);
const NUKI_APP_ACCESS_KEY = "nukiDoors";

exports.createPasswordResetLink = onCall({ cors: true }, async (request) => {
  const access = await requireAdminAccess(request);
  const email = normalizeRawEmail(request.data?.email);

  if (!email || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }

  const targetAccessEntry = await getAccessEntry(email);
  if (!targetAccessEntry) {
    throw new HttpsError("not-found", "This email is not listed in User Management.");
  }

  try {
    await admin.auth().getUserByEmail(email);
    const resetLink = await admin.auth().generatePasswordResetLink(email);
    await writeAudit({
      email: access.email,
      event: "password_reset_link_created",
      targetEmail: email
    });
    return { resetLink };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No Firebase Auth login exists for this email address.");
    }

    console.error("Failed to create password reset link:", error);
    const mappedError = getPasswordResetLinkError(error);
    throw new HttpsError(mappedError.code, mappedError.message, {
      authCode: error?.code || null
    });
  }
});

exports.nukiListDoors = onCall(async (request) => {
  const access = await requireNukiAccess(request);
  const doors = await getConfiguredDoors();
  return {
    canManage: access.privileged,
    doors: doors.map(({ smartlockId, ...door }) => ({
      ...door,
      smartlockIdLast4: String(smartlockId).slice(-4)
    }))
  };
});

exports.nukiDoorAction = onCall({ secrets: [nukiApiToken] }, async (request) => {
  const access = await requireNukiAccess(request);
  const doors = await getConfiguredDoors();
  const doorId = String(request.data?.doorId || "").trim();
  const door = doors.find((item) => item.id === doorId);

  if (!door) {
    throw new HttpsError("not-found", "Door not found.");
  }

  const actionName = normalizeAction(request.data?.action || door.defaultAction || "unlatch");
  const action = ACTIONS[actionName];
  if (!action) {
    throw new HttpsError("invalid-argument", "Unsupported Nuki door action.");
  }

  const result = await nukiRequest(`/smartlock/${encodeURIComponent(door.smartlockId)}/action`, {
    method: "POST",
    body: JSON.stringify({ action })
  });

  await writeAudit({
    email: access.email,
    event: "door_action",
    doorId: door.id,
    doorName: door.name,
    action: actionName
  });

  return { ok: true, doorId: door.id, action: actionName, result };
});

exports.nukiListDevices = onCall({ secrets: [nukiApiToken] }, async (request) => {
  const access = await requireNukiAccess(request);
  if (!access.privileged) {
    throw new HttpsError("permission-denied", "Only privileged users can list Nuki devices.");
  }

  const devices = await nukiRequest("/smartlock", { method: "GET" });
  await writeAudit({ email: access.email, event: "device_list" });
  return { devices };
});

exports.nukiSaveDoor = onCall(async (request) => {
  const access = await requireNukiAccess(request);
  if (!access.privileged) {
    throw new HttpsError("permission-denied", "Only privileged users can configure Nuki doors.");
  }

  const id = slugify(request.data?.id || request.data?.name);
  const name = String(request.data?.name || "").trim();
  const smartlockId = String(request.data?.smartlockId || "").trim();
  const defaultAction = normalizeAction(request.data?.defaultAction || "unlatch");

  if (!id || !name || !smartlockId) {
    throw new HttpsError("invalid-argument", "Door name and smartlockId are required.");
  }
  if (!ACTIONS[defaultAction]) {
    throw new HttpsError("invalid-argument", "Unsupported default action.");
  }

  await admin.firestore().collection("nukiDoors").doc(id).set({
    name,
    smartlockId,
    defaultAction,
    enabled: request.data?.enabled !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: access.email
  }, { merge: true });

  await writeAudit({ email: access.email, event: "door_config_saved", doorId: id, doorName: name });
  return { ok: true, id };
});

exports.nukiDeleteDoor = onCall(async (request) => {
  const access = await requireNukiAccess(request);
  if (!access.privileged) {
    throw new HttpsError("permission-denied", "Only privileged users can configure Nuki doors.");
  }

  const id = String(request.data?.id || "").trim();
  if (!id) {
    throw new HttpsError("invalid-argument", "Door id is required.");
  }

  await admin.firestore().collection("nukiDoors").doc(id).delete();
  await writeAudit({ email: access.email, event: "door_config_deleted", doorId: id });
  return { ok: true };
});

async function requireNukiAccess(request) {
  const access = await requireAuthenticatedAccess(request, "Sign in before using Nuki doors.");
  const roles = Array.isArray(access.accessEntry?.roles) ? access.accessEntry.roles : [];
  const allowedApps = Array.isArray(access.accessEntry?.allowedApps) ? access.accessEntry.allowedApps : [];
  const privileged = roles.some((role) => PRIVILEGED_ROLE_KEYS.has(normalizeRole(role)));
  const allowed = privileged || allowedApps.includes(NUKI_APP_ACCESS_KEY);

  if (!allowed) {
    throw new HttpsError("permission-denied", "This account does not have Nuki door access.");
  }

  return { email: access.email, privileged, roles, allowedApps };
}

async function requireAdminAccess(request) {
  const access = await requireAuthenticatedAccess(request, "Sign in before managing passwords.");
  const roles = Array.isArray(access.accessEntry?.roles) ? access.accessEntry.roles : [];
  const isAdmin = roles.some((role) => normalizeRole(role) === "admin");

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only administrators can manage password reset links.");
  }

  return { email: access.email, roles };
}

async function requireAuthenticatedAccess(request, unauthenticatedMessage) {
  const email = request.auth?.token?.email;
  if (!email) {
    throw new HttpsError("unauthenticated", unauthenticatedMessage);
  }

  const accessEntry = await getAccessEntry(email);
  return { email, accessEntry };
}

async function getAccessEntry(email) {
  const db = admin.firestore();
  for (const key of getEmailLookupKeys(email)) {
    const snapshot = await db.collection("allowedEmails").doc(key).get();
    if (snapshot.exists) {
      return snapshot.data() || {};
    }
  }
  return null;
}

function getEmailLookupKeys(value) {
  const raw = normalizeRawEmail(value);
  const canonical = canonicalizeEmail(value);
  return [...new Set([canonical, raw].filter(Boolean))];
}

function normalizeRawEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function canonicalizeEmail(value) {
  const normalized = normalizeRawEmail(value);
  if (!normalized || !normalized.includes("@")) {
    return normalized;
  }

  const [localPart, domainPart] = normalized.split("@");
  if (!localPart || !domainPart) {
    return normalized;
  }

  if (domainPart === "gmail.com" || domainPart === "googlemail.com") {
    const plusIndex = localPart.indexOf("+");
    const trimmedLocal = plusIndex >= 0 ? localPart.slice(0, plusIndex) : localPart;
    return `${trimmedLocal.replace(/\./g, "")}@gmail.com`;
  }

  return normalized;
}

function normalizeRole(role) {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

function getPasswordResetLinkError(error) {
  const code = error?.code || "";
  const knownFailures = new Set([
    "auth/invalid-email",
    "auth/invalid-continue-uri",
    "auth/unauthorized-continue-uri",
    "auth/missing-continue-uri",
    "auth/invalid-dynamic-link-domain"
  ]);

  if (knownFailures.has(code)) {
    return {
      code: "failed-precondition",
      message: `Firebase Auth rejected the password reset link settings (${code}).`
    };
  }

  return {
    code: "internal",
    message: "Firebase Auth could not create a password reset link. Check the function logs for the exact Admin SDK error."
  };
}

async function getConfiguredDoors() {
  const snapshot = await admin.firestore().collection("nukiDoors").get();
  const firestoreDoors = snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: String(data.name || doc.id).trim(),
        smartlockId: String(data.smartlockId || "").trim(),
        defaultAction: normalizeAction(data.defaultAction || "unlatch"),
        enabled: data.enabled !== false
      };
    })
    .filter((door) => door.id && door.name && door.smartlockId && door.enabled);

  if (firestoreDoors.length) {
    return firestoreDoors;
  }

  const raw = process.env.NUKI_DOORS_JSON || functions.config()?.nuki?.doors || "[]";
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((door) => ({
        id: String(door.id || "").trim(),
        name: String(door.name || door.id || "").trim(),
        smartlockId: String(door.smartlockId || "").trim(),
        defaultAction: normalizeAction(door.defaultAction || "unlatch")
      }))
      .filter((door) => door.id && door.name && door.smartlockId);
  } catch (error) {
    console.error("Invalid Nuki door config:", error);
    return [];
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeAction(action) {
  return String(action || "").trim().toLowerCase().replace(/[-\s]/g, "_");
}

async function nukiRequest(endpoint, options = {}) {
  const token = nukiApiToken.value() || process.env.NUKI_API_TOKEN;
  if (!token) {
    throw new HttpsError("failed-precondition", "Nuki API token is not configured.");
  }

  const response = await fetch(`https://api.nuki.io${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : {};

  if (!response.ok) {
    console.error("Nuki API error:", response.status, payload);
    throw new HttpsError("internal", payload?.message || payload?.error || `Nuki API failed with HTTP ${response.status}`);
  }

  return payload;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function writeAudit(entry) {
  try {
    await admin.firestore().collection("nukiDoorAudit").add({
      ...entry,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.warn("Failed to write Nuki audit entry:", error);
  }
}
