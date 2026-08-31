const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();
const auth = getAuth();
const firestore = getFirestore();

const PRIVILEGED_ROLE_KEYS = new Set(["admin", "manager", "supervisor"]);
const APP_ACCESS_KEYS = new Set([
  "vehicles",
  "staff",
  "properties",
  "airbnbReservationInvoices",
  "welcomePacks",
  "laundryLog",
  "linenInventory",
  "operationalGuidelines",
  "heatedPools",
  "allinfo",
  "rnal",
  "checklists",
  "owners",
  "safety",
  "reservations",
  "buildPlanner",
  "inventory",
  "cleaningAh"
]);

exports.getMyAccess = onCall(async (request) => {
  const uid = request.auth?.uid;
  const email = normalizeRawEmail(request.auth?.token?.email);
  if (!uid || !email) {
    throw new HttpsError("unauthenticated", "Sign in before loading application access.");
  }

  if (email.endsWith("@horario.test")) {
    await firestore.collection("userAccess").doc(uid).delete().catch(() => {});
    return { authorized: false };
  }

  const accessEntry = await getAccessEntry(email);
  if (!accessEntry) {
    await firestore.collection("userAccess").doc(uid).delete().catch(() => {});
    return { authorized: false };
  }

  const access = sanitizeAccessEntry(accessEntry, email);
  await materializeUserAccess(uid, email, access);
  return { authorized: true, access };
});

exports.adminCreateAuthUser = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const password = String(request.data?.password || "");

  if (email.endsWith("@horario.test")) {
    throw new HttpsError("invalid-argument", "Production test-account domains are disabled.");
  }

  if (password.length < 12 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Temporary passwords must contain between 12 and 128 characters.");
  }

  try {
    const user = await auth.createUser({ email, password });
    await writeAudit({
      email: actor.email,
      event: "auth_user_created",
      targetEmail: email,
      targetUid: user.uid
    });
    return { uid: user.uid, email };
  } catch (error) {
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "A Firebase Authentication account already exists for this email.");
    }
    console.error("Failed to create Firebase Auth user:", error);
    throw new HttpsError("internal", "Firebase Authentication could not create this user.");
  }
});

exports.adminSetUserPassword = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const password = String(request.data?.password || "");

  if (email.endsWith("@horario.test")) {
    throw new HttpsError("invalid-argument", "Production test-account domains are disabled.");
  }

  if (password.length < 12 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Passwords must contain between 12 and 128 characters.");
  }

  const targetAccessEntry = await getAccessEntry(email);
  if (!targetAccessEntry) {
    throw new HttpsError("not-found", "This email is not listed in User Management.");
  }

  try {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    await auth.revokeRefreshTokens(user.uid);
    await writeAudit({
      email: actor.email,
      event: "auth_user_password_changed",
      targetEmail: email,
      targetUid: user.uid
    });
    return { ok: true };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No Firebase Auth login exists for this email address.");
    }
    if (error?.code === "auth/invalid-password") {
      throw new HttpsError("invalid-argument", "The new password does not meet Firebase password requirements.");
    }
    console.error("Failed to update Firebase Auth password:", error);
    throw new HttpsError("internal", "Firebase Authentication could not update this password.");
  }
});

exports.adminAddAccess = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  if (email.endsWith("@horario.test")) {
    throw new HttpsError("invalid-argument", "Production test-account domains are disabled.");
  }
  const allowedApps = normalizeAllowedApps(request.data?.allowedApps);
  await writeAccessEntry(email, {
    displayEmail: email,
    allowedApps,
    addedAt: FieldValue.serverTimestamp()
  });
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "access_added", targetEmail: email });
  return { ok: true };
});

exports.adminRemoveAccess = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const db = firestore;
  const keys = getEmailLookupKeys(email);
  const canonicalEmail = canonicalizeEmail(email);
  const materializedAccess = await db
    .collection("userAccess")
    .where("emailCanonical", "==", canonicalEmail)
    .get();
  const batch = db.batch();
  keys.forEach((key) => batch.delete(db.collection("allowedEmails").doc(key)));
  materializedAccess.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();

  try {
    const user = await auth.getUserByEmail(email);
    await auth.revokeRefreshTokens(user.uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      console.warn("Could not revoke removed user's sessions:", error);
    }
  }

  await writeAudit({ email: actor.email, event: "access_removed", targetEmail: email });
  return { ok: true };
});

