# Firebase Functions for Horario

## Deployment

These functions provide authenticated application access, administrator account and role management, password-reset links, and limited reservation and property-directory data.

Deploy with an authorized Firebase administrator account:

```powershell
firebase deploy --only functions
```

## Heated-pool checkout reminder email

`sendHeatedPoolCheckoutReminders` runs every day at 09:00 in the `Europe/Lisbon`
time zone. It emails the recipients configured in the Heated Pools Settings page
for active pools whose heated-pool reservation checks out the following day.
Each reservation reminder is claimed and recorded in Firestore so retries do not
send it twice.

Configure an SMTP connection URL as a Firebase secret before the first deploy:

```powershell
firebase functions:secrets:set HEATED_POOL_SMTP_URL --project my-work-schedule-4dc10
firebase deploy --only functions:sendHeatedPoolCheckoutReminders --project my-work-schedule-4dc10
```

The URL uses Nodemailer's standard `smtp://` or `smtps://` connection format.
The sender defaults to `Atlantic Holiday <info@atlanticholiday.net>` and can be
overridden during deployment with the `HEATED_POOL_EMAIL_FROM` parameter.

## Retired door integration

The Nuki Doors app and its backend handlers have been removed. Source changes alone do not remove previously deployed resources. When releasing this change:

- Confirm deletion of the retired `nukiListDoors`, `nukiDoorAction`, `nukiListDevices`, `nukiSaveDoor`, and `nukiDeleteDoor` functions if Firebase reports them during deployment.
- Deploy the updated Firestore rules, which deny access to the retired collections through the default deny rule.
- Revoke the old Nuki API token and remove the unused `NUKI_API_TOKEN` secret and any `NUKI_DOORS_JSON` environment setting after the old functions are removed.

Existing door configuration and audit records are not deleted by this code change; review retention requirements before removing stored records.
