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
- Digital clock-in/out now lives in the scheduling feature: attendance calculations are in `js/features/scheduling/attendance-records.js`, Firestore attendance orchestration is in `js/features/scheduling/data-manager.js`, and the employee/manager UI is rendered from `js/features/scheduling/ui-manager.js` into `#time-clock-page-content`.
- Clock-only employee mode is derived from a Firebase Auth email matching an active employee `email` field, unless the user has a privileged role such as `admin`, `manager`, or `supervisor`.
- User Management now exposes an `#access-link-overview` panel showing whether each active colleague is missing an email, missing app access, clock-only, or privileged; keep that in sync when changing login/role behavior.

Test:

- Shared scheduling behavior now has browser-suite coverage in `tests/unit/features/scheduling/`.
- Shared/core utilities are covered under `tests/unit/shared/` and `tests/unit/core/`.
- User-management rendering and admin actions are covered in `tests/unit/features/admin/user-management-controller.test.js`.
- Digital attendance flows are covered in `tests/unit/features/scheduling/attendance-records.test.js`; after clock changes, run `C:\Program Files\nodejs\node.exe tests/run-headless.mjs` and manually verify clock-in, break start/end, clock-out, and a manager-side manual adjustment on `#time-clock-page`.

## Suggested Update Format

If you add notes here after completing work, keep them compact and practical. Prefer entries such as:

- `Pattern:` Short reusable implementation note
- `Gotcha:` Easy-to-miss behavior or dependency
- `Test:` Manual verification steps for a changed feature
- `Fix:` Brief summary of an important bug fix and where it lives