exports.adminSetRoles = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const roles = normalizeRoles(request.data?.roles);
  await writeAccessEntry(email, { displayEmail: email, roles });
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "roles_changed", targetEmail: email, roles });
  return { ok: true };
});

exports.adminSetAllowedApps = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const allowedApps = normalizeAllowedApps(request.data?.allowedApps);
  await writeAccessEntry(email, { displayEmail: email, allowedApps });
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "apps_changed", targetEmail: email, allowedApps });
  return { ok: true };
});

exports.adminSyncEmployeeLink = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const employee = request.data?.employee;
  const patch = { displayEmail: email };

  if (employee?.id) {
    patch.linkedEmployeeId = String(employee.id).slice(0, 160);
    patch.linkedEmployeeName = String(employee.name || "").slice(0, 200);
    patch.linkedEmployeeEmail = normalizeRawEmail(employee.email || email);
    patch.linkedEmployeeArchived = Boolean(employee.isArchived);
  } else {
    patch.linkedEmployeeId = FieldValue.delete();
    patch.linkedEmployeeName = FieldValue.delete();
    patch.linkedEmployeeEmail = FieldValue.delete();
    patch.linkedEmployeeArchived = FieldValue.delete();
  }

  await writeAccessEntry(email, patch);
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "employee_link_changed", targetEmail: email });
  return { ok: true };
});

exports.adminSaveRole = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const key = normalizeRole(request.data?.key);
  const title = String(request.data?.title || "").trim().slice(0, 100);
  if (!key || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key) || !title) {
    throw new HttpsError("invalid-argument", "A valid role key and title are required.");
  }

  await firestore.collection("roles").doc(key).set({
    title,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await writeAudit({ email: actor.email, event: "role_saved", role: key });
  return { ok: true };
});

exports.adminDeleteRole = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const key = normalizeRole(request.data?.key);
  if (!key || PRIVILEGED_ROLE_KEYS.has(key)) {
    throw new HttpsError("failed-precondition", "Built-in privileged roles cannot be deleted.");
  }

  await firestore.collection("roles").doc(key).delete();
  await writeAudit({ email: actor.email, event: "role_deleted", role: key });
  return { ok: true };
});

exports.getUpcomingGuestReservations = onCall(async (request) => {
  const access = await requireAppAccess(request, "welcomePacks");
  const days = Math.max(1, Math.min(31, Number.parseInt(request.data?.days, 10) || 7));
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);

  const snapshot = await firestore
    .collection("reservations")
    .where("checkIn", ">=", startKey)
    .where("checkIn", "<=", `${endKey}T23:59:59.999Z`)
    .limit(250)
    .get();

  const reservations = snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      propertyName: cleanGuestField(data.propertyName, 200),
      checkIn: normalizeReservationDate(data.checkIn),
      checkOut: normalizeReservationDate(data.checkOut),
      portal: cleanGuestField(data.portal || data.channel || data.sourcePortal, 60)
    };
  }).filter((reservation) => reservation.propertyName && reservation.checkIn && reservation.checkOut);

  await firestore.collection("guestDataAccessAudit").add({
    actorUid: request.auth.uid,
    actorEmail: access.email,
    event: "upcoming_reservations_read",
    startDate: startKey,
    endDate: endKey,
    recordCount: reservations.length,
    createdAt: FieldValue.serverTimestamp()
  });

  return { reservations, startDate: startKey, endDate: endKey };
});

exports.getLinenInventoryPropertyDirectory = onCall(async (request) => {
  await requireAppAccess(request, "linenInventory");

  const snapshot = await firestore.collection("properties").get();
  const properties = snapshot.docs
    .map((document) => {
      const data = document.data() || {};
      const name = [
        data.name,
        data.displayName,
        data.title,
        data.reference,
        data.code,
        data.propertyName
      ]
        .map((value) => cleanGuestField(value, 200))
        .find(Boolean);

      return {
        id: String(document.id || "").slice(0, 160),
        name: name || ""
      };
    })
    .filter((property) => property.id && property.name)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { properties };
});

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
    await auth.getUserByEmail(email);
    const resetLink = await auth.generatePasswordResetLink(email);
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

