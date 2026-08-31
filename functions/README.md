# Firebase Functions for Horario

## Deployment

These functions provide authenticated application access, administrator account and role management, password-reset links, and limited reservation and property-directory data.

Deploy with an authorized Firebase administrator account:

```powershell
firebase deploy --only functions
```

## Retired door integration

The Nuki Doors app and its backend handlers have been removed. Source changes alone do not remove previously deployed resources. When releasing this change:

- Confirm deletion of the retired `nukiListDoors`, `nukiDoorAction`, `nukiListDevices`, `nukiSaveDoor`, and `nukiDeleteDoor` functions if Firebase reports them during deployment.
- Deploy the updated Firestore rules, which deny access to the retired collections through the default deny rule.
- Revoke the old Nuki API token and remove the unused `NUKI_API_TOKEN` secret and any `NUKI_DOORS_JSON` environment setting after the old functions are removed.

Existing door configuration and audit records are not deleted by this code change; review retention requirements before removing stored records.
