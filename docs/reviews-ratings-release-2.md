# Reviews & Ratings — Release 2

Release 2 adds shared improvement work, an actionable review inbox and a property inspector that keeps the surrounding page in place.

## Improvement work

- One shared record per property and issue category, with a title, owner, priority and due date.
- Statuses: New, In progress, Monitoring, Resolved and Dismissed.
- Monitoring and resolution require completion notes or evidence. Dismissal requires a reason.
- Supporting reviews are grouped by stable review identity. Subsequent complaints appear in Attention for reassessment; they do not silently reopen resolved work.
- Activity records retain the actor, date, changed fields and notes. Optimistic revisions reject stale forms instead of overwriting a colleague's changes.
- Failed saves retain the draft and show an error. Reconnecting and receiving live snapshots preserve unsaved editor fields. Signing out clears the shared workspace and unlocks page scrolling.

## Tasks integration

An improvement can link to an existing task or create one in the existing Tasks workspace. New task creation and the improvement link use one Firestore transaction, with a deterministic task ID to prevent duplicate creation.

Once linked, Tasks owns the assignees, priority and due date. Reviews shows those current values and opens the task for editing. An inaccessible or deleted task is explicitly unavailable. Completing a task does not resolve the guest issue automatically; the improvement retains its own status and evidence.

## Review inbox and inspector

All imported reviews are available in pages of 25, with combined text, property, platform, date, rating, reply, owner and internal-handling filters. Priority sorting places recent low-rated reviews needing follow-up first. Date ranges exclude undated reviews.

Internal follow-up ownership, notes and handling status are stored separately from the platform reply. “Handled internally” never claims that a reply was published. A missing imported reply remains “Reply not captured” unless the source explicitly verified that the review is unanswered. Platform links open Airbnb or Booking.com for checking and replying.

The property inspector uses a right-hand drawer on desktop and the full width on mobile. Closing it preserves the page's filters, pagination, scroll and keyboard focus. New workflow labels and messages have English and Portuguese translations.

## Shared data and rollout

Deployment update: the Release 2 rules have now been published to `my-work-schedule-4dc10`. Before deployment, the live rules were verified to match the local rules exactly except for the missing `reviewWorkflows` block. The UI now distinguishes a failed, pending or disconnected load from an empty improvement list, and hides its creation controls and pagination until shared data is available. All 585 browser tests passed after this fix.

The new `reviewWorkflows` collection contains improvement and follow-up records. Reads require management privileges or Reviews & Ratings access; writes require management privileges, the current actor and an incremented revision. Record deletion is disabled. Existing task permissions remain in force.

**Deploy the updated `firestore.rules` before releasing the frontend.** No production rules or frontend deployment was performed during implementation. Until those rules are deployed, the UI reports shared work as unavailable and disables editing. There is no browser-only fallback for shared saves, and no migration of Release 1 review classifications is required.

## Verification

- Result: all 566 browser tests passed, as did the focused review-workflow Firestore emulator suite. The complete rules suite reached the schedule-directory checks but exceeded its 420-second timeout after emulator connection delays; a full rules pass is not claimed. The browser runner also reported its existing single resource 404.
- Browser unit/integration coverage includes evidence grouping, duplicate prevention, concurrent revisions, two subscribers, task linking, access restrictions, pagination, date handling, later complaints, failed saves, draft retention, session cleanup and focus restoration.
- Firestore emulator coverage exercises actual shared improvement writes, atomic linked task creation, internal follow-ups, permitted readers, denied unrelated readers, read-only users, stale revisions and deletion restrictions.
- Desktop and 390px mobile previews were inspected using the imported dataset, including Portuguese inbox copy. Draft refresh and improvement saving were exercised against an isolated test store.

Run the browser suite with `npm run test:browser`. Run all rules tests with `npm run test:firestore-rules`, or isolate this release's rules checks with:

```powershell
npx --yes firebase-tools@13.35.1 emulators:exec --only firestore --project demo-horario --config firebase.test.json "node tests/run-firestore-rules.mjs 8081 reviews"
```

The rules test fixture refreshes the PIN punch timestamp immediately before its valid write, so earlier checks cannot consume its 60-second freshness window. Review workflow checks run after the time-sensitive attendance checks.