async function requireAdminAccess(request) {
  const access = await requireAuthenticatedAccess(request, "Sign in before managing passwords.");
  const roles = Array.isArray(access.accessEntry?.roles) ? access.accessEntry.roles : [];
  const isAdmin = roles.some((role) => normalizeRole(role) === "admin");

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only administrators can manage password reset links.");
  }

  return { email: access.email, roles };
}

async function requireAppAccess(request, appKey) {
  const access = await requireAuthenticatedAccess(request, "Sign in before accessing guest information.");
  const roles = normalizeRoles(access.accessEntry?.roles);
  const allowedApps = normalizeAllowedApps(access.accessEntry?.allowedApps);
  const privileged = roles.some((role) => PRIVILEGED_ROLE_KEYS.has(role));

  if (!access.accessEntry || (!privileged && !allowedApps.includes(appKey))) {
    throw new HttpsError("permission-denied", "This account does not have access to the requested application.");
  }

  return { email: access.email, roles, allowedApps, privileged };
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
  const db = firestore;
  for (const key of getEmailLookupKeys(email)) {
    const snapshot = await db.collection("allowedEmails").doc(key).get();
    if (snapshot.exists) {
      return snapshot.data() || {};
    }
  }
  return null;
}

function requireValidEmail(value) {
  const email = normalizeRawEmail(value);
  if (!email || !email.includes("@") || email.length > 254) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }
  return email;
}

function normalizeRoles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((role) => normalizeRole(role))
    .filter((role) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(role)))]
    .slice(0, 20);
}

function normalizeAllowedApps(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((app) => typeof app === "string" ? app.trim() : "")
    .filter((app) => APP_ACCESS_KEYS.has(app)))]
    .slice(0, APP_ACCESS_KEYS.size);
}

function sanitizeAccessEntry(entry, fallbackEmail) {
  const email = normalizeRawEmail(entry?.displayEmail || fallbackEmail);
  const access = {
    email,
    displayEmail: email,
    roles: normalizeRoles(entry?.roles),
    allowedApps: normalizeAllowedApps(entry?.allowedApps),
    linkedEmployeeId: entry?.linkedEmployeeId ? String(entry.linkedEmployeeId).slice(0, 160) : null,
    linkedEmployeeName: entry?.linkedEmployeeName ? String(entry.linkedEmployeeName).slice(0, 200) : null,
    linkedEmployeeEmail: normalizeRawEmail(entry?.linkedEmployeeEmail),
    linkedEmployeeArchived: Boolean(entry?.linkedEmployeeArchived)
  };
  return access;
}

async function writeAccessEntry(email, patch) {
  const [primaryKey] = getEmailLookupKeys(email);
  if (!primaryKey) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }
  await firestore.collection("allowedEmails").doc(primaryKey).set(patch, { merge: true });
}

async function materializeUserAccess(uid, email, accessEntry) {
  const sanitized = sanitizeAccessEntry(accessEntry, email);
  await firestore.collection("userAccess").doc(uid).set({
    ...sanitized,
    uid,
    emailCanonical: canonicalizeEmail(email),
    active: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function refreshMaterializedAccess(email) {
  const accessEntry = await getAccessEntry(email);
  if (!accessEntry) {
    await removeMaterializedAccess(email);
    return;
  }

  const canonicalEmail = canonicalizeEmail(email);
  const matching = await firestore
    .collection("userAccess")
    .where("emailCanonical", "==", canonicalEmail)
    .get();
  const knownUsers = new Map(matching.docs.map((document) => [document.id, document.data()?.email || email]));

  try {
    const authUser = await auth.getUserByEmail(email);
    knownUsers.set(authUser.uid, authUser.email || email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      console.warn("Could not look up Auth user while refreshing access:", error);
    }
  }

  await Promise.all([...knownUsers.entries()].map(([uid, userEmail]) => {
    return materializeUserAccess(uid, userEmail, accessEntry);
  }));
}

async function removeMaterializedAccess(email) {
  const canonicalEmail = canonicalizeEmail(email);
  if (!canonicalEmail) return;
  const snapshot = await firestore
    .collection("userAccess")
    .where("emailCanonical", "==", canonicalEmail)
    .get();
  if (snapshot.empty) return;
  const batch = firestore.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

function cleanGuestField(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeReservationDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

async function writeAudit(entry) {
  const collectionName = "securityAudit";
  try {
    await firestore.collection(collectionName).add({
      ...entry,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.warn(`Failed to write ${collectionName} entry:`, error);
  }
}
