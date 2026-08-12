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
      hireDate: "2024-05-15",
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
    const workspace = document.querySelector(".vacation-center-workspace");
    const search = document.querySelector("[data-vc-search]");

    document.querySelector('[data-vc-select-employee="e2"]').click();

    assert.includes(document.querySelector(".vacation-center-inspector").textContent, "Bruno Costa");
    assert.equal(document.querySelector(".vacation-center-workspace"), workspace);
    assert.equal(document.querySelector("[data-vc-search]"), search);
    assert.ok(document.querySelector('[data-vc-select-employee="e2"]').classList.contains("is-selected"));
    assert.ok(!document.querySelector('[data-vc-select-employee="e1"]').classList.contains("is-selected"));
  });

  test("only uses the entrance animation for the first workspace render", () => {
    const { manager } = createFixture();
    assert.ok(document.querySelector(".vacation-center-workspace").classList.contains("is-entering"));

    manager.render();

    assert.ok(!document.querySelector(".vacation-center-workspace").classList.contains("is-entering"));
  });

  test("filters the roster without losing the inspector", () => {
    createFixture();
    const search = document.querySelector("[data-vc-search]");
    search.value = "Operations";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    assert.ok(document.querySelector('[data-vc-select-employee="e1"]').classList.contains("hidden"));
    assert.ok(!document.querySelector('[data-vc-select-employee="e2"]').classList.contains("hidden"));
  });

  test("does not show history from before the colleague's entrance year", () => {
    createFixture();

    const historyYears = [...document.querySelectorAll("[data-vc-history-year]")]
      .map((button) => Number(button.dataset.vcHistoryYear));

    assert.deepEqual(historyYears, [2026, 2025, 2024]);
    assert.equal(document.querySelector('[data-vc-history-step="-1"]').disabled, false);

    document.querySelector('[data-vc-history-year="2024"]').click();

    assert.deepEqual(
      [...document.querySelectorAll("[data-vc-history-year]")].map((button) => Number(button.dataset.vcHistoryYear)),
      [2024]
    );
    assert.equal(document.querySelector('[data-vc-history-step="-1"]').disabled, true);
  });

  test("moves forward again after reviewing an older year", () => {
    const { manager } = createFixture();
    document.querySelector('[data-vc-history-year="2025"]').click();
    assert.equal(manager.currentYear, 2025);

    document.querySelector('[data-vc-history-step="1"]').click();

    assert.equal(manager.currentYear, 2026);
    assert.equal(document.querySelector('[data-vc-history-step="1"]').disabled, true);
    assert.equal(document.querySelector('[data-vc-history-year="2026"]').getAttribute("aria-current"), "true");
  });

  test("shows an all-years used and remaining total from the entrance year", () => {
    const { manager } = createFixture();

    document.querySelector("[data-vc-toggle-all-years]").click();

    const summary = document.querySelector("[data-vc-all-years-summary]");
    const values = [...summary.querySelectorAll("dd")].map((element) => Number(element.textContent));
    assert.deepEqual(values, [5, 61]);
    assert.equal(document.querySelector("[data-vc-toggle-all-years]").getAttribute("aria-expanded"), "true");
    assert.deepEqual(manager.getEmployeeAllYearsSummary(manager.getEmployees()[0], manager.getVacationEntries()), {
      startYear: 2024,
      endYear: 2026,
      usedDays: 5,
      remainingDays: 61,
      closedYears: 0
    });
  });

  test("excludes closed years from total remaining to avoid counting carry-over twice", () => {
    const { manager, employees } = createFixture();
    manager.dataManager.isVacationYearClosed = (year) => year === 2024;

    assert.deepEqual(manager.getEmployeeAllYearsSummary(employees[0], manager.getVacationEntries()), {
      startYear: 2024,
      endYear: 2026,
      usedDays: 5,
      remainingDays: 39,
      closedYears: 1
    });
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
    assert.ok(document.querySelector("[data-vc-calendar-department]"));
    assert.ok(document.querySelector("[data-vc-calendar-employee]"));
    assert.ok(document.querySelector("[data-vc-calendar-type]"));

    document.querySelector("[data-vc-book]").click();
    assert.deepEqual(bookingCalls, [[]]);
  });

  test("renders annual reports and exports them to Excel", () => {
    createFixture();
    let exportedFilename = null;
    window.XLSX = {
      utils: {
        json_to_sheet: () => ({}),
        book_new: () => ({}),
        book_append_sheet: () => {}
      },
      writeFile: (_workbook, filename) => { exportedFilename = filename; }
    };

    document.querySelector('[data-vc-view="reports"]').click();
    assert.ok(document.querySelector(".vacation-center-report-table"));
    document.querySelector("[data-vc-export-excel]").click();

    assert.equal(exportedFilename, "Atlantic-Holiday-Leave-2026.xlsx");
    delete window.XLSX;
  });
});
