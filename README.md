# Atlantic Holiday - Work Schedule Calculator

Static web application for managing schedules, vacations, operations workflows, and property data.

## Structure

```text
horario/
├── index.html
├── inventory.html
├── property-settings.html
├── styles/
├── js/
│   ├── app/
│   │   └── main.js
│   ├── core/
│   │   ├── config.js
│   │   └── i18n.js
│   ├── shared/
│   │   ├── change-notifier.js
│   │   ├── enums.js
│   │   └── locations.js
│   └── features/
│       ├── admin/
│       ├── inventory/
│       ├── operations/
│       ├── properties/
│       └── scheduling/
└── tests/
    ├── smoke/
    └── unit/
        ├── core/
        ├── shared/
        └── features/
```

## Architecture

- `js/app/` contains application bootstrap and dependency wiring.
- `js/core/` contains cross-cutting runtime concerns.
- `js/shared/` contains reusable constants and low-level helpers.
- `js/features/` groups behavior by business area instead of keeping a flat pile of `*manager.js` files.

Public page entry modules:

- `index.html` -> `js/app/main.js`
- `inventory.html` -> `js/features/inventory/main.js`
- `property-settings.html` -> `js/features/properties/main.js`

## Development

Rules for new work:

- Put cross-feature runtime logic in `js/core/`.
- Put reusable constants/helpers in `js/shared/`.
- Put feature code in the matching `js/features/<feature>/`.
- Avoid adding new top-level `js/*.js` files unless you are creating a deliberate page entry point.

## Testing

The repo includes a zero-dependency browser test suite under `tests/`.

Coverage currently includes:

- core config and i18n behavior
- shared enums, locations, and notifier behavior
- scheduling domain logic
- cleaning bills, commission calculator, and welcome pack logic
- user-management controller behavior
- HTML and locale smoke checks

Run the headless suite with:

```powershell
C:\Program Files\nodejs\node.exe tests/run-headless.mjs
```
