# Heated-pool checkout reminders (Google Apps Script)

This is the no-Blaze delivery worker for the Heated Pools app. It runs under an
Atlantic Holiday Google Workspace account and sends reminder emails with
`MailApp` one day before checkout. Recipients remain editable in the app under
Heated Pools > Settings and default to `info@atlanticholiday.net`.

## Install

1. Sign in to `script.google.com` as the Workspace mailbox that should send the
   reminder.
2. Create a standalone project named `Heated Pool Checkout Reminders`.
3. Replace `Code.gs` with the repository's `Code.gs` and enable the manifest in
   Project Settings before replacing `appsscript.json`.
4. Run `authorizeAndInstallHeatedPoolReminders` once and approve the requested
   permissions.
5. Run `previewTomorrowHeatedPoolReminders` to verify Firestore access without
   sending an email.

The trigger runs during the 09:00-10:00 window in `Europe/Lisbon`, because Apps
Script time-driven triggers choose a stable time within the selected hour.

The Workspace user authorizing the script must have IAM access to read and write
Cloud Firestore project `my-work-schedule-4dc10`. The script requests the narrow
`datastore`, external-request, send-mail, and trigger-management scopes.

To stop the automation, run `removeHeatedPoolReminderAutomation`.
