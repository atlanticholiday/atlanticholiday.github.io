import { describe, test, assert } from '../../../test-harness.js';
import { resetDom } from '../../../test-utils.js';
import { buildTrendsReport, trendWindows, trendDelta, listingScoreHistory, improvementOutcome, reviewTrendSeries, trendRecords } from '../../../../js/features/operations/reviews-trends-utils.js';
import { classifyReviewIssues } from '../../../../js/features/operations/review-quality-utils.js';
import { ReviewsRatingsManager } from '../../../../js/features/operations/reviews-ratings-manager.js';
import { TRENDS_COPY } from '../../../../js/features/operations/reviews-trends-copy.js';
import { renderTrends } from '../../../../js/features/operations/reviews-trends-view.js';

const now = Date.parse('2026-09-20T12:00:00Z');
const review = (id, date, score = 3, extras = {}) => ({ id, sourceId: id, author: id, platform: 'Airbnb', date, score, comment: 'The wifi was slow.', ...extras });
const property = reviews => ({ id: 'villa', name: 'Villa', location: 'Funchal', airbnb: { reviews } });
const confirmedProperty = reviews => {
  const p = property(reviews); p.insightDecisions = {};
  for (const r of reviews) for (const f of classifyReviewIssues(r)) p.insightDecisions[f.key] = 'confirmed';
  return p;
};

