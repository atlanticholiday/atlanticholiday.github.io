import { describe, test, assert } from '../../../test-harness.js';
import { resetDom } from '../../../test-utils.js';
import { createWorkSeed, applyWorkChange, workId, reviewKey, followUpId, workSignals, workMetadata, queryReviewInbox, reviewReplyState, safePlatformUrl } from '../../../../js/features/operations/reviews-workflow-utils.js';
import { ReviewsWorkflowStore } from '../../../../js/features/operations/reviews-workflow-store.js';
import { ReviewsRatingsManager } from '../../../../js/features/operations/reviews-ratings-manager.js';
import { buildAttentionQueue } from '../../../../js/features/operations/reviews-attention-utils.js';
import { renderWorkBoard, renderWorkEditor } from '../../../../js/features/operations/reviews-workflow-view.js';

const actor = { uid: 'manager-1', email: 'manager@example.test', name: 'Manager' };
const guestReview = (id, extras = {}) => ({ id, sourceId: id, platform: 'Airbnb', author: id, comment: 'The wifi was slow.', score: 3, date: '2026-09-10', ...extras });
const property = (reviews = [guestReview('review-1')]) => ({ id: 'villa-1', name: 'Test Villa', location: 'Funchal', airbnbUrl: 'https://www.airbnb.com/rooms/123', airbnb: { score: 4.8, reviewCount: 100, reviews } });
const seed = () => ({ ...createWorkSeed(property(), 'wifi', 'Repair Wi-Fi'), assigneeId: 'employee-1', assigneeName: 'Ana', dueDate: '2026-09-15' });
async function rejects(operation, message) {
  let error;
  try { await operation(); } catch (caught) { error = caught; }
  assert.equal(error?.message, message);
}

// A transaction-capable SDK double: commits are serialized and listeners see committed records.
function databaseFixture() {
  const records = new Map(), listeners = new Set(), queries = [];
  const snap = (path) => ({ id: path.split('/').at(-1), exists: () => records.has(path), data: () => structuredClone(records.get(path)) });
  const deliver = listener => {
    const rows = [...records].filter(([path]) => path.startsWith(`${listener.ref.path}/`)).filter(([, data]) => (listener.ref.constraints || []).every(c => {
      const value = typeof c.field === 'string' ? data[c.field] : c.field.parts.reduce((v, key) => v?.[key], data);
      return value === c.value;
    })).map(([path]) => snap(path));
    listener.callback({ docs: rows });
  };
  let tail = Promise.resolve();
  const sdk = {
    doc: (_, collection, id) => ({ path: `${collection}/${id}` }), collection: (_, path) => ({ path }),
    where: (field, operator, value) => ({ field, operator, value }), query: (ref, ...constraints) => ({ ...ref, constraints }),
    FieldPath: class { constructor(...parts) { this.parts = parts; } },
    onSnapshot: (ref, callback) => { const listener = { ref, callback }; queries.push(ref); listeners.add(listener); deliver(listener); return () => listeners.delete(listener); },
    runTransaction: (_, action) => {
      const run = tail.then(async () => {
        const writes = [];
        const result = await action({ get: async ref => snap(ref.path), set: (ref, data) => writes.push([ref.path, structuredClone(data)]) });
        for (const [path, data] of writes) records.set(path, data);
        for (const listener of listeners) deliver(listener);
        return result;
      });
      tail = run.catch(() => {});
      return run;
    }
  };
  const store = new ReviewsWorkflowStore({}, { getContext: () => actor, canManage: () => true, sdk });
  return { store, records, sdk, queries, listeners };
}

