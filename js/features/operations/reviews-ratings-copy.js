import { WORKFLOW_COPY } from './reviews-workflow-copy.js';
import { TRENDS_COPY } from './reviews-trends-copy.js';
import { WORKSPACE_COPY } from './reviews-workspace-copy.js';
// English fallback also keeps isolated browser previews and tests usable before i18n init.
export const REVIEWS_COPY = {
  ...WORKFLOW_COPY,
  ...TRENDS_COPY,
  portfolio: 'Portfolio overview', target: 'Internal target: {{target}}',
  attention: 'Attention', properties: 'Properties', improvements: 'Improvements', reviews: 'Review inbox',
  title: 'Reviews & Ratings', subtitle: 'Guest feedback and property performance', back: 'Back',
  refresh: 'Refresh data', refreshing: 'Refreshing…', dataset: 'Dataset collected', unknownDate: 'Unknown date',
  refreshHelp: 'Reloads the latest saved collection. Platform collection runs separately.',
  refreshed: 'Saved collection loaded.', unchanged: 'The saved collection has not changed.',
  refreshFailed: 'Could not refresh data. Showing previously loaded records.', loading: 'Loading saved reviews…',
  average: 'Property average', weighted: 'Weighted by review count', averageMode: 'Rating calculation',
  averageHelp: 'Each rated property has equal weight. Weighted averages use platform review counts and rounded headline scores; they are estimates, not platform portfolio ratings.',
  ratedProperties: '{{count}} rated properties', weightedBasis: '{{count}} properties · {{reviews}} reviews used as weights',
  cleanliness: 'Cleanliness · property averages', cleanBasis: '{{count}} properties with cleanliness scores',
  coverage: 'Review coverage', imported: '{{count}} imported records', reported: '{{count}} platform-reported reviews',
  coverageHelp: 'Analysis uses imported records only. Platform totals may include reviews that could not be imported. Manually added records are excluded from imported counts.',
  unknownDates: '{{count}} imported records have unknown dates and are excluded from time-based queues.',
  countsKnown: 'Review totals available for {{count}} platform listings.',
  all: 'All attention', replies: 'Check replies', ratings: 'Below target', recurring: 'Recurring complaints', declining: 'Declining properties', classifications: 'Review classifications', data: 'Data problems',
  attentionHelp: 'Replies and recurring complaints cover the last 90 days. Low-rated replies come first. Check reply status on the platform before responding.',
  declineHelp: 'Declines compare imported scores over the last 30 days with the previous 30: at least 5 ratings in each period and a drop of 0.2/5 or 0.4/10.',
  search: 'Search property, location or feedback', platform: 'Platform', allPlatforms: 'All platforms',
  results: '{{count}} items', empty: 'No items match this queue', emptyHelp: 'Try another queue or clear your filters. Missing data is tracked under Data problems.',
  replyReason: 'No reply captured · review is {{days}} days old', lowScore: 'Rating {{score}}/{{max}} is below the {{target}} alert threshold.',
  lowClean: 'Cleanliness {{score}}/{{max}} is below the {{target}} target.',
  declineReason: 'Imported average fell from {{before}} to {{after}} / {{max}} ({{beforeCount}} → {{afterCount}} reviews).',
  uncertainReason: 'Topic mentioned; the wording needs a human decision.', suggestedReason: 'Possible complaint detected. Confirm or dismiss after reading the evidence.',
  recurringReason: '{{count}} confirmed complaints in the last 90 days.',
  failed: 'Last collection failed', stale: 'Collection is over 14 days old', unknown: 'Current rating or collection date unavailable', unlinked: 'No listing connected', current: 'Collection up to date',
  lastSuccess: 'Last successful rating collection', lastAttempt: 'Last attempt', reviewCollection: 'Written reviews collected',
  dataHealth: 'Collection status', dataHealthHelp: 'A recent dataset timestamp does not mean every listing was collected successfully.',
  openProperty: 'View property', openReviews: 'Check reviews', openSettings: 'Edit listing', evidence: 'Review evidence',
  confirm: 'Confirm issue', dismiss: 'Dismiss', restore: 'Reassess', confirmed: 'Confirmed', dismissed: 'Dismissed', pending: 'Needs review',
  evidenceHelp: 'Suggestions use phrase matching in English, Portuguese, Spanish, French and German. They can miss context; confirm before treating a suggestion as a recurring complaint.',
  decisionSaved: 'Classification saved.', decisionLocal: 'Saved on this device. Shared saving failed; retry when connected.',
  previous: 'Previous', next: 'Next', page: 'Page {{page}} of {{pages}}', close: 'Close',
  cleanlinessCategory: 'Cleanliness', noiseCategory: 'Noise', wifiCategory: 'Wi-Fi / Internet', waterCategory: 'Water / Shower', bedsCategory: 'Beds / Comfort', kitchenCategory: 'Kitchen / Appliances', parkingCategory: 'Parking', checkinCategory: 'Check-in / Access', acCategory: 'AC / Heating', descriptionCategory: 'Listing accuracy', locationCategory: 'Location', hostCategory: 'Communication', spaceCategory: 'Space', maintenanceCategory: 'Maintenance',
  ...WORKSPACE_COPY
};

export function reviewText(key, values = {}) {
  const translated = globalThis.window?.i18n?.getNestedValue?.(globalThis.window.i18n.translations[globalThis.window.i18n.currentLang], `reviewsDashboard.${key}`);
  let text = translated || REVIEWS_COPY[key] || key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
}
