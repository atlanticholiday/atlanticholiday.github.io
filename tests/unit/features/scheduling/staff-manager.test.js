import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { i18n } from "../../../../js/core/i18n.js";
import { StaffManager } from "../../../../js/features/scheduling/staff-manager.js";

function createFixture() {
  resetDom(`
    <div id="staff-page">
      <button id="staff-active-view-btn" data-staff-view-target="active"></button>
      <button id="staff-history-view-btn" data-staff-view-target="history"></button>
      <button id="open-add-employee-modal-btn">Add</button>
      <div id="staff-active-count"></div>
      <div id="staff-archived-count"></div>
      <div id="staff-total-count"></div>
      <div id="staff-panel-eyebrow"></div>
      <div id="staff-panel-title"></div>
      <div id="staff-panel-description"></div>
      <div id="staff-panel-chip"></div>
      <div id="staff-list-container"></div>
      <div id="history-list-container" class="hidden"></div>
    </div>
    <div id="add-employee-modal" class="hidden"></div>
    <button id="add-employee-close-btn">Close</button>
    <button id="add-employee-cancel-btn">Cancel</button>
    <input id="new-employee-name">
    <input id="new-employee-staff-number">
    <input id="new-employee-vacation-adjustment" value="0">
    <div id="work-day-checkboxes"></div>
    <p id="add-employee-error"></p>
    <button id="add-employee-btn">Create</button>
  `);
}

function createUiManager() {
  return {
    populateDayCheckboxes() {
      const container = document.getElementById("work-day-checkboxes");
      const selectedDays = Array.from(container.querySelectorAll("input:checked")).map((checkbox) => Number.parseInt(checkbox.value, 10));
      const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      container.innerHTML = labels.map((label, index) => `
        <label>
          <input type="checkbox" value="${index}" ${selectedDays.includes(index) ? "checked" : ""}>
          <span>${label}</span>
        </label>
      `).join("");
    },
    showEditEmployeeModal() {}
  };
}

function createDataManager({ activeEmployees = [], archivedEmployees = [], addEmployee = async () => {}, hasLoadedEmployeeDirectory = true, loadError = null } = {}) {
  return {
    getActiveEmployees() {
      return activeEmployees;
    },
    getArchivedEmployees() {
      return archivedEmployees;
    },
    async addEmployee(...args) {
      return addEmployee(...args);
    },
    async archiveEmployee() {},
    async restoreEmployee() {},
    async deleteEmployee() {},
    getEmployeeLoadError() {
      return loadError;
    },
    hasLoadedEmployeeDirectory() {
      return hasLoadedEmployeeDirectory;
    },
    subscribeToDataChanges(handler) {
      this.onDataChange = handler;
    }
  };
}

function flushAsyncWork() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function installStaffTranslations() {
  const previousTranslations = i18n.translations;
  const previousLang = i18n.currentLang;

  i18n.translations = {
    en: {
      common: {
        edit: "Edit",
        delete: "Delete",
        loading: "Loading..."
      },
      days: {
        short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      },
      staff: {
        archive: "Archive",
        restore: "Restore",
        defaultDays: "Default days",
        noMeta: "No extra profile details yet",
        archivedNote: "Archived record",
        views: {
          active: "Active",
          archive: "Archive"
        },
        panels: {
          active: {
            eyebrow: "Live directory",
            title: "Active colleagues",
            description: "Review live staff."
          },
          archive: {
            eyebrow: "Archived directory",
            title: "Archived colleagues",
            description: "Review archived staff."
          }
        },
        validation: {
          nameRequired: "Please enter a name.",
          workDaysRequired: "Please select at least one day."
        }
      }
    },
    pt: {
      common: {
        edit: "Editar",
        delete: "Eliminar",
        loading: "A carregar..."
      },
      days: {
        short: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
      },
      staff: {
        archive: "Arquivar",
        restore: "Restaurar",
        defaultDays: "Dias base",
        noMeta: "Ainda sem detalhes extra no perfil",
        archivedNote: "Registo arquivado",
        views: {
          active: "Ativos",
          archive: "Arquivo"
        },
        panels: {
          active: {
            eyebrow: "Diretorio ativo",
            title: "Colegas ativos",
            description: "Reveja equipa ativa."
          },
          archive: {
            eyebrow: "Diretorio arquivado",
            title: "Colegas arquivados",
            description: "Reveja equipa arquivada."
          }
        },
        validation: {
          nameRequired: "Introduza um nome.",
          workDaysRequired: "Selecione pelo menos um dia."
        }
      }
    }
  };
  i18n.currentLang = "en";

  return () => {
    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  };
}

