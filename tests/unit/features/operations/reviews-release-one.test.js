import { describe, test, assert } from '../../../test-harness.js';
import { resetDom } from '../../../test-utils.js';
import { classifyReviewIssues, platformHealth, mergeCollectedPlatform, reviewTime } from '../../../../js/features/operations/review-quality-utils.js';
import { analysePropertyInsights, calculatePortfolioSummary, getAllPropertyReviews } from '../../../../js/features/operations/reviews-ratings-utils.js';
import { buildAttentionQueue } from '../../../../js/features/operations/reviews-attention-utils.js';
import { ReviewsRatingsManager } from '../../../../js/features/operations/reviews-ratings-manager.js';
import { i18n } from '../../../../js/core/i18n.js';

const now = Date.parse('2026-09-20T12:00:00Z');
const ago = days => new Date(now - days * 86400000).toISOString();
const review = (comment, extras = {}) => ({ id: 'r1', sourceId: 'source-1', platform: 'Airbnb', author: 'Guest', date: ago(2), score: 5, comment, ...extras });
const property = (reviews = []) => ({ id: 'p1', name: 'Test Villa', location: 'Funchal', airbnbUrl: 'https://www.airbnb.com/rooms/1', airbnb: { status: 'success', lastChecked: ago(1), score: 4.9, reviewCount: 20, reviews }, booking: null });

