# AGENTS.md

## Commands

```powershell
npm run test:browser                  # headless browser tests (requires Edge)
npm run airbnb:download-invoices      # Airbnb invoice downloader utility
npm run airbnb:download-reservation-invoices  # per-reservation VAT downloader
```

Under the hood `test:browser` runs `node tests/run-headless.mjs`, which starts a local server and runs the zero-dep browser suite through Playwright on **Microsoft Edge** at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.

No lint, typecheck, format, or build commands exist. The app is pure CDN ES modules — no bundler.

## Architecture

- `js/app/main.js` — sole entry point for `index.html`; bootstraps all managers, Firebase auth, and page routing
- `js/features/inventory/main.js` — entry for `inventory.html`
- `js/features/properties/main.js` — entry for `property-settings.html`
- `js/features/` — each subfolder is a business domain (scheduling, operations, admin, properties, inventory, planning)
- `js/shared/` — cross-feature constants and helpers (enums, locations, app-access, email, change-notifier, access-roles)
- `js/core/` — runtime wiring (config, i18n)
- Feature managers in `js/features/<domain>/`; pure-logic helpers in matching `*-utils.js` files
- Locales: `locales/en.json` and `locales/pt.json`, loaded via `js/core/i18n.js` with `data-i18n` attributes and `data-lang-option` switchers

## Gotchas

- `#welcome-packs-page` and `#staff-page` must stay **outside** `#app-content`. Nesting them inside breaks navigation because `NavigationManager` hides `#app-content` for non-schedule routes.
- `firebase-config.js` in `.gitignore` is stale — Firebase config is hardcoded in `js/core/config.js`.
- Schedule back button is wired in both `navigation-manager.js` and `main.js`; keep both `data-target-page="timeClock"` aligned.
- Monthly schedule grid is **Monday-first** in `js/features/scheduling/views/monthly-schedule-view.js`.
- `summarizeAttendanceRecord()` must tolerate `null` records (first-time employee sessions).
- Preset `@horario.test` accounts are access-only and excluded from employee partitions/headcount.
- Employee self-service access = time clock + read-only monthly schedule only (no vacation-planner/stats/reference).
- The `welcomePack` Portuguese locale can still have mojibake; a runtime fallback `PT_WELCOME_PACK_TRANSLATIONS` in `welcome-pack-manager.js` overrides it — update both if changing PT copy.

## Testing

- Custom zero-dependency runner: `tests/test-harness.js` exports `describe`, `test`, `assert` (like a minimal Jest).
- Tests are plain ES modules imported in `tests/run.js` and run in-browser via `tests/index.html`.
- Suites cover: core (config, i18n), shared (enums, locations, notifier, email, access-roles), features (scheduling, operations, admin, properties, planning).
- New test files go in `tests/unit/features/<domain>/` and must be registered in `tests/run.js`.

## Key structural patterns

- `DataManager` uses `subscribeToDataChanges()` for multiple listeners; avoid replacing single callbacks.
- `NavigationManager` routes page switches — don't manually toggle `#landing-page` / feature page classes.
- Welcome Packs: costs in `welcome-pack-manager.js`, reusable summaries/calculations in `welcome-pack-utils.js`.
- Cleaning AH: page logic in `cleaning-ah-manager.js`, pure math/import/stat helpers in `cleaning-ah-utils.js`.
- Laundry Log: manager + utils split same way (`laundry-log-manager.js` / `laundry-log-utils.js`).
- Airbnb VAT downloader scripts live in `scripts/airbnb/`; the reservation variant uses 10 parallel workers and saves to Windows Downloads folder.
