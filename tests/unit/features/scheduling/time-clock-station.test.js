import { describe, test, assert } from "../../../test-harness.js";
import {
  applyAttendancePinKey,
  filterTimeClockStationEmployees,
  getTimeClockStationEmployeeInitials,
  isAttendancePinReady,
  normalizeAttendancePin
} from "../../../../js/features/scheduling/time-clock-station.js";
import { UIManager } from "../../../../js/features/scheduling/ui-manager.js";
import { deriveAttendanceCredentialEmail } from "../../../../js/features/scheduling/spark-attendance-api.js";
import { resetDom } from "../../../test-utils.js";

describe("Time clock station helpers", () => {
  test("filters colleagues by name, accents, and staff number", () => {
    const employees = [
      { id: "1", name: "Ana Silva", staffNumber: 14, department: "Cleaning" },
      { id: "2", name: "João Sousa", staffNumber: 28, department: "Laundry" },
      { id: "3", name: "Carla Mendes", staffNumber: 42, department: "Reception" }
    ];

    assert.deepEqual(
      filterTimeClockStationEmployees(employees, "joao").map((employee) => employee.id),
      ["2"]
    );
    assert.deepEqual(
      filterTimeClockStationEmployees(employees, "42").map((employee) => employee.id),
      ["3"]
    );
    assert.deepEqual(
      filterTimeClockStationEmployees(employees, "ana clean").map((employee) => employee.id),
      ["1"]
    );
  });

  test("returns concise initials for station cards", () => {
    assert.equal(getTimeClockStationEmployeeInitials("Ana Silva"), "AS");
    assert.equal(getTimeClockStationEmployeeInitials(" João "), "J");
    assert.equal(getTimeClockStationEmployeeInitials(""), "--");
  });

  test("normalizes PIN input and enforces the tablet length limits", () => {
    assert.equal(normalizeAttendancePin("12a 34-56"), "123456");
    assert.equal(normalizeAttendancePin("123456789012"), "1234567890");
    assert.equal(isAttendancePinReady("12345"), false);
    assert.equal(isAttendancePinReady("123456"), true);
    assert.equal(isAttendancePinReady("1234567890"), true);
  });

  test("applies number-pad keys without leaking non-numeric input", () => {
    assert.equal(applyAttendancePinKey("12345", "6"), "123456");
    assert.equal(applyAttendancePinKey("123456", "backspace"), "12345");
    assert.equal(applyAttendancePinKey("123456", "clear"), "");
    assert.equal(applyAttendancePinKey("123456", "x"), "123456");
  });

  test("derives a stable private authentication identity from each unique PIN", async () => {
    const first = await deriveAttendanceCredentialEmail('123456');
    const repeated = await deriveAttendanceCredentialEmail('123456');
    const second = await deriveAttendanceCredentialEmail('654321');

    assert.equal(first, repeated);
    assert.notEqual(first, second);
    assert.equal(first.includes('123456'), false);
    assert.match(first, /^clock-[a-f0-9]{40}@my-work-schedule-4dc10\.firebaseapp\.com$/);
  });

  test("filters the station directory without replacing the focused search input", () => {
    resetDom(`
      <input id="time-clock-station-search">
      <span id="time-clock-station-visible-count"></span>
      <span id="time-clock-station-visible-summary"></span>
      <span id="time-clock-station-shown-count"></span>
      <div id="time-clock-station-employee-grid"></div>
    `);
    const fixture = document.getElementById('fixture');
    fixture.hidden = false;
    const ui = Object.create(UIManager.prototype);
    ui.timeClockStationEmployeeId = null;
    ui.timeClockStationSearch = '';
    ui.timeClockStationNotice = '';
    ui.timeClockStationNoticeTone = 'info';
    ui.dataManager = {
      getActiveEmployees: () => [
        { id: 'ana', name: 'Ana Silva' },
        { id: 'bruno', name: 'Bruno Costa' }
      ],
      getAttendanceSummary: () => ({ status: 'clocked-out', primaryAction: 'clockIn', workedMinutes: 0 })
    };
    ui.registerTimeClockStationActivity = () => {};
    ui.formatAttendanceEventLabel = (value) => value;
    ui.formatMinutesAsDuration = () => '0h';
    ui.renderTimeClockPage = () => { throw new Error('Search must not render the whole station page'); };

    try {
      const searchInput = document.getElementById('time-clock-station-search');
      searchInput.focus();
      searchInput.value = 'ana';
      ui.setTimeClockStationSearch(searchInput.value);

      assert.equal(document.activeElement, searchInput);
      assert.equal(document.getElementById('time-clock-station-visible-count').textContent, '1');
      assert.includes(document.getElementById('time-clock-station-employee-grid').textContent, 'Ana Silva');
      assert.equal(document.getElementById('time-clock-station-employee-grid').textContent.includes('Bruno Costa'), false);
    } finally {
      fixture.hidden = true;
      resetDom();
    }
  });

  test("returns to the private PIN screen immediately after a saved punch", () => {
    const ui = Object.create(UIManager.prototype);
    let renderCount = 0;
    ui.timeClockStationEmployeeId = 'ana';
    ui.timeClockStationSearch = 'ana';
    ui.timeClockStationPin = '123456';
    ui.timeClockStationFeedback = '';
    ui.timeClockStationFeedbackTone = 'success';
    ui.timeClockStationNotice = '';
    ui.timeClockStationNoticeTone = 'info';
    ui.dataManager = { resolveAttendanceEmployee: () => ({ id: 'ana', name: 'Ana Silva' }) };
    ui.renderTimeClockPage = () => { renderCount += 1; };

    ui.handleTimeClockStationAttendanceSaved('ana', 'Entrada');

    assert.equal(ui.timeClockStationEmployeeId, null);
    assert.equal(ui.timeClockStationSearch, '');
    assert.equal(ui.timeClockStationPin, '');
    assert.ok(ui.timeClockStationNotice);
    assert.equal(ui.timeClockStationNoticeTone, 'success');
    assert.equal(renderCount, 1);
  });

  test("opens only the authenticated colleague after PIN identification", () => {
    const ui = Object.create(UIManager.prototype);
    let renderCount = 0;
    ui.timeClockStationEmployeeId = null;
    ui.timeClockStationFeedback = 'old error';
    ui.timeClockStationFeedbackTone = 'error';
    ui.timeClockStationNotice = '';
    ui.timeClockStationNoticeTone = 'info';
    ui.registerTimeClockStationActivity = () => {};
    ui.renderTimeClockPage = () => { renderCount += 1; };

    ui.handleTimeClockStationEmployeeIdentified({ id: 'ana', name: 'Ana Silva' });

    assert.equal(ui.timeClockStationEmployeeId, 'ana');
    assert.equal(ui.timeClockStationFeedback, '');
    assert.equal(renderCount, 1);
  });

  test("renders the PIN keypad before any colleague identity or directory", () => {
    resetDom('<div id="station"></div>');
    const ui = Object.create(UIManager.prototype);
    ui.timeClockStationPin = '';
    ui.timeClockStationFeedback = '';
    ui.timeClockStationFeedbackTone = 'success';
    ui.formatLocaleTime = () => '09:30:00';
    ui.formatLocaleDate = () => 'quarta-feira, 9 de setembro';

    try {
      const container = document.getElementById('station');
      ui.renderTimeClockStationIdentificationPage(container, new Date(), {
        heroStatusMarkup: '',
        stationNoticeMarkup: '',
        modeToggle: ''
      });

      assert.ok(container.querySelector('#time-clock-station-pin'));
      assert.ok(container.querySelector('[data-time-clock-station-identify]'));
      assert.equal(Boolean(container.querySelector('#time-clock-station-search')), false);
      assert.equal(Boolean(container.querySelector('[data-time-clock-station-employee-id]')), false);
    } finally {
      resetDom();
    }
  });
});