describe("StaffManager", () => {
  test("renders staff cards and rerenders copy when the language changes", () => {
    const restoreI18n = installStaffTranslations();

    createFixture();

    const manager = new StaffManager(
      createDataManager({
        activeEmployees: [
          {
            id: "emp-1",
            name: "Ana Silva",
            department: "Ops",
            workDays: [1, 3]
          }
        ],
        archivedEmployees: [
          {
            id: "emp-2",
            name: "Luis Costa",
            workDays: [2]
          }
        ]
      }),
      createUiManager()
    );

    manager.render();

    assert.equal(document.getElementById("staff-active-count").textContent, "1");
    assert.equal(document.getElementById("staff-archived-count").textContent, "1");
    assert.equal(document.getElementById("staff-total-count").textContent, "2");
    assert.includes(document.getElementById("staff-list-container").textContent, "Ana Silva");
    assert.includes(document.getElementById("staff-list-container").textContent, "Mon, Wed");

    i18n.currentLang = "pt";
    window.dispatchEvent(new CustomEvent("languageChanged"));

    assert.equal(document.getElementById("staff-panel-title").textContent, "Colegas ativos");
    assert.includes(document.getElementById("staff-list-container").textContent, "Seg, Qua");

    restoreI18n();
  });

  test("opens the add colleague modal with weekday checkboxes and forwards vacation adjustment", async () => {
    const restoreI18n = installStaffTranslations();
    createFixture();

    const addEmployeeCalls = [];
    new StaffManager(
      createDataManager({
        addEmployee: async (...args) => {
          addEmployeeCalls.push(args);
        }
      }),
      createUiManager()
    );

    document.getElementById("open-add-employee-modal-btn").click();

    assert.ok(!document.getElementById("add-employee-modal").classList.contains("hidden"));
    assert.equal(document.querySelectorAll("#work-day-checkboxes input").length, 7);

    document.getElementById("new-employee-name").value = "Rita";
    document.getElementById("new-employee-staff-number").value = "15";
    document.getElementById("new-employee-vacation-adjustment").value = "4";
    document.querySelectorAll("#work-day-checkboxes input")[1].checked = true;

    document.getElementById("add-employee-btn").click();
    await flushAsyncWork();

    assert.equal(addEmployeeCalls.length, 1);
    assert.equal(addEmployeeCalls[0][0], "Rita");
    assert.equal(addEmployeeCalls[0][1], "15");
    assert.deepEqual(addEmployeeCalls[0][2], [1]);
    assert.deepEqual(addEmployeeCalls[0][3], { vacationAdjustment: "4" });
    assert.ok(document.getElementById("add-employee-modal").classList.contains("hidden"));
    assert.equal(document.getElementById("new-employee-vacation-adjustment").value, "0");

    restoreI18n();
  });

  test("switches to the archive view from the new view tabs", () => {
    const restoreI18n = installStaffTranslations();
    createFixture();

    new StaffManager(
      createDataManager({
        archivedEmployees: [
          {
            id: "emp-9",
            name: "Archived Ana",
            workDays: [5]
          }
        ]
      }),
      createUiManager()
    );

    document.getElementById("staff-history-view-btn").click();

    assert.ok(document.getElementById("staff-list-container").classList.contains("hidden"));
    assert.ok(!document.getElementById("history-list-container").classList.contains("hidden"));
    assert.equal(document.getElementById("staff-panel-title").textContent, "Archived colleagues");
    assert.includes(document.getElementById("history-list-container").textContent, "Archived Ana");

    restoreI18n();
  });
});