describe('Reviews Release 1', () => {
  test('praise and negated complaints do not create issues', () => {
    for (const text of ['Very clean apartment, comfortable bed and excellent wifi.', 'No noise, everything was perfect.', 'No problems with wifi.', 'Apartamento limpo e confortável. Sem barulho.', 'Pas de bruit, très propre.', 'Sin ruido. Muy limpio.', 'Keine Probleme mit WLAN.']) {
      assert.equal(classifyReviewIssues(review(text)).length, 0, text);
    }
  });

  test('mixed feedback assigns negative sentiment to the relevant topic', () => {
    const findings = classifyReviewIssues(review('The bed was comfortable, but wifi was slow and disconnected often.'));
    assert.deepEqual(findings.map(f => f.category), ['wifi']);
    assert.equal(findings[0].confidence, 'high');
    assert.equal(classifyReviewIssues(review('The apartment was not clean.'))[0].category, 'cleanliness');
  });

  test('explicit complaints work across supported phrase languages', () => {
    for (const text of ['O quarto estava sujo.', 'La chambre était sale.', 'El apartamento estaba sucio.', 'Das Zimmer war schmutzig.']) {
      const findings = classifyReviewIssues(review(text));
      assert.equal(findings[0]?.category, 'cleanliness', text);
      assert.equal(findings[0]?.confidence, 'high');
    }
  });

  test('ambiguous mentions require confirmation and decisions remain tied to evidence', () => {
    const r = review('The wifi connection.');
    const p = property([r]);
    const f = classifyReviewIssues(r)[0];
    assert.equal(f.confidence, 'uncertain');
    assert.equal(analysePropertyInsights(p).issues.length, 0);
    p.insightDecisions = { [f.key]: 'confirmed' };
    assert.equal(analysePropertyInsights(p).issues[0].key, 'wifi');
    p.insightDecisions[f.key] = 'dismissed';
    assert.equal(analysePropertyInsights(p).issues.length, 0);
    assert.notEqual(classifyReviewIssues({ ...r, comment: 'The wifi was slow.' })[0].key, f.key);
  });

  test('score alerts do not inflate complaint frequency', () => {
    const p = property([review('Dirty apartment.')]);
    p.airbnb.subScores = { cleanliness: 4.7 };
    const insights = analysePropertyInsights(p);
    assert.equal(insights.issues.find(i => i.key === 'cleanliness').count, 1);
    assert.ok(insights.recommendations.some(r => r.text.includes('4.7')));
  });

  test('averages have explicit, independent denominators and exclude invalid scores', () => {
    const p = property([review('Great.')]);
    p.airbnb.score = 5; p.airbnb.reviewCount = 2; p.airbnb.subScores = { cleanliness: 4.8 };
    const q = { id: 'p2', airbnb: { score: 4, reviewCount: 8 } };
    const summary = calculatePortfolioSummary([p, q, { airbnb: { score: 0 } }, { archived: true, airbnb: { score: 1, reviewCount: 900 } }]);
    assert.equal(summary.airbnb.average, 4.5);
    assert.equal(summary.airbnb.weightedAverage, 4.2);
    assert.equal(summary.airbnb.properties, 2);
    assert.equal(summary.airbnb.cleanlinessProperties, 1);
    assert.equal(summary.airbnb.weightReviews, 10);
    assert.equal(summary.importedReviews, 1);
    assert.equal(summary.totalReviews, 10);
    assert.equal(summary.booking.average, null);
  });

  test('manual records are not counted as imported coverage and distinct stays survive deduplication', () => {
    const p = property([review('', { id: 'one', sourceId: 'one', author: 'Repeat guest' }), review('', { id: 'two', sourceId: 'two', author: 'Repeat guest' })]);
    p.reviews = [review('Manually recorded', { id: 'manual', origin: 'manual' })];
    assert.equal(getAllPropertyReviews(p).length, 3);
    assert.equal(calculatePortfolioSummary([p]).importedReviews, 2);
  });

  test('freshness distinguishes failures, stale data, unknown dates and missing links', () => {
    const p = property();
    assert.equal(platformHealth(p, 'airbnb', now).status, 'current');
    p.airbnb.lastChecked = ago(15);
    assert.equal(platformHealth(p, 'airbnb', now).status, 'stale');
    p.airbnb.lastChecked = 'invalid';
    assert.equal(platformHealth(p, 'airbnb', now).status, 'unknown');
    p.airbnb.status = 'error';
    assert.equal(platformHealth(p, 'airbnb', now).status, 'failed');
    assert.equal(platformHealth(p, 'booking', now).status, 'unlinked');
    assert.equal(reviewTime(null), null);
    assert.equal(reviewTime('invalid'), null);
    assert.equal(reviewTime('1779131640'), 1779131640000);
  });

  test('failed collection preserves successful values and does not create a false snapshot', () => {
    const previous = property([review('Nice.')]).airbnb;
    const failed = mergeCollectedPlatform(previous, { status: 'error', lastChecked: ago(0), error: 'Blocked' }, true);
    assert.equal(failed.score, 4.9);
    assert.equal(failed.reviews.length, 1);
    assert.equal(failed.lastSuccessAt, previous.lastChecked);
    assert.equal(failed.ratingHistory.length, 1);
    const success = mergeCollectedPlatform(failed, { status: 'success', lastChecked: ago(0), score: 4.8, reviewCount: 21, reviews: [] }, false);
    assert.equal(success.ratingHistory.length, 2);
    assert.equal(success.reviews.length, 1);
    assert.equal(success.reviewsCollectedAt, null);
    const repeated = mergeCollectedPlatform(success, { ...success }, false);
    assert.equal(repeated.ratingHistory.length, 2);
  });

  test('reply queue excludes old, undated, future, answered and archived reviews and prioritises low scores', () => {
    const p = property([
      review('High', { id: 'high', sourceId: 'high', score: 5, date: ago(1) }),
      review('Low', { id: 'low', sourceId: 'low', score: 3, date: ago(5) }),
      review('Old', { id: 'old', sourceId: 'old', date: ago(91) }),
      review('Unknown', { id: 'unknown', sourceId: 'unknown', date: null }),
      review('Future', { id: 'future', sourceId: 'future', date: ago(-1) }),
      review('Replied', { id: 'replied', sourceId: 'replied', hasResponse: true })
    ]);
    const { items } = buildAttentionQueue([p, { ...p, id: 'archived', archived: true }], { now, queue: 'replies' });
    assert.deepEqual(items.map(r => r.reviewId), ['low', 'high']);
    assert.equal(buildAttentionQueue([p], { now, queue: 'replies', platform: 'booking' }).items.length, 0);
  });

  test('decline alerts need five ratings in each non-overlapping period', () => {
    const p = property(Array.from({ length: 10 }, (_, i) => review('', { id: `r${i}`, sourceId: `s${i}`, score: i < 5 ? 4 : 5, date: ago(i < 5 ? i + 1 : i + 30) })));
    assert.equal(buildAttentionQueue([p], { now, queue: 'declining' }).items.length, 1);
    p.airbnb.reviews.pop();
    assert.equal(buildAttentionQueue([p], { now, queue: 'declining' }).items.length, 0);
  });

  test('recurrence requires two confirmed recent reviews and excludes dismissed evidence', () => {
    const reviews = [review('Wifi was slow.'), review('No internet.', { id: 'r2', sourceId: 's2' })];
    const p = property(reviews);
    assert.equal(buildAttentionQueue([p], { now, queue: 'recurring' }).items.length, 0);
    p.insightDecisions = Object.fromEntries(reviews.flatMap(r => classifyReviewIssues(r).map(f => [f.key, 'confirmed'])));
    assert.equal(buildAttentionQueue([p], { now, queue: 'recurring' }).items.length, 1);
    p.insightDecisions[classifyReviewIssues(reviews[0])[0].key] = 'dismissed';
    assert.equal(buildAttentionQueue([p], { now, queue: 'recurring' }).items.length, 0);
  });

  test('attention controls preserve typing focus and open the exact review', () => {
    resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
    const manager = new ReviewsRatingsManager();
    manager.state.rawProperties = [property([review('Nice.', { date: new Date().toISOString() })])];
    manager.updateCalculations(); manager.render();
    assert.equal(manager.state.activeTab, 'attention');
    document.getElementById('fixture').hidden = false;
    let input = document.getElementById('attention-search');
    input.focus(); input.value = 'Test'; input.setSelectionRange(4, 4); input.dispatchEvent(new Event('input'));
    input = document.getElementById('attention-search');
    assert.equal(document.activeElement, input); assert.equal(input.selectionStart, 4);
    document.querySelector('[data-attention-queue="replies"]').click();
    document.querySelector('[data-attention-property]').click();
    assert.equal(manager.state.activeModalTab, 'followUp');
    assert.equal(manager.state.selectedInboxReview.id, 'r1');
    assert.ok(document.querySelector('#follow-up-form'));
    assert.ok(document.querySelector('[role="dialog"]'));
    document.querySelector('#reviews-ratings-page').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(manager.state.selectedProperty, null);
    document.getElementById('fixture').hidden = true;
  });

  test('classification decisions survive server refresh and fresh manager initialization', async () => {
    resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
    const manager = new ReviewsRatingsManager(); const p = property([review('Wifi was slow.')]);
    const key = classifyReviewIssues(p.airbnb.reviews[0])[0].key;
    manager.mergeServerDataset({ properties: [p] });
    await manager.setInsightDecision('p1', key, 'dismissed');
    manager.mergeServerDataset({ properties: [property([review('Wifi was slow.')])] });
    assert.equal(manager.state.rawProperties[0].insightDecisions[key], 'dismissed');
    const fresh = new ReviewsRatingsManager();
    assert.equal(fresh.state.rawProperties[0].insightDecisions[key], 'dismissed');
    clearTimeout(manager._toastTimer);
  });

  test('new server replies replace stale cached reply status', () => {
    resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
    const manager = new ReviewsRatingsManager();
    manager.state.rawProperties = [property([review('Nice.', { response: '', hasResponse: false })])];
    manager.mergeServerDataset({ properties: [property([review('Nice.', { response: 'Thank you!', hasResponse: true })])] });
    assert.equal(manager.state.rawProperties[0].airbnb.reviews[0].response, 'Thank you!');
    assert.equal(buildAttentionQueue(manager.state.rawProperties, { now, queue: 'replies' }).items.length, 0);
  });

  test('unchanged refresh has a distinct message and failed shared decisions report local-only saving', async () => {
    resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
    const manager = new ReviewsRatingsManager();
    const dataset = { lastUpdated: ago(1), properties: [property([review('Wifi was slow.')])] };
    manager.mergeServerDataset(dataset);
    const originalFetch = window.fetch;
    try {
      window.fetch = async () => ({ ok: true, json: async () => dataset });
      await manager.syncReviews();
      assert.equal(manager.state.syncToastKind, 'info');
      assert.includes(manager.state.syncToastMessage, 'has not changed');
      manager.saveOverrideToFirestore = async () => false;
      const key = classifyReviewIssues(dataset.properties[0].airbnb.reviews[0])[0].key;
      await manager.setInsightDecision('p1', key, 'confirmed');
      assert.equal(manager.state.syncToastKind, 'error');
      assert.includes(manager.state.syncToastMessage, 'this device');
    } finally { window.fetch = originalFetch; clearTimeout(manager._toastTimer); }
  });

  test('malformed and failed refreshes retain data and show an error', async () => {
    resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
    const manager = new ReviewsRatingsManager(); manager.state.rawProperties = [property()];
    const originalFetch = window.fetch;
    try {
      for (const response of [{ ok: false }, { ok: true, json: async () => ({ properties: null }) }]) {
        window.fetch = async () => response;
        await manager.syncReviews();
        assert.equal(manager.state.rawProperties.length, 1);
        assert.equal(manager.state.syncToastKind, 'error');
        assert.equal(manager.state.isSyncing, false);
        assert.ok(document.querySelector('#reviews-sync-toast').classList.contains('bg-red-800'));
      }
    } finally { window.fetch = originalFetch; clearTimeout(manager._toastTimer); }
  });

  test('new attention and metric copy is available in Portuguese', async () => {
    resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
    const oldLang = i18n.currentLang;
    try {
      i18n.translations.pt = await (await fetch('/locales/pt.json')).json(); i18n.currentLang = 'pt';
      const manager = new ReviewsRatingsManager(); manager.updateCalculations(); manager.render();
      assert.includes(document.getElementById('reviews-ratings-page').textContent, 'Verificar respostas');
      assert.equal(document.querySelector('.rr-metrics-panel'), null);
      document.querySelector('[data-tab="properties"]').click();
      assert.includes(document.getElementById('reviews-ratings-page').textContent, 'Média por propriedade');
    } finally { i18n.currentLang = oldLang; }
  });
});
