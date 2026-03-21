import { describe, test, assert } from "../../../test-harness.js";
import { resetDom, createStorageMock } from "../../../test-utils.js";
import { PropertiesDashboardController } from "../../../../js/features/properties/properties-dashboard-controller.js";

describe("PropertiesDashboardController", () => {
  test("registers global edit and delete actions against the active properties manager", async () => {
    resetDom("");

    const deletedIds = [];
    const sessionStorageRef = createStorageMock();
    const windowRef = {
      location: { href: "" },
      confirm() { return true; },
      alert() {},
      setTimeout(callback) { callback(); }
    };
    const property = { id: "p1", name: "Ocean Villa", location: "Porto" };
    const propertiesManager = {
      getPropertyById(id) {
        return id === "p1" ? property : null;
      },
      async deleteProperty(id) {
        deletedIds.push(id);
      }
    };

    const controller = new PropertiesDashboardController({
      getPropertiesManager: () => propertiesManager,
      documentRef: document,
      windowRef,
      sessionStorageRef
    });

    controller.init();

    windowRef.editProperty("p1");
    await windowRef.deleteProperty("p1");

    assert.equal(windowRef.location.href, "property-settings.html?propertyId=p1");
    assert.includes(sessionStorageRef.getItem("currentProperty"), "\"id\":\"p1\"");
    assert.equal(deletedIds.length, 1);
    assert.equal(deletedIds[0], "p1");
  });
});
