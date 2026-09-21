import { describe, test, assert } from '../../../test-harness.js';
import { resetDom } from '../../../test-utils.js';
import { buildAttentionQueue } from '../../../../js/features/operations/reviews-attention-utils.js';
import { renderWorkspace } from '../../../../js/features/operations/reviews-workspace-view.js';
import { ReviewsRatingsManager } from '../../../../js/features/operations/reviews-ratings-manager.js';

const now = Date.parse('2026-09-21T12:00:00Z');
const property = () => ({ id:'villa', name:'Test Villa', location:'Funchal', airbnbUrl:'https://www.airbnb.com/rooms/123',
  airbnb:{score:4.2,lastSuccessAt:'2026-08-01',reviews:[{id:'r1',author:'Guest',platform:'Airbnb',score:3,date:'2026-09-20',comment:'The wifi was slow.'}]}});
function fixture() {
  resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
  const manager = new ReviewsRatingsManager(); manager.state.rawProperties=[property()];manager.updateCalculations();manager.render();
  return manager;
}

describe('Reviews workspace clarity', () => {
  test('collection failures never inflate the operational queue or its total', () => {
    const all = buildAttentionQueue([property()],{now});
    const data = buildAttentionQueue([property()],{now,queue:'data'});
    assert.ok(data.items.length > 0);
    assert.ok(all.items.every(row => row.queue !== 'data'));
    assert.equal(all.counts.all,all.items.length);
    assert.equal(all.counts.data,data.items.length);
    assert.ok(all.items.some(row=>row.queue==='ratings'));
    assert.ok(all.items.some(row=>row.queue==='replies'));
  });

  test('the improvement badge counts open shared records, excluding archived properties and unavailable loads', () => {
    const state={rawProperties:[property(),{id:'archived',archived:true}],workItems:[
      {propertyId:'villa',status:'new'}, {propertyId:'villa',status:'monitoring'},
      {propertyId:'villa',status:'resolved'}, {propertyId:'villa',status:'dismissed'},
      {propertyId:'archived',status:'new'}, {propertyId:'missing',status:'new'}],workflowConnected:true};
    const node=document.createElement('div');node.innerHTML=renderWorkspace(state);
    assert.equal(node.querySelector('.rr-nav-count').textContent,'2');
    for(const flags of [{workflowLoading:true},{workflowError:'Offline'},{workflowConnected:false}]) {
      node.innerHTML=renderWorkspace({...state,...flags});assert.equal(node.querySelector('.rr-nav-count'),null);
    }
  });

  test('data filters are separate and returning to work restores its queue and search', () => {
    const manager=fixture();
    manager.state.attentionQueue='ratings';manager.state.attentionSearch='Test';manager.render();
    document.querySelector('[data-tab="properties"]').click();
    assert.ok(document.querySelector('.rr-metrics-panel'));
    assert.equal(document.querySelector('.rr-metrics-panel').open,false);
    document.querySelector('[data-property-view="data"]').click();
    const search=document.getElementById('attention-search');search.value='Unknown';search.dispatchEvent(new Event('input'));
    assert.equal(manager.state.dataSearch,'Unknown');assert.equal(manager.state.attentionSearch,'Test');
    document.querySelector('[data-tab="attention"]').click();
    assert.equal(document.getElementById('attention-search').value,'Test');
    assert.equal(document.querySelector('[data-attention-queue="ratings"]').getAttribute('aria-pressed'),'true');
    assert.equal(document.querySelector('.rr-metrics-panel'),null);
    assert.equal(document.querySelector('[data-attention-queue="data"]'),null);
  });

  test('the inspector keeps three sections and never labels an uncaptured reply as confirmed unanswered', () => {
    const manager=fixture();manager.state.activeTab='properties';manager.render();
    document.querySelector('.reviews-details-btn').click();
    assert.equal(document.querySelectorAll('.rr-inspector-tabs button').length,3);
    document.querySelector('.rr-inspector-tabs [data-tab="reviews"]').click();
    const text=document.querySelector('.rr-review').textContent;
    assert.includes(text,'Reply not captured');
    assert.ok(!text.includes('Confirmed unanswered'));
    document.querySelector('#modal-close-btn').click();
  });

  test('advanced filters retain their values and collapsed state after a render', () => {
    const manager=fixture();manager.state.activeTab='latest-reviews';manager.render();
    const details=document.querySelector('[data-rr-disclosure="inbox-filters"]');assert.equal(details.open,false);details.open=true;
    const filter=document.getElementById('inbox-rating');filter.value='low';filter.dispatchEvent(new Event('change'));
    assert.equal(manager.state.inbox.rating,'low');
    assert.equal(document.querySelector('[data-rr-disclosure="inbox-filters"]').open,true);
    document.querySelector('[data-rr-disclosure="inbox-filters"]').open=false;
    manager.render();
    assert.equal(document.getElementById('inbox-rating').value,'low');
    assert.equal(document.querySelector('[data-rr-disclosure="inbox-filters"]').open,false);
    assert.includes(document.querySelector('[data-rr-disclosure="inbox-filters"] summary').textContent,'1 active filters');
  });

  test('reply actions use platform identity when two reviews share an ID', () => {
    const manager=fixture();const p=manager.state.rawProperties[0];
    p.airbnb.reviews[0].date=new Date().toISOString();
    p.booking={score:8,reviews:[{id:'r1',author:'Another guest',platform:'Booking.com',score:7,date:new Date().toISOString(),comment:'Different stay'}]};
    manager.state.attentionQueue='replies';manager.updateCalculations();manager.render();
    document.querySelector('[data-attention-review-key="Booking.com:r1"]').click();
    assert.equal(manager.state.selectedInboxReview.platform,'Booking.com');
    assert.equal(manager.state.selectedInboxReview.comment,'Different stay');
    document.querySelector('#modal-close-btn').click();
  });

  test('listing corrections and manual reviews remain available through the simplified inspector', () => {
    const manager=fixture();manager.state.activeTab='properties';manager.render();
    document.querySelector('.reviews-details-btn').click();
    document.querySelector('#modal-toggle-edit-links-btn').click();
    document.getElementById('edit-airbnb-score-input').value='4.85';
    document.getElementById('modal-save-links-btn').click();
    assert.equal(manager.state.selectedProperty.airbnb.score,4.85);
    document.querySelector('.rr-inspector-tabs [data-tab="reviews"]').click();
    document.getElementById('modal-toggle-add-review-btn').click();
    const platform=document.getElementById('review-platform-input');platform.value='Airbnb';platform.dispatchEvent(new Event('change'));
    assert.equal(document.getElementById('review-score-input').max,'5');
    document.getElementById('review-author-input').value='Manual guest';document.getElementById('review-score-input').value='4';
    document.getElementById('add-review-form').dispatchEvent(new Event('submit',{cancelable:true}));
    assert.equal(manager.state.selectedProperty.reviews[0].origin,'manual');
    assert.equal(manager.state.selectedProperty.reviews[0].score,4);
    clearTimeout(manager._toastTimer);manager.releaseDrawer();
  });
});
