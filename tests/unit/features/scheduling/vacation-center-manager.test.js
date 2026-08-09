import { describe, test, assert } from "../../../test-harness.js";
import { VacationCenterManager } from "../../../../js/features/scheduling/vacation-center-manager.js";

function createFixture() {
  document.body.innerHTML = `
    <div id="vacation-center-page">
      <div id="vacation-center-root"></div>
    </div>
  `;

  const employees = [
    {
      id: "e1",
      name: "Ana Silva",
      department: "Guest Care",
      vacations: [{ id: "v1", startDate: "2026-01-05", endDate: "2026-01-09" }]
    },
    {
      id: "e2",
      name: "Bruno Costa",
      department: "Operations",
      vacations: []
    }
  ];
  const entries = [{
    id: "v1",
    employeeId: "e1",
    employeeName: "Ana Silva",
    startDate: "2026-01-05",
    endDate: "2026-01-09"
  }];
  const allowanceUpdates = [];
  const dataManager = {
    getActiveEmployees: () => employees,
    getSharedVacationEntries: () => entries,
    getVacationRecordById: (id) => entries.find((entry) => entry.id === id) || null,
    getEmployeeById: (id) => employees.find((employee) => employee.id === id) || null,
    subscribeToDataChanges: () => () => {},
    async handleVacationAllowanceForYearChange(employeeId, year, allowance) {
      allowanceUpdates.push({ employeeId, year, allowance });
    }
  };
  const bookingCalls = [];
  const scheduleManager = {
    openBookVacationModal(...args) {
      bookingCalls.push(args);
    }
  };
  const manager = new VacationCenterManager(dataManager, {
    scheduleManager,
    now: () => new Date("2026-08-09T12:00:00")
  });
  manager.init();
  manager.render();

  return { manager, employees, allowanceUpdates, bookingCalls };
}

describe("VacationCenterManager", () => {
  test("renders balances and updates the selected colleague", () => {
    createFixture();

    assert.equal(document.querySelectorAll("[data-vc-select-employee]").length, 2);
    assert.includes(document.querySelector(".vacation-center-inspector").textContent, "Ana Silva");

    document.querySelector('[data-vc-select-employee="e2"]').click();

    assert.includes(document.querySelector(".vacation-center-inspector").textContent, "Bruno Costa");
  });

  test("filters the roster without losing the inspector", () => {
    createFixture();
    const search = document.querySelector("[data-vc-search]");
    search.value = "Operations";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    assert.ok(document.querySelector('[data-vc-select-employee="e1"]').classList.contains("hidden"));
    assert.ok(!document.querySelector('[data-vc-select-employee="e2"]').classList.contains("hidden"));
  });

  test("saves a year-specific remaining balance", async () => {
    const { allowanceUpdates } = createFixture();
    document.querySelector("[data-vc-edit-balance]").click();
    const input = document.querySelector("[data-vc-balance-form] input");
    input.value = "12";
    document.querySelector("[data-vc-balance-form]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(allowanceUpdates, [{ employeeId: "e1", year: 2026, allowance: 17 }]);
  });

  test("switches to the team calendar and opens the booking flow", () => {
    const { bookingCalls } = createFixture();
    document.querySelector('[data-vc-view="calendar"]').click();
    assert.ok(document.querySelector("#vacation-center-calendar"));

    document.querySelector("[data-vc-book]").click();
    assert.deepEqual(bookingCalls, [[]]);
  });
});
