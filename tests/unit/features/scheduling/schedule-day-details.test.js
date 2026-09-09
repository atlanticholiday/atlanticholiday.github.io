import { describe, test, assert } from '../../../test-harness.js';
import { resetDom } from '../../../test-utils.js';
import { UIManager } from '../../../../js/features/scheduling/ui-manager.js';

function setupDayDetailsDom() {
  resetDom(`
    <div id="day-details-modal" class="hidden">
      <div class="modal-content">
        <div id="modal-date-header"></div>
        <div id="modal-employee-list"></div>
      </div>
    </div>
  `);
}

function createUi({ limited }) {
  const ui = Object.create(UIManager.prototype);
  ui.isScheduleOnlyMode = () => limited;
  ui.dataManager = {
    setSelectedDateKey() {},
    usesLimitedScheduleData: () => limited,
    getDailyNote: () => 'Private management note',
    getAllHolidays: () => ({ 2026: {} }),
    getActiveEmployees: () => [{
      id: 'peer-1',
      name: 'Maria',
      workDays: [1, 2, 3, 4, 5],
      overrides: {},
      extraHours: { '2026-09-09': 2 },
      extraHoursNotes: { '2026-09-09': 'Private overtime reason' }
    }],
    getEmployeeStatusForDate: () => 'Working',
    saveDailyNote() {}
  };
  return ui;
}

describe('Schedule day details privacy', () => {
  test('shows only generic colleague status to a limited employee', () => {
    setupDayDetailsDom();
    createUi({ limited: true }).showDayDetailsModal('2026-09-09');

    const modal = document.getElementById('day-details-modal');
    assert.includes(modal.textContent, 'Maria');
    const publicStatus = modal.querySelector('[data-public-schedule-status]');
    assert.equal(publicStatus?.dataset.publicScheduleStatus, 'working');
    assert.ok(Boolean(publicStatus?.textContent.trim()));
    assert.equal(document.getElementById('daily-note-section'), null);
    assert.equal(modal.querySelector('.extra-hours-input'), null);
    assert.equal(modal.querySelector('.extra-hours-note-input'), null);
    assert.equal(modal.querySelector('.status-radio'), null);
    assert.ok(!modal.innerHTML.includes('Private management note'));
    assert.ok(!modal.innerHTML.includes('Private overtime reason'));
  });

  test('preserves private schedule controls for management', () => {
    setupDayDetailsDom();
    createUi({ limited: false }).showDayDetailsModal('2026-09-09');

    const modal = document.getElementById('day-details-modal');
    assert.equal(document.getElementById('daily-note-input').value, 'Private management note');
    assert.equal(modal.querySelector('.extra-hours-input').value, '2');
    assert.equal(modal.querySelector('.extra-hours-note-input').value, 'Private overtime reason');
  });
});
