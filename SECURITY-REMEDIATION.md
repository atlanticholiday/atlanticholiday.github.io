# Security remediation runbook

Guest and operational data confidentiality takes priority over feature availability. Do not reconnect external channel-manager access until the owner of each integration has rotated its credentials and provided access logs.

## Immediate incident actions (outside this repository)

1. In Airbnb, remove both connected services that can access reservations or messaging. Reconnect only one service at a time after the vendor confirms token rotation and reviews its outbound-message logs.
2. Ask Airbnb for the compromised partner/application identifier, OAuth client identifier, message timestamps, source IP addresses, user agent, and token creation/last-use timestamps. A password change does not necessarily revoke a connected partner's OAuth token.
3. Revoke every active session for affected Airbnb and vendor accounts. Require MFA for every staff and vendor login.
4. In Google Cloud IAM, disable and delete every key associated with the service account exposed in Git commits `3a01cb4` and `cade813`, then review Admin Activity and Data Access logs. Deleting the JSON file from Git did not revoke that key.
5. Disable the old public Google Apps Script reservation endpoint and make the backing Google Sheet private. Rotate every iCal URL that was stored in a `properties` document or shared with a proxy.
6. Rotate any Firebase Storage download tokens previously saved in `plenoHotelRecords`. The updated client removes token URLs from Firestore, but removing a URL from a document does not revoke a token that was already exposed.
7. Revoke the Airbnb web sessions used by the local invoice utilities, then securely remove the legacy `.airbnb-playwright` directory after preserving any forensic evidence you need. It contains a reusable logged-in browser profile and was last written before this review. The updated utilities use an ephemeral profile by default.
8. Export and preserve logs before retention windows expire. Record all times in UTC.

During the 2026-08-05 review, the retired property spreadsheet export still returned HTTP 200 to an unauthenticated request. Treat its URL and all data it contains as public until sharing is disabled in Google Drive.

## Implemented in this hardening pass

- Authentication and app authorization now fail closed through server-managed `userAccess/{uid}` records; administration writes moved to admin-only callables.
- Firestore and Storage are deny-by-default, with role/app scoping and server-only audit collections.
- The public reservation feed, public Sheet import, browser iCal/CORS proxy, guest/property caches, and persistent Firestore browser cache are disabled.
- Welcome Packs receives a minimal reservation projection without guest identity, contact, reservation-number, or payment fields.
- Storage attachments use authenticated reads instead of public download-token URLs.
- Airbnb invoice utilities use temporary browser profiles and suppress guest identifiers by default.
- Executable CDN assets are version-pinned with Subresource Integrity. The vulnerable SheetJS 0.18.5 parser was replaced with 0.20.3, and jsPDF was upgraded past its published ReDoS fix.
- Server dependencies are locked; the installed runtime dependency set reports zero known npm audit advisories.

## Deployment order

Use a maintenance window. Existing clients may temporarily lose access when the deny-by-default rules become active.

Projects on the free Spark plan cannot deploy Cloud Functions. Until the project is upgraded, the client falls back to reading only the signed-in user's exact `allowedEmails/{email}` document. The matching Firestore rules preserve the same fail-closed allowlist and exclude `@horario.test` accounts. Protected administration, reservation projection, and password-reset-link functions remain unavailable on Spark.

1. Deploy Firebase Functions so `getMyAccess` and the protected administration/reservation functions exist.
   - The functions runtime is upgraded to Node.js 22 and uses the modular Firebase Admin SDK.
   - Follow the retired door integration cleanup in [functions/README.md](functions/README.md) when removing previously deployed resources.
2. Deploy the updated web application and confirm one administrator and one limited user can sign in. This creates their server-managed `userAccess/{uid}` documents.
3. Deploy `firestore.rules` and `storage.rules` immediately after the updated client is live.
4. Test each role with a separate non-production account. Confirm that an unlisted Firebase Auth account is signed out and receives `permission-denied` from Firestore.
5. Remove obsolete `@horario.test` accounts and revoke their refresh tokens in Firebase Authentication.

Example Firebase deployment commands (run with an authorized administrator account, with the web deployment between them):

```powershell
firebase deploy --project my-work-schedule-4dc10 --only functions
# Deploy the updated GitHub Pages application here and verify getMyAccess.
firebase deploy --project my-work-schedule-4dc10 --only firestore:rules,storage
```

Cloud Storage rules that consult Firestore require the Firebase-created cross-service IAM permission. The Firebase console or CLI will prompt for it during the first deployment.

## Verification checklist

- An email/password account absent from `allowedEmails` cannot initialize the app.
- A limited user cannot read `allowedEmails`, `roles`, audit logs, another user's reservations, or another user's `users/{uid}` documents.
- Welcome Packs receives only property name, dates, and channel; it never receives guest name, email, telephone, reservation number, or payment information.
- No reservation or property record is written to Local Storage, Session Storage, or Firestore's browser persistence.
- Browser code cannot fetch iCal URLs, the retired Apps Script endpoint, or a public CORS proxy.
- Airbnb invoice utilities do not retain a browser session by default, print reservation identifiers, or create guest-data screenshots.
- Inventory and property-settings pages redirect before initializing their managers when access is missing.
- A Storage upload over 10 MB or outside the approved attachment types is denied.
- `securityAudit` and `guestDataAccessAudit` contain the expected server-side events.

## Follow-up architecture work

The current `properties` documents combine directory fields with sensitive operational fields such as passwords and access details. Firestore rules cannot redact individual fields on a document read. Split these records into:

- `propertyDirectory`: non-secret fields needed by authorized operational apps;
- `properties/{id}/secure/config`: Wi-Fi passwords, access codes, complaint-book credentials, API/iCal secrets, and owner-sensitive data;
- server-only integration secrets in Secret Manager, never in Firestore documents readable by browsers.

After migration, narrow each app to the smallest collection and field set it needs, add emulator-based rule tests to CI, enable Firebase App Check enforcement, and configure monitoring alerts for abnormal guest-data reads or outbound integration activity.

Executable browser CDN dependencies are now version-pinned and integrity-checked. Firebase ES modules are version-pinned to their official `gstatic.com` URLs; moving all browser dependencies to reviewed, self-hosted artifacts remains follow-up supply-chain work.
