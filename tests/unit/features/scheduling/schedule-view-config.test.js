import { describe, test, assert } from "../../../test-harness.js";
import { SCHEDULE_VIEWS } from "../../../../js/features/scheduling/schedule-view-config.js";
import { UIManager } from "../../../../js/features/scheduling/ui-manager.js";
import { resetDom } from "../../../test-utils.js";

describe("Schedule view configuration", () => {
  test("keeps vacation management and its duplicate board out of Work Schedule", () => {
    assert.deepEqual(
      SCHEDULE_VIEWS.map(({ view }) => view),
      ["monthly", "yearly", "stats", "madeira-holidays"]
    );
    assert.equal(SCHEDULE_VIEWS.some(({ id }) => id === "vacation-view-btn"), false);
  });

  test("keeps self-service navigation read-only and gates the Vacation Center shortcut", () => {
    resetDom(`
      <button id="monthly-view-btn"></button><button id="yearly-view-btn"></button>
      <details id="schedule-reference-group"><button id="stats-view-btn"></button></details>
      <button id="schedule-vacation-center-btn"></button>
      <details id="schedule-export-menu"></details>
    `);
    let employee = true;
    let vacationAccess = false;
    const ui = Object.create(UIManager.prototype);
    ui.dataManager = {
      isScheduleOnlyUser: () => employee,
      getAllowedScheduleViews: () => employee ? ['monthly'] : [],
      canAccessApp: (key) => key === 'vacationCenter' && vacationAccess
    };
    try {
      ui.syncScheduleNavigationState('monthly');
      assert.equal(document.getElementById('monthly-view-btn').getAttribute('aria-pressed'), 'true');
      for (const id of ['yearly-view-btn', 'schedule-reference-group', 'schedule-export-menu', 'schedule-vacation-center-btn']) {
        assert.ok(document.getElementById(id).classList.contains('hidden'), id + ' must stay hidden for employees');
      }
      employee = false;
      ui.syncScheduleNavigationState('yearly');
      assert.ok(!document.getElementById('yearly-view-btn').classList.contains('hidden'));
      assert.ok(document.getElementById('schedule-vacation-center-btn').classList.contains('hidden'));
      vacationAccess = true;
      ui.syncScheduleNavigationState('yearly');
      assert.ok(!document.getElementById('schedule-vacation-center-btn').classList.contains('hidden'));
    } finally { resetDom(); }
  });

  test("falls back to the monthly schedule for a retired board request", () => {
    const ui = Object.create(UIManager.prototype);
    let view = 'vacation-board';
    ui.dataManager = {
      getCurrentView: () => view,
      setCurrentView: (next) => { view = next; },
      getCurrentDate: () => new Date(2026, 7, 1),
      getAllowedScheduleViews: () => []
    };
    ui.syncScheduleNavigationState = () => {};
    ui.updateView = () => {};
    ui.switchView('vacation-board');
    assert.equal(view, 'monthly');
  });
});
