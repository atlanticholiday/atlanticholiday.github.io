# Airbnb Downloaders

These are local Playwright utilities for Airbnb host downloads from the Reservations page.

Why it exists:

- the main app cannot reach a logged-in Airbnb session directly from `index.html`
- Airbnb changes its UI often enough that a private local script is safer than hard-wiring this into the product
- the repo already has `playwright-core`, so a local browser-driven utility is the lowest-friction option

## 1. Monthly export downloader

This tool bulk-downloads Airbnb's monthly export from the Reservations page.

What it does:

- launches Edge or Chrome with a temporary local profile
- removes the temporary profile, including the reusable Airbnb session, after each run
- loops a month range
- opens the host Reservations page
- clicks the Airbnb `Export` flow
- downloads one PDF or CSV file per month into `downloads/airbnb-invoices/`
- writes a small manifest JSON file with the saved paths

What it does not do:

- bypass Airbnb's own availability rules
- fetch older documents than Airbnb exposes in the bulk export flow
- guarantee compatibility if Airbnb changes button names or dialog structure

## First run

```powershell
npm run airbnb:download-invoices -- --from 2025-10 --to 2026-03 --format pdf
```

If PowerShell blocks `npm.ps1` on your machine, run the script directly instead:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts/airbnb/invoice-downloader.mjs --from 2025-10 --to 2026-03 --format pdf
```

When the browser opens:

1. Log into Airbnb.
2. Open the host Reservations page.
3. Make sure the `Export` button is visible.
4. Press Enter in the terminal.

The script then reuses the current page URL as the start URL for the export loop.

## Session security

The safe default requires an interactive login for every run. Long-lived browser profiles are disabled by default because they contain reusable Airbnb session credentials.

If an encrypted, access-controlled accounting workstation genuinely requires a retained session, opt in explicitly and treat that directory like a password:

```powershell
npm run airbnb:download-invoices -- --from 2025-10 --to 2026-03 --format pdf --profile-dir "$env:LOCALAPPDATA\AtlanticHoliday\AirbnbProfile" --skip-login-prompt
```

Never put that directory inside a repository, shared drive, backup shared with third parties, or an unencrypted user profile. Revoke Airbnb sessions and remove the profile immediately after any suspected incident.

## Useful options

```powershell
npm run airbnb:download-invoices -- --help
```

Common flags:

- `--from YYYY-MM`
- `--to YYYY-MM`
- `--format pdf|csv`
- `--limit 1` to test one month first
- `--headless` once the flow is stable
- `--profile-dir PATH` only when accepting the risk of a retained Airbnb session
- `--browser-path "C:\Path\To\chrome.exe"` if auto-detection fails
- `--start-url "https://www.airbnb.com/hosting/reservations"` if you want to pin a specific page
- `--dry-run` to print the month list without opening the browser

## Practical advice

- Start with `--limit 1` and confirm the downloaded file is the document you actually need.
- Automatic debug screenshots are intentionally disabled because reservation pages can contain guest data.
- If accounting only needs totals and fees, Airbnb's earnings CSV export may be easier than per-month invoice PDFs.
- Exported invoices contain personal and financial information. Store them only in an encrypted, access-controlled location and delete them according to the company retention policy.

## 2. Per-reservation VAT invoice downloader

This tool reads the currently prepared Completed Reservations list, extracts each reservation's VAT invoice URL from Airbnb's own reservations API response, then exports the invoice page directly to PDF.

```powershell
npm run airbnb:download-reservation-invoices -- --pages 1 --concurrency 10
```

Direct Node fallback:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts/airbnb/reservation-invoice-downloader.mjs --pages 1 --concurrency 10
```

Recommended live workflow:

1. Run the command without `--headless`.
2. Log into Airbnb in the temporary browser profile.
3. Open `Completed Reservations`.
4. Apply the exact filters/date range you want.
5. Keep the list page visible and press Enter in the terminal.
6. Start with `--dry-run` and the right `--pages` value before a full run.

Important limits:

- This no longer needs to open the row actions menu for every reservation.
- The script reuses the reservations API request already visible on the prepared page, so your live Airbnb filters matter.
- Use `--pages N` to cap how many Reservations pages are scanned.
- Each invoice is opened via its `/invoice/...` URL and saved with Chromium's PDF export instead of the browser print dialog.
- It now exports with 10 parallel browser workers by default; override with `--concurrency N` if needed.
- The exporter only writes the PDF files themselves. It suppresses guest identifiers in console output, uses opaque PDF filenames, and does not capture debug screenshots.
- Reservations API pagination now waits briefly between pages and retries `429`/`503` responses with backoff.
- Airbnb says VAT invoices are only available in supported regions and only for the past 6 months.
- If Airbnb removes `host_vat_invoices` from the reservations payload, the script will need a different fallback.
