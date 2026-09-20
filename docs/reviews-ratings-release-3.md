# Reviews & Ratings — Release 3

The new Trends workspace adds 30/90/365-day comparisons, separate Airbnb and Booking.com charts, actual listing-score history and follow-up for completed improvements. Filters select platform, location and property. The interface retains the app's quiet surfaces and amber accent, with charts as the main visual, comparison tables for detail and links back to improvement work. Existing short transitions and drawer motion remain, including reduced-motion support.

## Calculation contracts

- Date windows use UTC calendar days. The selected period includes the current partial day; the previous period contains the preceding equal number of calendar days. The date ranges are displayed. Invalid and future review dates are excluded.
- Analysis uses deduplicated imported Airbnb/Booking.com records. Explicitly manual records are excluded. Legacy records without provenance remain imported because their origin cannot be reliably recovered. Archived properties are excluded.
- Average rating uses valid overall scores on each platform's own scale. Low-rating share uses overall ratings below 4.6/5 for Airbnb or 8.5/10 for Booking.com; low cleanliness sub-scores do not count as low overall ratings. Missing scores do not enter these denominators.
- Complaint frequency is the proportion of written reviews with a human-confirmed issue. Each review counts once, even with several confirmed categories. Pending classifications are shown for both periods. Zero confirmed complaints does not establish that no complaints occurred.
- Reply coverage reflects replies currently captured for reviews in each period, not the historical response rate at that time. Internal handling never counts as a platform reply.
- Differences require at least five eligible observations in both periods, using the denominator appropriate to each metric. Shares change in percentage points; average ratings change in native rating points. This minimum is a display safeguard, not a statistical-significance test. Property mix and imported coverage can differ between periods.
- Chart intervals divide the selected period into at most twelve groups. Empty groups remain gaps; groups below five ratings have hollow markers. Accessible tables give exact interval dates, averages and sample sizes. There are no invented scores or filled gaps.

## Replies and backlog

Backlog age covers selected-period reviews whose current platform reply is absent and whose internal follow-up is not handled. Confirmed unanswered reviews and uncaptured replies are reported separately. Internal handling must load successfully before the UI shows backlog totals. Undated reviews are excluded from these time-based figures, with their count displayed.

Median response time requires a captured reply and precise ISO review/response timestamps including time zones. Date-only values, collection/check times, reversed timestamps and future response dates are excluded. The sample count is displayed; unavailable timing is explicit.

## Actual listing-score history

Select a property to view saved successful `ratingHistory` observations on native platform scales. The last successful dated score can supply an actual observation when historical snapshots have not yet accumulated. A failed attempt never supplies a new observation. Duplicate timestamps, invalid scores and future observations are excluded. A single observation is shown as a point with an insufficient-history explanation.

No collection was triggered and no historical data was manufactured. New history accumulates through the Release 1 collector changes.

## Improvement outcomes

Monitoring and resolved improvements compare confirmed complaints about their own issue category, separately by platform. The anchor is the recorded monitoring/completion time, falling back to resolution time when needed. Reopened work is omitted until it reaches monitoring or resolution again.

Both sides use the same number of complete UTC days, up to the chosen 30/90/365-day limit and the days available after completion. The completion day and current partial day are excluded because many reviews have date-only timestamps. Written-review counts, date ranges, pending classifications and sample limitations remain visible. Newly completed work waits for complete days of feedback. Changes are observational, not causal claims.

Outcomes are paginated and link to the existing improvement inspector. Closing it preserves Trends filters, scroll and the originating platform's button focus. Tables scroll within the mobile viewport; the selected navigation tab stays visible after rerenders.

## Validation and rollout

All 584 browser tests passed. The browser runner reported its existing single resource 404; the isolated Release 3 UI checks recorded no JavaScript errors and no horizontal page overflow at 390px.

Run `npm run test:browser`. Release 3 coverage includes boundaries, missing/future dates, manual and archived exclusions, native scales, metric denominators, classification decisions, reply/backlog separation, timestamp reliability, missing chart intervals, real snapshot history, matched outcome windows, sample thresholds, filters, navigation and EN/PT translations.

Desktop and 390px mobile views were inspected against the local imported dataset. An isolated fixture exercised historical snapshots and before/after outcomes; it was not saved to production.

Release 3 adds no database writes or rule changes. Its improvement outcomes and handling-aware backlog use the shared Release 2 records, so the Release 2 Firestore rules still need to be deployed if that has not already happened.
