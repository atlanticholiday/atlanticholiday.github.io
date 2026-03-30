import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { i18n } from "../../../../js/core/i18n.js";
import { renderMonthlyCalendarView } from "../../../../js/features/scheduling/views/monthly-schedule-view.js";

function createDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("monthly-schedule-view", () => {
  test("renders weekday headers from Monday and offsets Sunday-start months correctly", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;

    i18n.translations = {
      en: {
        schedule: {
          legend: {
            holiday: "Holiday",
            offWeekend: "Off/Weekend"
          },
          calendar: {
            working: "working",
            absent: "absent",
            onVacation: "on vacation",
            understaffed: "Understaffed"
          },
          workspace: {
            clearDay: "No conflicts"
          },
          viewDescriptions: {
            monthlyShort: "Coverage at a glance"
          }
        }
      }
    };
    i18n.currentLang = "en";

    resetDom(`
      <div id="calendar-grid"></div>
      <div id="calendar-mobile-cards"></div>
    `);

    const employees = [
      { id: "e1", workDays: [1, 2, 3, 4, 5] },
      { id: "e2", workDays: [1, 2, 3, 4, 5] }
    ];

    const dataManager = {
      minStaffThreshold: 0,
      getCurrentDate() {
        return new Date(2026, 2, 1);
      },
      getHolidaysForYear() {
        return {};
      },
      getDateKey(date) {
        return createDateKey(date);
      },
      getDailyNote() {
        return "";
      },
      getActiveEmployees() {
        return employees;
      },
      getEmployeeStatusForDate(employee, date) {
        return employee.workDays.includes(date.getDay()) ? "Working" : "Off";
      }
    };

    renderMonthlyCalendarView({ dataManager });

    const gridChildren = Array.from(document.getElementById("calendar-grid").children);
    const weekdayHeaders = gridChildren.slice(0, 7).map((node) => node.textContent.trim());
    assert.deepEqual(weekdayHeaders, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    const firstDateCellIndex = gridChildren.findIndex((node) => node.dataset?.date === "2026-03-01");
    assert.equal(firstDateCellIndex, 13, "March 2026 should render after six Monday-first placeholders");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });
});
