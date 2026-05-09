# Firebase Functions for Horario

## Nuki setup

These functions let the website open Nuki doors without exposing the Nuki API token in browser code.

1. Generate a token in **Nuki Web > API > Generate API token**.
2. Set the token as a Firebase Functions secret:

```powershell
firebase functions:secrets:set NUKI_API_TOKEN
```

3. Deploy:

```powershell
firebase deploy --only functions
```

4. In the website, open **Nuki Doors** with a privileged account, click **Find devices**, then add each door using the `smartlockId`.

Give users access by adding `nukiDoors` in User Management app access, or by assigning a privileged role.

For opening most doors, `unlatch` is usually the action you want. `unlock` may only unlock the lock without pulling the latch.
