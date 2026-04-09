# AGENTS.md

## Purpose

This file gives future agents quick project context at the start of a new conversation. It is meant to reduce repeated discovery work and capture useful project-specific habits, patterns, and gotchas over time.

## Project Snapshot

- Project type: static web app
- Main entry point: `index.html`
- Main styles: `styles/`
- Main JavaScript entry/module roots: `js/app/`, `js/core/`, `js/shared/`, `js/features/`
- Localized strings: `locales/en.json`, `locales/pt.json`
- Other important standalone pages: `inventory.html`, `property-settings.html`, `safety-test.html`

## Working Style For This Repo

- Prefer small, targeted edits over broad refactors unless the task clearly calls for restructuring.
- Add new logic to the matching feature folder under `js/features/` and reserve `js/core/` and `js/shared/` for cross-feature code.
- Keep HTML, CSS, and JavaScript changes aligned. Many features in this repo touch more than one of those areas.
- Preserve existing naming and organizational patterns when extending a feature.
- Be careful with large files, especially `index.html`, because it is substantial and easy to change accidentally.

## Feature Change Checklist

When adding or modifying a feature, check whether it is worth updating this file with the added info of what you did. It is not mandatory, but do it when the information would be useful for any next agent.

Also add any test notes that might be useful, especially if:

- the feature has a non-obvious manual verification flow
- a bug fix depends on a specific repro sequence
- a behavior spans multiple files or pages
- there is a known edge case worth preserving

## Maintenance Rule

Update this file if you discover patterns, gotchas, or fixes that future agents should know about. This prevents the same mistakes from recurring.

Examples of useful additions:

- where a feature is wired across files
- surprising dependencies between modules
- manual test steps that reliably validate a change
- known pitfalls in data flow, rendering, or localization
- safe extension points for future work

## Testing Guidance

There does not appear to be an automated test suite documented at the repo root, so default to focused manual verification unless the task introduces or references a specific test command.

Test runner note:

- The repo now includes a zero-dependency browser runner at `tests/index.html`.
- It is intended to be opened through a local static server, not relied on via raw file double-clicking.
- Current suites cover constants, locales, i18n, calculator logic, welcome pack parsing, and lightweight HTML smoke checks.

When making changes, note the most relevant checks, for example:

- page loads without console errors
- impacted flows still work in the relevant HTML page
- translations still resolve correctly if UI text changed
- related manager modules still interact correctly after the edit
- styles still behave correctly on the affected screen
- update or extend `tests/` when a change affects reusable logic or stable DOM behavior

Test:

- Open `tests/index.html` through a local static server and confirm all suites pass after touching shared logic.
- Pattern: Property dashboard behavior on `index.html` now lives in `js/features/properties/properties-dashboard-controller.js`; keep `js/app/main.js` focused on app composition.
- Fix: The old return-from-settings writeback loop was removed because `property-settings-controller.js` already updates Firestore directly.
- Test: `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`

Pattern:

- `DataManager` now supports multiple listeners through `subscribeToDataChanges()`. Prefer that over replacing a single callback when UI modules need to react to shared data updates.
- Keep holiday/date rules in `js/features/scheduling/holiday-calculator.js` and employee normalization/status logic in `js/features/scheduling/employee-records.js`; `DataManager` should stay focused on Firestore orchestration.
- User-management admin page wiring now lives in `js/features/admin/user-management-controller.js`; `js/app/main.js` should stay focused on composing dependencies and startup flow.
- Page-specific public entry modules are `js/app/main.js`, `js/features/inventory/main.js`, and `js/features/properties/main.js`.
- Pattern: Welcome Packs navigation now routes through `NavigationManager` via `welcomePacksPageOpened`; keep page switching there instead of manually toggling `#landing-page` / `#welcome-packs-page` classes in feature code.
- Pattern: Cleaning AH now lives in `js/features/operations/cleaning-ah-manager.js` with pure calculation/import/stat helpers in `js/features/operations/cleaning-ah-utils.js`; keep CSV mapping and revenue math in the helper so the page manager stays focused on Firestore, filters, and UI state.
- Pattern: Cleaning AH manual check-out entries now save laundry as zero by default and rely on later association from `cleaningAhLaundryRecords`; keep linked-laundry net calculations in `cleaning-ah-utils.js` so dashboard totals and tables stay aligned.
- Pattern: Cleaning AH cleanings now support `Single entry` and `Batch entry` inside `js/features/operations/cleaning-ah-manager.js`; keep shared batch fields (date/category), per-row guest amount suggestions, and Firestore batch writes together there so cleaning entry mirrors the laundry workflow.
- Pattern: Cleaning AH cleanings now expose `Platform` / `Direct` in both single and batch entry inside `js/features/operations/cleaning-ah-manager.js`; keep the commission split driven by `reservationSource` and the actual net math in `js/features/operations/cleaning-ah-utils.js` so previews, saved rows, and imported data stay aligned.
- Pattern: Cleaning AH cleaning entry now also accepts optional inline laundry kg in both single and batch modes inside `js/features/operations/cleaning-ah-manager.js`; pass that through `createCleaningAhRecord()` so saved cleaning rows feed the laundry totals and the combined Laundry tab without needing a separate standalone record.
- Pattern: Cleanings stored-data rows now support inline quick laundry entry in `renderCleaningsTable()` / `saveCleaningLaundryRecord()` inside `js/features/operations/cleaning-ah-manager.js`; save those as linked `cleaningAhLaundryRecords` rows so the Cleanings net totals and the Laundry tab stay in sync from the same write.
- Pattern: Cleaning AH stored-table action cells now use Font Awesome icon buttons rendered from `renderTableActionButton()` in `js/features/operations/cleaning-ah-manager.js`; keep `aria-label`/`title` on those buttons so the tighter layout stays accessible.
- Pattern: Cleaning AH UI copy now routes through the shared `cleaningAh` locale blocks in `locales/en.json` and `locales/pt.json`; keep page scaffolding and `languageChanged` rerenders in `js/features/operations/cleaning-ah-manager.js` so the landing card, page header, and dynamic tables stay in sync with the selected language.
- Pattern: Cleaning AH laundry register ordering/filtering now uses `filterLaundryRegisterEntries()` in `js/features/operations/cleaning-ah-utils.js`, while single-vs-batch laundry entry state and Firestore batch saves stay in `js/features/operations/cleaning-ah-manager.js`.
- Pattern: Cleaning AH cleanings now also use local stored-register `Show` / `Order by` controls in `js/features/operations/cleaning-ah-manager.js`, with the actual register filter/sort rules kept in `filterCleaningRegisterEntries()` inside `js/features/operations/cleaning-ah-utils.js`.
- Pattern: Combined Laundry Register rows now support inline quick-linking to cleanings directly inside `renderLaundryTable()` / `saveLaundryLink()` in `js/features/operations/cleaning-ah-manager.js`; keep same-property cleanings prioritized in the dropdown so linking stays fast on busy days.
- Gotcha: `#welcome-packs-page` and `#staff-page` must stay outside `#app-content`; if they get nested under the schedule container, navigation will show only the body background because `NavigationManager` hides `#app-content` for non-schedule routes.
- Employee self-service attendance now also relies on the `allowedEmails` document storing `linkedEmployeeId`/`linkedEmployeeName`/`linkedEmployeeEmail`; this is synced from User Management so time-clock punch actions can still resolve the colleague when the full `employees` list is unavailable in that session.
- Digital clock-in/out now lives in the scheduling feature: attendance calculations are in `js/features/scheduling/attendance-records.js`, Firestore attendance orchestration is in `js/features/scheduling/data-manager.js`, and the employee/manager UI is rendered from `js/features/scheduling/ui-manager.js` into `#time-clock-page-content`.
- Clock-only employee mode is derived from a Firebase Auth email matching an active employee `email` field, unless the user has a privileged role such as `admin`, `manager`, or `supervisor`.
- Pattern: shared-tablet time clock mode now lives in the same `#time-clock-page` render path; kiosk filtering/initials helpers are in `js/features/scheduling/time-clock-station.js`, and the dedicated tablet login role key is `time-clock-station`.
- Pattern: the User Management page now includes an in-app `Time Clock Go-Live Checklist`; keep rollout/setup reminders there when the tablet flow or admin verification steps change.
- Pattern: the User Management screen now uses a wide admin workspace in `index.html` plus custom `user-management-*` styles in `styles/main.css`; keep the user directory as card rows rendered by `js/features/admin/user-management-controller.js` instead of reverting to inline checkbox lists.
- Pattern: User Management primary navigation now switches between `data-user-management-main-view="accounts|colleagues"` from the top tabs, while the hamburger drawer keeps only the secondary tools (`roles`, `test-users`, `rollout`) via `data-user-management-side-view(-target)`.
- Pattern: the User Management secondary tools now live in a hamburger-triggered right drawer (`#user-management-menu-toggle-btn`, `#user-management-drawer`); keep colleague access diagnostics in the main `#access-link-overview` workspace instead of moving them back into the drawer.
- Pattern: the new in-app future roadmap now lives in `js/features/planning/build-planner-manager.js`; keep the roadmap ideas, copy-ready Codex prompts, and local-only progress state together there instead of spreading static planning copy across `index.html`.
- Pattern: language switching is now multi-entry; reuse `data-lang-option="en|pt"` buttons and let `js/core/i18n.js` keep all visible switchers in sync instead of relying on a single header-only selector.
- Pattern: colleague attendance printouts still route through `#timesheet-modal`, but the mode selector there now switches between weekly and monthly views; keep printable attendance register changes in `js/features/scheduling/ui-manager.js` and period stepping logic in `js/features/scheduling/attendance-print-period.js`.
- Pattern: planned attendance-register hours now route through `js/features/scheduling/shift-hours.js`; keep `9:00-18:00`-style shifts visible in the print view, but use paid hours after the shared lunch deduction rule for weekly/monthly totals and overtime math.
- Pattern: time clock go-live hardening now spans `js/features/scheduling/data-manager.js`, `js/features/scheduling/ui-manager.js`, and `js/features/scheduling/time-clock-controls.js`; attendance sync state is surfaced from `DataManager`, shared-station idle reset lives in `UIManager`, and manual correction note validation is centralized in the helper.
- Pattern: schedule view button metadata now lives in `js/features/scheduling/schedule-view-config.js`; reuse that registry when adding or removing schedule tabs so `ScheduleManager` and `UIManager` stay aligned.
- Pattern: active schedule page rendering now routes through `js/features/scheduling/views/`; keep monthly, yearly, Madeira reference, stats, and shell summary changes in those modules instead of growing `ui-manager.js` further.
- Pattern: shared vacation storage now lives in `vacation_records` as well as legacy `employee.vacations`; normalization and merge helpers are in `js/features/scheduling/vacation-records.js`, and `DataManager` now backfills missing records plus exposes `getSharedVacationEntries()` for future colleague-facing vacation views.
- Pattern: the read-only vacation board now lives in `js/features/scheduling/views/vacation-board-view.js` with pure board shaping in `js/features/scheduling/views/vacation-board-view-model.js`; keep new board filters, summary metrics, and month slicing in the model so they stay testable.
- Pattern: linked employee users can now reach the shared vacation board from the time clock via `openSharedVacationBoardRequested`; `DataManager.canAccessVacationBoard()` / `isVacationBoardOnlyUser()` gate that path, and board-only users are forced into the `vacation-board` schedule view.
- Pattern: employee self-service access is now limited to the time clock plus the read-only monthly work schedule; keep the schedule CTA/routing in `js/app/main.js` and `js/features/scheduling/event-manager.js`, and keep employee schedule restrictions/read-only modal behavior in `js/features/scheduling/ui-manager.js`.
- User Management now exposes an `#access-link-overview` panel showing whether each active colleague is missing an email, missing app access, clock-only, or privileged; keep that in sync when changing login/role behavior.
- Fix: `summarizeAttendanceRecord()` must tolerate `null` records because first-time employee sessions render the time clock before any attendance document exists; regression coverage is in `tests/unit/features/scheduling/attendance-records.test.js`.
- Fix: vacation booking/edit/delete now flows through `js/features/scheduling/schedule-manager.js` and the modal-based planner; avoid reintroducing legacy inline vacation handlers in `event-manager.js`.
- Fix: the vacation planner now edits by stable vacation record id instead of employee vacation array index, so calendar/list clicks stay aligned once vacations come from the shared record layer.
- Fix: preset `@horario.test` accounts are now access-only and excluded from employee partitions; keep test login setup in `js/features/admin/user-management-controller.js` from creating staff records, and keep headcount filtering in `js/features/scheduling/employee-records.js`.
- Fix: Welcome Packs now renders an inline unavailable state when its Firestore reads fail, and `StaffManager` now distinguishes employee-directory loading/access errors from a genuinely empty staff list.
- Pattern: the Staff page now uses the newer `staff-page-shell` workspace layout in `index.html` plus `staff-*` styles in `styles/main.css`; keep active/archive workspace chrome and directory card rendering inside `js/features/scheduling/staff-manager.js` instead of rebuilding the page with inline utility markup.
- Fix: the Staff add-colleague flow now initializes weekday checkboxes from `StaffManager`/`UIManager` without requiring the schedule page to open first, and it persists `vacationAdjustment` during employee creation via `data-manager.js` and `employee-records.js`.
- Gotcha: the new vacation board is read-only inside the schedule workspace only; clock-only users are still routed to `#time-clock-page`, so broader colleague access needs separate navigation/access work.
- Gotcha: the schedule back button is wired in both `navigation-manager.js` and `js/app/main.js`; keep their `data-target-page="timeClock"` behavior aligned or board-only users will bounce back to landing.
- Pattern: the schedule page now uses the wider `schedule-page-container` wrapper on both the schedule header and `#main-app`; if the schedule starts feeling cramped again, adjust that shared width instead of changing only one container.
- Pattern: the schedule top bar is now schedule-specific via `schedule-dashboard-header` / `schedule-header-container`; keep that header compact and transparent because the dock below already carries the page context.
- Pattern: the compact schedule workspace dock lives above the schedule content and relies on `#schedule-shell-summary`, `#schedule-navigation-subtitle`, `#view-header-kicker`, and `#view-header-context`; keep those IDs inside the dock if the shell layout changes so `UIManager.updateView()` can refresh the active view copy and summary without reworking the schedule renderer.
- Pattern: the monthly schedule grid is Monday-first in `js/features/scheduling/views/monthly-schedule-view.js`; keep the weekday header order and leading-empty-cell offset math aligned when changing that view.
- Pattern: the Welcome Packs launcher now lives inside the landing page `#more-tools-section`; keep using the existing `#go-to-welcome-packs-btn` id so `NavigationManager` and access-mode UI logic keep working.
- Pattern: Welcome Packs now centers its primary workflow on `Material Costs`, `Property Charges`, and `Calculations` inside `js/features/operations/welcome-pack-manager.js`, with reusable summaries in `js/features/operations/welcome-pack-utils.js`; keep actual `chargedAmount` separate from the suggested item sell total so calculations and CSV exports reflect what was really billed per property.
- Pattern: Welcome Packs UI copy now lives under the shared `welcomePack` locale blocks in `locales/en.json` and `locales/pt.json`; keep `js/features/operations/welcome-pack-manager.js` reacting to `languageChanged` so the main workflow, Reservations, Presets, help, and iCal dialogs rerender with the active language.
- Pattern: automatic lunch deduction is computed in `summarizeAttendanceRecord()` for closed single-block days with one `clockIn`, one `clockOut`, no break punches, and at least 6 worked hours; keep printouts and self-service history aligned with that shared summary output.

