# Laundry disparity alerts (Google Apps Script)

This is the no-Blaze delivery worker for Laundry Log. Every five minutes it checks
completed laundry returns and emails only when a record enters a new disparity.
Editing an unresolved disparity does not send another message. If the return is
resolved and later becomes mismatched again, a new alert is sent.

## Install

1. Sign in to `script.google.com` as the Google Workspace mailbox that should send
   the alerts.
2. Create a standalone project named `Laundry Disparity Alerts`.
3. Replace `Code.gs` with this folder's `Code.gs`. Enable the manifest in Project
   Settings and replace `appsscript.json` too.
4. Run `authorizeAndInstallLaundryDisparityAlerts` once and approve the requested
   permissions.
5. Run `sendLaundryDisparityAlertTestEmail` to verify email delivery.

Installation records the current disparities as a baseline before creating the
five-minute trigger, so existing old differences do not generate a flood of email.
Only disparities created after installation are alerted.

Recipients come from the `recipients` array in the Firestore document
`laundryLogSettings/notifications` and default to `info@atlanticholiday.net`.
Set `enabled` to `false` to pause delivery.

The Workspace user authorizing the script must have IAM access to read and write
Cloud Firestore project `my-work-schedule-4dc10`. No Firebase Blaze plan is needed.
To remove the automation, run `removeLaundryDisparityAlertAutomation`.
