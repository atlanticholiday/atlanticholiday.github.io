# Reviews & Ratings — Release 1

The default Attention workspace groups recent reviews without captured replies, below-target ratings, potential declines, classifications awaiting a decision, confirmed recurring complaints, and collection problems. Properties defaults to a table; an existing saved card preference is preserved. Portfolio metrics start collapsed on phones.

## Metric contracts

- Platform scores remain on their native 5- and 10-point scales. Property averages exclude missing/invalid scores. Weighted averages use review counts for properties with both a valid score and positive count; their denominators are displayed. These estimates use rounded headline scores, not individual review scores.
- Cleanliness is displayed independently for each platform, with its own property denominator. A low cleanliness sub-score creates a score alert, not an extra complaint mention.
- Coverage distinguishes platform totals from deduplicated imported records. New manual records are marked `origin: manual`. Legacy records without provenance cannot always be distinguished. Unknown review dates are excluded from time-based queues.
- Reply and recurrence queues use the last 90 days. Reply absence means no reply was captured; users must verify on the platform. Reply flags count as evidence of a reply even if its text was not captured.
- Decline alerts compare imported rating averages in the last 30 days and previous 30 days. Both windows need at least five ratings; the minimum drop is 0.2/5 or 0.4/10. This is not a historical platform headline-score comparison.

## Evidence and persistence

Complaint suggestions use conservative phrase matching with sentence/contrast boundaries and negation handling. English, Portuguese, Spanish, French and German phrases are supported, but this is not general language understanding. Neutral topic mentions require human confirmation. Each finding exposes its original passage; users can confirm, dismiss or reassess it. Recurrence requires two confirmed, dated review findings for the same property, platform and category.

Decisions use stable hashes of review identity, category and passage. Changed passages require reassessment. They persist through the existing local overrides and `settings/propertyReviewOverrides` Firestore document. A shared write failure is shown explicitly; it is not represented as a successful shared save. Existing access rules apply.

## Collection and history

Refresh data only reloads `server-data/property-reviews.json`. It distinguishes changed, unchanged, malformed and failed loads. Per-platform status shows last successful rating collection, last attempt, and written-review collection where known. Missing timestamps remain unknown; a dataset timestamp is never substituted for a listing's success time. Ratings older than 14 days are stale.

The collection script now preserves last successful scores and records `lastSuccessAt`, `reviewsCollectedAt`, and `ratingHistory`. Snapshots are created from actual successful dated observations, including the previous observation when known, without invented intervening history. A ratings-only run does not advance written-review freshness. These fields will populate on future collection runs; no live collection is triggered by the UI changes.

## Validation

Run `npm run test:browser` in Microsoft Edge. The Release 1 suite covers classification examples, human decisions, metric denominators, coverage, date exclusions, queue ordering, decline sample sizes, failure preservation, snapshots, focus, locale copy, cached replies, and refresh failures. Desktop and phone layouts can be reviewed with the local dataset without connecting to production Firestore.

Shared improvement tasks, owners/due dates, the full review inbox, and trend charts belong to subsequent releases.