describe('Reviews Release 2 workflow', () => {
  test('failed or pending shared loading never claims that the improvement list is empty', () => {
    for (const flags of [{ workflowError: 'Connection failed', workflowConnected: true }, { workflowLoading: true, workflowConnected: true }, { workflowConnected: false }]) {
      const state = { ...flags, canManageWork: true, workItems: [] };
      const board = renderWorkBoard([property()], state);
      const editor = renderWorkEditor(property(), state);
      assert.ok(!board.includes('No improvements match'));
      assert.ok(!editor.includes('No improvements match'));
      assert.ok(!board.includes('data-work-page'));
      assert.ok(!board.includes('data-work-create-form'));
      if (flags.workflowError) assert.ok(board.includes('data-workflow-retry'));
    }
  });
  test('groups evidence under one property/category identity across platforms', () => {
    const p = property([guestReview('r1'), guestReview('r2')]);
    const draft = createWorkSeed(p, 'wifi', 'Fix internet');
    assert.equal(draft.id, workId(p.id, 'wifi'));
    assert.equal(draft.evidence.length, 2);
    assert.notEqual(workId('a/b', 'wifi'), workId('a%2Fb', 'wifi'));
  });

  test('completion and dismissal require evidence and preserve audit history', async () => {
    const created = applyWorkChange(null, seed(), actor, '2026-09-12T12:00:00Z');
    await rejects(() => applyWorkChange(created, { ...created, status: 'resolved' }, actor), 'completionRequired');
    await rejects(() => applyWorkChange(created, { ...created, status: 'dismissed' }, actor), 'dismissalRequired');
    const monitored = applyWorkChange(created, { ...created, status: 'monitoring', completionEvidence: 'Replaced router', note: 'Signal checked in every room' }, actor, '2026-09-14T12:00:00Z');
    assert.equal(monitored.history.length, 2);
    assert.equal(monitored.history[1].actor.uid, actor.uid);
    assert.equal(monitored.history[1].note, 'Signal checked in every room');
    assert.equal(monitored.monitoringEvidenceKeys.length, 1);
    assert.equal(monitored.createdAt, created.createdAt);
  });

  test('invalid dates cannot enter shared work', async () => {
    await rejects(() => applyWorkChange(null, { ...seed(), dueDate: '2026-02-31' }, actor), 'invalidDate');
    await rejects(() => applyWorkChange(null, { ...seed(), dueDate: '2026-99-99' }, actor), 'invalidDate');
  });

  test('later complaints flag resolved work without auto-reopening it or counting old evidence', () => {
    const p = property();
    const work = applyWorkChange(null, { ...seed(), status: 'resolved', completionEvidence: 'Router replaced' }, actor, '2026-09-12T12:00:00Z');
    p.airbnb.reviews.push(guestReview('later', { date: '2026-09-15' }), guestReview('old', { date: '2026-08-15' }), guestReview('unknown', { date: '' }));
    const signals = workSignals(work, p, [], Date.parse('2026-09-20'));
    assert.equal(signals.newComplaints.length, 1);
    assert.equal(signals.newComplaints[0].sourceId, 'later');
    assert.equal(work.status, 'resolved');
    assert.equal(signals.overdue, false);
  });

  test('linked task ownership and deadlines are authoritative and completed tasks do not resolve reviews', () => {
    const work = { ...seed(), linkedTaskId: 'task-1' };
    const task = { id: 'task-1', assigneeIds: ['other'], assignees: [{ id: 'other', name: 'Bruno' }], dueDate: '2026-10-01', priority: 'urgent', status: 'done' };
    const metadata = workMetadata(work, [task]);
    assert.equal(metadata.assigneeName, 'Bruno');
    assert.equal(metadata.dueDate, '2026-10-01');
    assert.equal(workMetadata(work, []).available, false);
    const saved = applyWorkChange(work, { ...work, assigneeId: 'overwrite', dueDate: '2026-01-01' }, actor);
    assert.equal(saved.assigneeId, work.assigneeId);
    assert.equal(saved.status, 'new');
  });

  test('duplicate creation and stale edits are rejected without overwriting shared state', async () => {
    const { store, records } = databaseFixture();
    const created = await store.saveWork(seed());
    await rejects(() => store.saveWork(seed()), 'conflict');
    const updated = await store.saveWork({ ...created, note: 'First colleague edit', title: 'Updated title' });
    await rejects(() => store.saveWork({ ...created, note: 'Stale edit' }), 'conflict');
    assert.equal(records.get(`reviewWorkflows/${created.id}`).title, 'Updated title');
    assert.equal(updated.history.length, 2);
  });

  test('two subscribers see a committed improvement and listeners stop cleanly', async () => {
    const fixture = databaseFixture();
    const other = new ReviewsWorkflowStore({}, { getContext: () => actor, canManage: () => true, sdk: fixture.sdk });
    let left = [], right = [];
    await fixture.store.listen(records => left = records, () => {}, e => { throw e; });
    await other.listen(records => right = records, () => {}, e => { throw e; });
    await fixture.store.saveWork(seed());
    assert.equal(left[0].id, right[0].id);
    fixture.store.stop(); other.stop();
    assert.equal(fixture.listeners.size, 0);
  });

  test('creating linked work is atomic and repeated clicks cannot create duplicate Tasks', async () => {
    const { store, records } = databaseFixture();
    const created = await store.saveWork(seed());
    const [one, two] = await Promise.all([store.linkTask(created, { departmentId: 'cleaning', departmentName: 'Cleaning', assigneeAccess: { 'ana@example.test': true } }), store.linkTask(created)]);
    assert.equal(one.linkedTaskId, two.linkedTaskId);
    const tasks = [...records.keys()].filter(key => key.startsWith('tasks/'));
    assert.equal(tasks.length, 1);
    const task = records.get(tasks[0]);
    assert.equal(task.departmentId, 'cleaning');
    assert.equal(task.assigneeAccess['ana@example.test'], true);
    assert.equal(task.reviewImprovementId, created.id);
    assert.equal(one.history.length, 2);
  });

  test('linking an existing task does not overwrite its data', async () => {
    const { store, records } = databaseFixture();
    const original = { title: 'Existing cleaning task', assigneeIds: ['other'], dueDate: '2026-10-01' };
    records.set('tasks/existing', original);
    const created = await store.saveWork(seed());
    const linked = await store.linkTask(created, { taskId: 'existing' });
    assert.equal(linked.linkedTaskId, 'existing');
    assert.deepEqual(records.get('tasks/existing'), original);
  });

  test('read-only users cannot save and task subscriptions are limited to their assignment', async () => {
    const fixture = databaseFixture();
    const store = new ReviewsWorkflowStore({}, { getContext: () => actor, canManage: () => false, sdk: fixture.sdk });
    await rejects(() => store.saveWork(seed()), 'readOnly');
    await store.listen(() => {}, () => {}, () => {});
    const taskQuery = fixture.queries.find(q => q.path === 'tasks');
    assert.deepEqual(taskQuery.constraints[0].field.parts, ['assigneeAccess', actor.email]);
    store.stop();
  });

  test('internal handling is shared separately from platform reply status', async () => {
    const { store, records } = databaseFixture();
    const review = guestReview('review-1', { hasResponse: false });
    const followUp = await store.saveFollowUp('villa-1', review, { revision: 0, reviewKey: reviewKey(review), status: 'handled', assigneeId: 'employee-1', assigneeName: 'Ana', note: 'Checked on platform' });
    assert.equal(followUp.status, 'handled');
    assert.equal(reviewReplyState(review), 'unknown');
    assert.equal(records.get(`reviewWorkflows/${await followUpId('villa-1', review)}`).history[0].note, 'Checked on platform');
    const replies = buildAttentionQueue([property([review])], { now: Date.parse('2026-09-20'), queue: 'replies', followUps: [followUp] });
    assert.equal(replies.items.length, 0);
  });

  test('inbox exposes every imported review through pagination and combined filters', () => {
    const p = property(Array.from({ length: 76 }, (_, i) => guestReview(`r${i}`, { score: i % 2 ? 5 : 3 })));
    const result = queryReviewInbox([p], [], { page: 4 });
    assert.equal(result.total, 76); assert.equal(result.pages, 4); assert.equal(result.rows.length, 1);
    const low = queryReviewInbox([p], [], { rating: 'low', property: p.id, platform: 'Airbnb' });
    assert.equal(low.total, 38);
    assert.equal(queryReviewInbox([p], [], { search: 'not present' }).total, 0);
  });

  test('date filters exclude unknown dates and include the complete end date', () => {
    const p = property([guestReview('midnight', { date: '2026-09-10T23:59:59' }), guestReview('unknown', { date: '' }), guestReview('old', { date: '2026-09-09' })]);
    const result = queryReviewInbox([p], [], { from: '2026-09-10', to: '2026-09-10' }, Date.parse('2026-09-20'));
    assert.equal(result.total, 1); assert.equal(result.rows[0].id, 'midnight');
  });

  test('platform absence remains unknown unless explicit verification exists', () => {
    assert.equal(reviewReplyState(guestReview('one', { hasResponse: false })), 'unknown');
    assert.equal(reviewReplyState(guestReview('one', { responseStatus: 'unanswered', responseCheckedAt: '2026-09-20' })), 'unanswered');
    assert.equal(reviewReplyState(guestReview('one', { response: 'Thank you' })), 'replied');
  });

  test('external review destinations must be HTTPS and belong to the matching platform', () => {
    const p = property();
    assert.equal(safePlatformUrl(p, guestReview('one', { reviewUrl: 'javascript:alert(1)' })), p.airbnbUrl);
    assert.equal(safePlatformUrl({ ...p, airbnbUrl: 'https://airbnb.com.evil.test/rooms/1' }, guestReview('one')), '');
    assert.equal(safePlatformUrl(p, guestReview('one', { reviewUrl: 'https://www.airbnb.pt/rooms/123/reviews' })), 'https://www.airbnb.pt/rooms/123/reviews');
  });

  test('overdue linked tasks and later complaints surface in Attention', () => {
    const p = property();
    const work = { ...seed(), linkedTaskId: 'linked' };
    const result = buildAttentionQueue([p], { now: Date.parse('2026-09-20'), workItems: [work], tasks: [{ id: 'linked', dueDate: '2026-09-19', assigneeIds: ['ana'], assignees: [{ id: 'ana', name: 'Ana' }] }], queue: 'overdue' });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].workId, work.id);
    assert.equal(result.items[0].params.owner, 'Ana');
  });

  function managerFixture() {
    resetDom('<div id="reviews-ratings-page"></div>'); localStorage.clear();
    const fixture = databaseFixture();
    const dataManager = { getCurrentUserContext: () => actor, hasPrivilegedRole: () => true, getActiveEmployees: () => [{ id: 'employee-1', name: 'Ana', email: 'ana@example.test' }] };
    const manager = new ReviewsRatingsManager(null, null, { getDataManager: () => dataManager, workflowStore: fixture.store });
    manager.state.rawProperties = [property()]; manager.updateCalculations();
    return { manager, dataManager, ...fixture };
  }

  test('the shared editor keeps a draft when saving fails and never claims a local save is shared', async () => {
    const { manager, store } = managerFixture();
    manager.workflow.openWork('villa-1', 'wifi');
    manager.state.workDraft.note = 'Keep this note';
    store.saveWork = async () => { throw new Error('offline'); };
    await manager.workflow.saveWork();
    assert.equal(manager.state.workDraft.note, 'Keep this note');
    assert.equal(manager.state.workItems.length, 0);
    assert.equal(manager.state.syncToastKind, 'error');
    clearTimeout(manager._toastTimer);
    document.body.style.overflow = '';
  });

  test('inbox filters and input focus survive opening and closing the property drawer', () => {
    const { manager } = managerFixture();
    const fixture = document.getElementById('fixture'); fixture.hidden = false;
    try {
      manager.state.activeTab = 'latest-reviews'; manager.render();
      let input = document.getElementById('inbox-search'); input.focus(); input.value = 'Test'; input.dispatchEvent(new Event('input'));
      assert.equal(document.activeElement.id, 'inbox-search');
      const button = document.querySelector('[data-inbox-key]'); button.focus(); button.click();
      assert.ok(document.querySelector('.rr-drawer'));
      assert.equal(document.querySelector('#reviews-ratings-page main').inert, true);
      document.getElementById('modal-close-btn').click();
      assert.equal(manager.state.inbox.search, 'Test');
      assert.equal(manager.state.activeTab, 'latest-reviews');
      assert.ok(document.activeElement.hasAttribute('data-inbox-key'));
      assert.equal(document.querySelector('#reviews-ratings-page main').inert, false);
    } finally { fixture.hidden = true; document.body.style.overflow = ''; }
  });

  test('reconnecting keeps drafts while sign-out clears shared records and unlocks scrolling', async () => {
    const { manager, dataManager } = managerFixture();
    manager.workflow.start();
    await Promise.resolve();
    manager.workflow.openWork('villa-1', 'wifi');
    manager.state.workDraft.note = 'Unsaved repair notes';
    manager.workflow.start(true);
    await Promise.resolve();
    assert.equal(manager.state.workDraft.note, 'Unsaved repair notes');
    dataManager.getCurrentUserContext = () => ({});
    manager.endSession();
    assert.equal(manager.state.workDraft, null);
    assert.equal(manager.state.workItems.length, 0);
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.querySelector('.rr-drawer'), null);
  });

  test('task linking requires saving the latest editor changes first', async () => {
    const { manager, store } = managerFixture();
    const saved = await store.saveWork(seed());
    manager.state.workItems = [saved];
    manager.workflow.openWork('villa-1', 'wifi');
    manager.state.workDraft.title = 'Unsaved new title';
    let linked = false;
    store.linkTask = async () => { linked = true; };
    await manager.workflow.linkTask();
    assert.equal(linked, false);
    assert.equal(manager.state.workDraft.title, 'Unsaved new title');
    clearTimeout(manager._toastTimer);
    manager.releaseDrawer();
  });

  test('finishing a save does not replace another improvement opened while saving', async () => {
    const { manager, store } = managerFixture();
    manager.workflow.openWork('villa-1', 'wifi');
    const original = manager.state.workDraft;
    let finish;
    store.saveWork = () => new Promise(resolve => { finish = resolve; });
    const saving = manager.workflow.saveWork();
    manager.workflow.openWork('villa-1', 'cleanliness');
    finish(applyWorkChange(null, original, actor));
    await saving;
    assert.equal(manager.state.workDraft.category, 'cleanliness');
    assert.equal(manager.state.workItems[0].category, 'wifi');
    clearTimeout(manager._toastTimer);
    manager.releaseDrawer();
  });
});
