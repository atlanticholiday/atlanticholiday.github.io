import { describe, test, assert } from '../../../test-harness.js';
import { resetDom } from '../../../test-utils.js';
import { InteractiveAccessPreviewSession } from '../../../../js/features/admin/interactive-access-preview-session.js';

function createDataManager() {
  let context = {
    uid: 'admin-uid',
    email: 'admin@example.com',
    roles: ['admin'],
    allowedApps: [],
    linkedEmployee: null
  };

  return {
    getCurrentUserContext() {
      return context;
    },
    setCurrentUserContext(nextContext) {
      context = {
        ...nextContext,
        roles: [...(nextContext.roles || [])],
        allowedApps: [...(nextContext.allowedApps || [])]
      };
    },
    isTimeClockStationUser() {
      return context.roles.includes('time-clock-station');
    },
    isClockOnlyUser() {
      return context.roles.includes('employee');
    },
    hasAnyGrantedAppAccess() {
      return context.allowedApps.length > 0;
    }
  };
}

describe('InteractiveAccessPreviewSession', () => {
  test('opens a permitted app with the preview context and restores the administrator on exit', () => {
    resetDom(`
      <main id="landing-page"></main>
      <button id="go-to-laundry-log-btn">Laundry Log</button>
      <button id="save-laundry-entry-btn">Save entry</button>
      <button id="laundry-history-tab">History</button>
      <button id="linen-review-btn" data-linen-action="open-submit-review">Review count</button>
      <button id="linen-correction-btn" data-linen-action="request-correction">Request correction</button>
    `);

    const dataManager = createDataManager();
    const navigationCalls = [];
    let destinationClicks = 0;
    let saveClicks = 0;
    let tabClicks = 0;
    let reviewClicks = 0;
    let correctionClicks = 0;
    let syncCalls = 0;
    document.getElementById('go-to-laundry-log-btn').addEventListener('click', () => { destinationClicks += 1; });
    document.getElementById('save-laundry-entry-btn').addEventListener('click', () => { saveClicks += 1; });
    document.getElementById('laundry-history-tab').addEventListener('click', () => { tabClicks += 1; });
    document.getElementById('linen-review-btn').addEventListener('click', () => { reviewClicks += 1; });
    document.getElementById('linen-correction-btn').addEventListener('click', () => { correctionClicks += 1; });

    const session = new InteractiveAccessPreviewSession({
      dataManager,
      navigationManager: {
        currentPage: 'userManagement',
        showLandingPage() { navigationCalls.push('landing'); },
        showUserManagementPage() { navigationCalls.push('userManagement'); },
        showPage(pageName) { navigationCalls.push(pageName); }
      },
      syncAccessUi() { syncCalls += 1; },
      documentRef: document,
      windowRef: window
    });

    const started = session.start({
      user: {
        email: 'limpeza@atlanticholiday.net',
        roles: ['employee'],
        allowedApps: ['laundryLog', 'linenInventory']
      },
      linkedEmployee: {
        id: 'employee-cleaning',
        name: 'Cleaning Team',
        email: 'limpeza@atlanticholiday.net'
      },
      buttonId: 'go-to-laundry-log-btn'
    });

    assert.equal(started, true);
    assert.equal(session.isActive(), true);
    assert.equal(dataManager.getCurrentUserContext().uid, 'admin-uid');
    assert.equal(dataManager.getCurrentUserContext().email, 'limpeza@atlanticholiday.net');
    assert.deepEqual(dataManager.getCurrentUserContext().roles, ['employee']);
    assert.deepEqual(dataManager.getCurrentUserContext().allowedApps, ['laundryLog', 'linenInventory']);
    assert.equal(dataManager.getCurrentUserContext().linkedEmployee.id, 'employee-cleaning');
    assert.deepEqual(navigationCalls, ['landing']);
    assert.equal(destinationClicks, 1);
    assert.equal(syncCalls, 1);
    assert.ok(document.getElementById('interactive-access-preview-bar'));
    assert.includes(document.getElementById('interactive-access-preview-bar').textContent, 'Cleaning Team');
    assert.equal(document.body.classList.contains('interactive-access-preview-active'), true);

    document.getElementById('laundry-history-tab').click();
    assert.equal(tabClicks, 1);
    document.getElementById('linen-review-btn').click();
    assert.equal(reviewClicks, 1);

    document.getElementById('save-laundry-entry-btn').click();
    assert.equal(saveClicks, 0);
    document.getElementById('linen-correction-btn').click();
    assert.equal(correctionClicks, 0);
    assert.includes(document.getElementById('interactive-access-preview-toast').textContent, 'Changes are blocked');

    document.getElementById('exit-interactive-access-preview-btn').click();
    assert.equal(session.isActive(), false);
    assert.equal(dataManager.getCurrentUserContext().email, 'admin@example.com');
    assert.deepEqual(dataManager.getCurrentUserContext().roles, ['admin']);
    assert.equal(navigationCalls.at(-1), 'userManagement');
    assert.equal(syncCalls, 2);
    assert.equal(document.getElementById('interactive-access-preview-bar'), null);
    assert.equal(document.body.classList.contains('interactive-access-preview-active'), false);
  });

  test('blocks form submissions and opens clock-only profiles directly in Time Clock', () => {
    resetDom(`
      <form id="attendance-form"><button type="submit">Submit</button></form>
    `);
    const dataManager = createDataManager();
    let formSubmissions = 0;
    let clockOpens = 0;
    document.getElementById('attendance-form').addEventListener('submit', (event) => {
      event.preventDefault();
      formSubmissions += 1;
    });

    const session = new InteractiveAccessPreviewSession({
      dataManager,
      navigationManager: {
        currentPage: 'userManagement',
        showTimeClockPage() { clockOpens += 1; },
        showUserManagementPage() {}
      },
      documentRef: document,
      windowRef: window
    });

    session.start({
      user: { email: 'clock@example.com', roles: ['employee'], allowedApps: [] },
      linkedEmployee: { id: 'employee-1', name: 'Clock User', email: 'clock@example.com' }
    });
    assert.equal(clockOpens, 1);

    document.getElementById('attendance-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(formSubmissions, 0);
    assert.ok(document.getElementById('interactive-access-preview-toast'));

    session.stop();
  });
});