Test:

- Shared scheduling behavior now has browser-suite coverage in `tests/unit/features/scheduling/`.
- Shared/core utilities are covered under `tests/unit/shared/` and `tests/unit/core/`.
- User-management rendering and admin actions are covered in `tests/unit/features/admin/user-management-controller.test.js`.
- Test: access gating for the shared vacation board now lives in `tests/unit/shared/access-roles.test.js`; if employee/station role behavior changes, rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: after changing employee/self-service access, verify an employee account opens the time clock first, can open only the read-only monthly schedule, cannot see vacation-planner/stats/reference tabs, and rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Digital attendance flows are covered in `tests/unit/features/scheduling/attendance-records.test.js`; after clock changes, run `C:\Program Files\nodejs\node.exe tests/run-headless.mjs` and manually verify clock-in, break start/end, clock-out, and a manager-side manual adjustment on `#time-clock-page`.
- Test: Cleaning AH calculation/import coverage now lives in `tests/unit/features/operations/cleaning-ah-utils.test.js`; after changing checkout revenue formulas or CSV mapping, run `C:\Program Files\nodejs\node.exe tests/run-headless.mjs` and manually verify adding a cleaning, previewing a CSV import, and saving a standalone laundry record on the new `Cleaning AH` page.
- Test: Cleaning AH language switching now also has coverage in `tests/unit/features/operations/cleaning-ah-manager.test.js`; after copy or formatting changes, rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs` and manually toggle EN/PT on the Cleaning AH page to confirm the landing card, header, filters, tables, and month/currency formatting all switch with the active locale.
- Test: after Cleaning AH cleaning entry changes, switch the Cleanings tab between `Single entry` and `Batch entry`, choose a property with existing history to confirm the guest amount autofills from the latest saved cleaning, save multiple same-day cleaning rows, and rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: after Cleaning AH reservation-source or quick-laundry changes, verify `Platform` vs `Direct` changes the preview commission immediately in both single and batch entry, then add linked laundry from a stored cleaning row and confirm the amount updates there and the new row also appears in the Laundry tab.
- Test: after Cleaning AH inline-laundry changes, enter kg directly in both single and batch cleaning entry, confirm the preview net drops immediately, save the rows, and verify the inline laundry also appears in the combined Laundry tab totals/register.
- Test: after Cleaning AH cleanings register changes, use the Cleanings tab `Show` / `Order by` controls to confirm rows can be narrowed to laundry-linked vs waiting cleanings and reordered by date, property, guest amount, and net, then rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: after Cleaning AH table action changes, manually verify the icon buttons still show clear browser tooltips on hover, remain tappable on mobile widths, and trigger the same add-laundry, edit, open, and delete flows as before.
- Test: on the Cleanings tab, confirm both single and batch entry still show the reservation selector, and confirm the stored cleanings table shows the Reservation column with `Platform` / `Direct` beside each row before rerunning `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: After Cleaning AH laundry changes, manually confirm the default laundry rate shows `2,60`, switch between `Single entry` and `Batch entry`, save multiple same-day laundry rows in one batch, and use the Combined laundry register `Show` / `Order by` controls to verify the table updates correctly.
- Test: In Combined Laundry Register, verify a standalone laundry row can be linked straight from the `Linked cleaning` column, that the dropdown surfaces same-property cleanings first, and that clearing the dropdown plus `Save link` removes the association.
- Test: the read-only vacation board state is covered in `tests/unit/features/scheduling/vacation-board-view-model.test.js`; after board changes, run `C:\Program Files\nodejs\node.exe tests/run-headless.mjs` and manually verify year switching, search, and department filtering on the schedule page.
- Test: after time clock or attendance print changes, open the time clock page as a manager, launch the attendance print view, switch between Weekly and Monthly, change the colleague picker, and then toggle the UI language to Portuguese to confirm both the page and print modal rerender in the selected language.
- Test: after planned-hour changes, open Attendance Print View for a colleague on a `9:00-18:00` Monday-Friday schedule and confirm the shift text still shows `9:00-18:00` while the planned weekly total shows `40:00`.
- Test: for go-live time clock checks, also switch the browser offline/online, confirm the sync status banner changes, verify a shared-station session resets after inactivity, and confirm manual attendance corrections reject empty or too-short reasons before saving.
- Test: shared vacation normalization and merge coverage now lives in `tests/unit/features/scheduling/vacation-records.test.js`; run `C:\Program Files\nodejs\node.exe tests/run-headless.mjs` after changing vacation storage or planner wiring.
- Test: after staff or Welcome Packs navigation changes, sign in with `test-admin@horario.test` / `Test1234!`, open Staff from the landing page and confirm colleague cards render, then open Welcome Packs and confirm the dashboard shell loads instead of failing silently.
- Test: after Welcome Packs changes, verify `Material Costs` can add/edit a material, `Property Charges` can load a preset and override the charged amount for a property, then confirm `Calculations` shows the updated cost vs charged totals and rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: after Welcome Packs localization changes, switch the app between EN/PT on the Welcome Packs header and confirm the main workflow, Reservations tabs, Presets modal, and add/edit material VAT preview all rerender in the selected language before rerunning `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: after Staff page changes, open Staff directly from the landing page before visiting Schedule, launch `Add Colleague`, confirm weekday checkboxes render immediately, save a colleague with a vacation adjustment, switch between Active and Archive, and rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: for the shared tablet kiosk, sign in with a `time-clock-station` account or use the manager station-mode toggle on `#time-clock-page`, search/select a colleague, save clock-in/break/clock-out actions, and confirm the screen returns to the colleague picker after a successful punch.
- Test: after User Management UI changes, open the page on desktop and mobile widths, confirm each access row keeps identity, role chips, and action buttons aligned, then toggle at least one role and trigger `Reset Password` for a non-test user to verify the refreshed card layout stays intact.
- Test: after Build Planner changes, open `Build Planner` from the landing page, change a few item statuses, reload the app to confirm they persist from local storage, switch EN/PT to confirm the chrome rerenders, and rerun `C:\Program Files\nodejs\node.exe tests/run-headless.mjs`.
- Test: on `#app-content`, switch between the Planning and Reference schedule tab groups, open Vacation Planner, and confirm upcoming vacation cards open the booking modal for the correct colleague/date range.
- Test: after schedule shell changes, verify the workspace dock stays visible near the top while scrolling, Monthly still shows the desktop grid plus mobile cards correctly, Yearly and Stats switch cleanly, and the Madeira reference tabs still swap without duplicating click handlers.
- Test: after monthly calendar layout changes, confirm the desktop weekday headers run Monday through Sunday and that months starting on Sunday still align the 1st under Sunday instead of shifting the rest of the grid.
- Pattern: standalone browser automation utilities now live under `scripts/`; keep account/session artifacts out of the app runtime and ignore `.airbnb-playwright/` plus `downloads/airbnb-invoices/`.
- Test: the Airbnb invoice downloader is a local Node utility at `scripts/airbnb/invoice-downloader.mjs`; verify with `npm run airbnb:download-invoices -- --help`, then do a one-month live check with `--limit 1` after logging into Airbnb manually.
- Pattern: the Airbnb per-reservation VAT downloader lives at `scripts/airbnb/reservation-invoice-downloader.mjs`; keep the user-prepared Reservations list as the source of truth instead of hard-coding Airbnb filters into the script, note that it now exports with 10 parallel browser workers by default, saves into the Windows Downloads folder, and uses `--pages` when you need more than the first Airbnb results page.
- Pattern: the landing page now exposes `#go-to-airbnb-reservation-invoices-btn` / `#airbnb-reservation-invoices-page` as a helper page for the local Airbnb VAT exporter; it can open Airbnb and copy terminal commands, but it cannot launch PowerShell directly from the browser.
- Test: for individual Airbnb reservation invoices, first prepare the filtered Completed Reservations list in a real Airbnb host session, run `npm run airbnb:download-reservation-invoices -- --dry-run` to confirm the detected reservation codes, then repeat with `--limit 3` before a full run.
- Pattern: the landing page phone header now uses `landing-dashboard-header`, `landing-header-actions`, `landing-language-switcher`, and `landing-sign-out-btn`; keep the compact mobile overrides in `styles/main.css` so the `EN`/`PT` switcher stays visible on narrow browsers.
- Test: on a roughly 390px-wide mobile browser, open the landing page in both English and Portuguese and confirm the header keeps the brand, language switcher, and sign-out control on one line without clipping.

## Suggested Update Format

If you add notes here after completing work, keep them compact and practical. Prefer entries such as:

- `Pattern:` Short reusable implementation note
- `Gotcha:` Easy-to-miss behavior or dependency
- `Test:` Manual verification steps for a changed feature
- `Fix:` Brief summary of an important bug fix and where it lives