describe('Reviews Release 3 performance tracking', () => {
  test('calendar windows include today and partition previous periods without overlap', () => {
    const windows = trendWindows(30, now);
    assert.equal(new Date(windows.current.start).toISOString(), '2026-08-22T00:00:00.000Z');
    assert.equal(windows.previous.end, windows.current.start);
    assert.equal(windows.previous.end-windows.previous.start,30*86400000);
    const p = property([review('boundary','2026-08-22'),review('previous','2026-08-21T23:59:59Z'),review('now',new Date(now).toISOString())]);
    const result=buildTrendsReport([p],{days:30},[],now).platforms[0];
    assert.equal(result.current.count,2); assert.equal(result.previous.count,1);
    assert.equal(trendWindows('invalid',now).days,90);
  });

  test('missing dates, future dates, archived properties and manual reviews do not enter comparisons', () => {
    const p=property([review('good','2026-09-10'),review('unknown',''),review('future','2026-09-21'),review('manual','2026-09-10',3,{origin:'manual'})]);
    const result=buildTrendsReport([p,{...p,id:'archived',archived:true}],{days:30},[],now);
    assert.equal(result.platforms[0].current.count,1);
    assert.equal(result.unknownDates,1);assert.equal(result.futureDates,1);assert.equal(result.manual,1);
  });

  test('platform averages keep native scales and only valid ratings in denominators', () => {
    const p=property([review('one','2026-09-10',4),review('two','2026-09-11',5),review('missing','2026-09-12',null),review('invalid','2026-09-13',6)]);
    p.booking={reviews:[review('booking','2026-09-10',8,{platform:'Booking.com'})]};
    const result=buildTrendsReport([p],{days:30},[],now);
    assert.equal(result.platforms[0].current.average,4.5);assert.equal(result.platforms[0].current.rated,2);
    assert.equal(result.platforms[0].current.lowShare,50);assert.equal(result.platforms[1].current.average,8);
  });

  test('low overall rating share does not count a low cleanliness sub-score', () => {
    const result=buildTrendsReport([property([review('r','2026-09-10',5,{cleanlinessScore:1})])],{},[],now);
    assert.equal(result.platforms[0].current.low,0);
  });

  test('complaints require confirmation and count each written review once', () => {
    const p=confirmedProperty([review('confirmed','2026-09-10',3,{comment:'The wifi was slow. The shower was cold.'})]);
    p.airbnb.reviews.push(review('pending','2026-09-10'),review('blank','2026-09-10',5,{comment:''}));
    const result=buildTrendsReport([p],{},[],now).platforms[0].current;
    assert.equal(result.written,2);assert.equal(result.complaints,1);assert.equal(result.complaintShare,50);assert.equal(result.pending,1);
  });

  test('small samples suppress changes without hiding observed averages', () => {
    assert.equal(trendDelta({average:4,rated:4},{average:3,rated:9},'average','rated'),null);
    assert.equal(trendDelta({average:4,rated:5},{average:3,rated:5},'average','rated'),1);
    assert.equal(trendDelta({average:null,rated:5},{average:3,rated:5},'average','rated'),null);
  });

  test('backlog uses current handling and keeps absent replies separate from confirmed unanswered', () => {
    const p=property([review('unknown','2026-09-19'),review('unanswered','2026-09-10',3,{responseStatus:'unanswered',responseCheckedAt:'2026-09-20'}),review('replied','2026-09-10',3,{response:'Thanks'}),review('handled','2026-09-10')]);
    const result=buildTrendsReport([p],{},[{propertyId:'villa',reviewKey:'Airbnb:handled',status:'handled'}],now).platforms[0].current;
    assert.equal(result.replied,1);assert.equal(result.replyCoverage,25);assert.equal(result.backlog,2);
    assert.equal(result.confirmedUnanswered,1);assert.equal(result.uncaptured,1);assert.deepEqual(result.ages,[1,1,0,0]);
  });

  test('response duration requires precise ordered timestamps and an actual reply', () => {
    const p=property([
      review('precise','2026-09-10T12:00:00Z',3,{response:'Thanks',responseDate:'2026-09-10T16:00:00Z'}),
      review('dateOnly','2026-09-10',3,{response:'Thanks',responseDate:'2026-09-11'}),
      review('reversed','2026-09-10T12:00:00Z',3,{response:'Thanks',responseDate:'2026-09-10T11:00:00Z'}),
      review('checked','2026-09-10T12:00:00Z',3,{responseCheckedAt:'2026-09-11T12:00:00Z'}),
      review('futureReply','2026-09-10T12:00:00Z',3,{response:'Thanks',responseDate:'2026-09-22T12:00:00Z'})
    ]);
    const result=buildTrendsReport([p],{},[],now).platforms[0].current;
    assert.equal(result.responseHours,4);assert.equal(result.responseSample,1);
  });

  test('empty chart intervals stay null instead of inventing zeros or carrying scores forward', () => {
    const series=reviewTrendSeries(trendRecords([property([review('r','2026-09-10',4)])]),'Airbnb',trendWindows(30,now));
    assert.equal(series.filter(p=>p.value!==null).length,1);assert.ok(series.some(p=>p.value===null));
    assert.equal(series.reduce((n,p)=>n+p.count,0),1);
  });

  test('listing history only uses actual observations on the correct scale', () => {
    const p={airbnb:{status:'error',lastChecked:'2026-09-20',score:4.8,ratingHistory:[{at:'2026-09-10',score:4.5},{at:'2026-09-10',score:4.6},{at:'2026-09-12',score:8},{at:'2026-09-21',score:4.9}]}};
    const history=listingScoreHistory(p,'Airbnb',trendWindows(30,now).current,now);
    assert.equal(history.length,1);assert.equal(history[0].score,4.6);
    assert.equal(listingScoreHistory({airbnb:{score:4.9}},'Airbnb',trendWindows(30,now).current,now).length,0);
  });

  test('historical collection fallback uses its last successful date after a failed attempt', () => {
    const p={airbnb:{status:'error',lastChecked:'2026-09-20',lastSuccessAt:'2026-09-15',score:4.8,reviewCount:8}};
    const history=listingScoreHistory(p,'Airbnb',trendWindows(30,now).current,now);
    assert.equal(history[0].at,Date.parse('2026-09-15'));assert.equal(history[0].reviewCount,8);
  });

  test('outcomes compare equal complete days and exclude the completion day and today', () => {
    const p=confirmedProperty([review('before','2026-09-09'),review('completion','2026-09-10'),review('after','2026-09-11'),review('today','2026-09-20')]);
    const outcome=improvementOutcome({status:'monitoring',category:'wifi',monitoringSince:'2026-09-10T15:00:00Z'},p,'Airbnb',30,now);
    assert.equal(outcome.days,9);assert.equal(outcome.before.count,1);assert.equal(outcome.after.count,1);
    assert.equal(outcome.beforeWindow.end-outcome.beforeWindow.start,outcome.afterWindow.end-outcome.afterWindow.start);
    assert.equal(outcome.delta,null);
  });

  test('outcomes have a waiting state for newly completed work and ignore reopened work', () => {
    const work={status:'resolved',category:'wifi',resolvedAt:'2026-09-20T10:00:00Z'};
    assert.equal(improvementOutcome(work,property([]),'Airbnb',30,now).days,0);
    assert.equal(improvementOutcome({...work,status:'inProgress'},property([]),'Airbnb',30,now),null);
    assert.equal(improvementOutcome({...work,resolvedAt:'2026-09-21'},property([]),'Airbnb',30,now),null);
  });

  test('location, property and platform filters apply together', () => {
    const p=property([review('r','2026-09-10')]);
    const result=buildTrendsReport([p,{...p,id:'other',location:'Porto'}],{location:'Funchal',property:'villa',platform:'Airbnb'},[],now);
    assert.equal(result.properties.length,1);assert.equal(result.platforms.length,1);assert.equal(result.platforms[0].current.count,1);
  });

  test('sufficient outcome samples compare the relevant category rather than all complaints', () => {
    const before=Array.from({length:5},(_,i)=>review(`before-${i}`,`2026-09-0${i+1}`));
    const after=Array.from({length:5},(_,i)=>review(`after-${i}`,`2026-09-${11+i}`,3,{comment:'The shower was cold.'}));
    const outcome=improvementOutcome({status:'resolved',category:'wifi',monitoringSince:'2026-09-10T12:00:00Z'},confirmedProperty([...before,...after]),'Airbnb',30,now);
    assert.equal(outcome.comparable,true);assert.equal(outcome.before.confirmed,5);assert.equal(outcome.after.confirmed,0);assert.equal(outcome.delta,-100);
  });

  test('missing shared handling is not presented as a confirmed backlog total', () => {
    const html=renderTrends([property([review('r','2026-09-10')])],{workflowConnected:false});
    assert.ok(html.includes(TRENDS_COPY.trendBacklogUnavailable));
    assert.ok(!html.includes(`${TRENDS_COPY.trendBacklog} ·`));
  });

  test('Trends navigation and filters preserve the selected view through a drawer round trip', () => {
    resetDom('<div id="reviews-ratings-page"></div>');localStorage.clear();
    const manager=new ReviewsRatingsManager();manager.state.rawProperties=[property([])];manager.updateCalculations();manager.render();
    document.querySelector('[data-tab="trends"]').click();
    assert.equal(manager.state.activeTab,'trends');
    const select=document.getElementById('trend-days');select.value='365';select.dispatchEvent(new Event('change'));
    assert.equal(manager.state.trends.days,365);
    manager.state.selectedProperty=manager.state.rawProperties[0];manager.render();
    document.getElementById('modal-close-btn').click();
    assert.equal(manager.state.activeTab,'trends');assert.equal(document.getElementById('trend-days').value,'365');
    assert.ok(document.body.textContent.includes(TRENDS_COPY.trendChooseHistory));
    document.body.style.overflow='';
  });

  test('all performance labels have English and Portuguese translations', async () => {
    for(const lang of ['en','pt']) {
      const translations=await fetch(`/locales/${lang}.json`).then(r=>r.json());
      for(const key of Object.keys(TRENDS_COPY)) assert.ok(translations.reviewsDashboard[key],`${lang}: ${key}`);
    }
  });
});
