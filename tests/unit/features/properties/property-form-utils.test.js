import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import {
  buildAdvancedPropertyDataFromForm,
  buildQuickPropertyDataFromForm,
  clearAdvancedPropertyForm,
  copyQuickAddValuesToAdvancedForm
} from "../../../../js/features/properties/property-form-utils.js";

function createFixture() {
  resetDom(`
    <input id="property-name">
    <input id="property-location">
    <select id="property-type">
      <option value=""></option>
      <option value="apartment-T2">T2</option>
      <option value="villa-V3">V3</option>
      <option value="hotel">Hotel</option>
    </select>
    <input id="property-rooms">
    <input id="property-bathrooms">
    <input id="property-floor">
    <select id="property-wifi-speed">
      <option value=""></option>
      <option value="fiber">Fiber</option>
    </select>
    <select id="property-wifi-airbnb">
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
    <input id="property-parking-spot">
    <input id="property-parking-floor">
    <select id="property-energy-source">
      <option value=""></option>
      <option value="solar">Solar</option>
    </select>
    <select id="property-smart-tv">
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>

    <input id="advanced-property-name">
    <input id="advanced-property-location">
    <select id="advanced-property-type">
      <option value=""></option>
      <option value="villa-V3">V3</option>
      <option value="guesthouse">Guesthouse</option>
    </select>
    <input id="advanced-property-rooms">
    <input id="advanced-property-bathrooms">
    <input id="advanced-property-floor">
    <select id="advanced-property-status">
      <option value="available">Available</option>
      <option value="maintenance">Maintenance</option>
    </select>
    <select id="advanced-property-wifi-speed">
      <option value=""></option>
      <option value="fiber">Fiber</option>
    </select>
    <select id="advanced-property-wifi-airbnb">
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
    <input id="advanced-property-parking-spot">
    <input id="advanced-property-parking-floor">
    <select id="advanced-property-energy-source">
      <option value=""></option>
      <option value="solar">Solar</option>
    </select>
    <select id="advanced-property-smart-tv">
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
    <input type="checkbox" id="advanced-amenity-wifi">
    <input type="checkbox" id="advanced-amenity-pool">
    <input type="checkbox" id="advanced-amenity-garden">
    <input type="checkbox" id="advanced-amenity-balcony">
    <input type="checkbox" id="advanced-amenity-ac">
    <input type="checkbox" id="advanced-amenity-kitchen">
    <input type="checkbox" id="advanced-amenity-washing-machine">
    <input type="checkbox" id="advanced-amenity-sea-view">
    <p id="advanced-property-error"></p>
  `);
}

describe("property-form-utils", () => {
  test("buildQuickPropertyDataFromForm derives typology-based fields", () => {
    createFixture();

    document.getElementById("property-name").value = "Sunset Apartment";
    document.getElementById("property-location").value = "Lisbon";
    document.getElementById("property-type").value = "apartment-T2";
    document.getElementById("property-rooms").value = "9";
    document.getElementById("property-bathrooms").value = "2.5";
    document.getElementById("property-floor").value = "3";
    document.getElementById("property-wifi-speed").value = "fiber";
    document.getElementById("property-wifi-airbnb").value = "yes";
    document.getElementById("property-parking-spot").value = "A12";
    document.getElementById("property-parking-floor").value = "B1";
    document.getElementById("property-energy-source").value = "solar";
    document.getElementById("property-smart-tv").value = "yes";

    const propertyData = buildQuickPropertyDataFromForm();

    assert.equal(propertyData.name, "Sunset Apartment");
    assert.equal(propertyData.location, "Lisbon");
    assert.equal(propertyData.type, "apartment");
    assert.equal(propertyData.typology, "T2");
    assert.equal(propertyData.rooms, 2);
    assert.equal(propertyData.bathrooms, 2.5);
    assert.equal(propertyData.floor, "3");
    assert.equal(propertyData.wifiSpeed, "fiber");
    assert.equal(propertyData.wifiAirbnb, "yes");
    assert.equal(propertyData.parkingSpot, "A12");
    assert.equal(propertyData.parkingFloor, "B1");
    assert.equal(propertyData.energySource, "solar");
    assert.equal(propertyData.smartTv, "yes");
  });

  test("advanced helpers copy, build, and clear the advanced form", () => {
    createFixture();

    document.getElementById("property-name").value = "Ocean Villa";
    document.getElementById("property-location").value = "Porto";
    document.getElementById("property-type").value = "villa-V3";
    document.getElementById("property-rooms").value = "3";

    copyQuickAddValuesToAdvancedForm();

    assert.equal(document.getElementById("advanced-property-name").value, "Ocean Villa");
    assert.equal(document.getElementById("advanced-property-location").value, "Porto");
    assert.equal(document.getElementById("advanced-property-type").value, "villa-V3");
    assert.equal(document.getElementById("advanced-property-rooms").value, "3");
    assert.equal(document.getElementById("advanced-property-rooms").disabled, true);

    document.getElementById("advanced-property-bathrooms").value = "1.5";
    document.getElementById("advanced-property-floor").value = "2";
    document.getElementById("advanced-property-status").value = "maintenance";
    document.getElementById("advanced-property-wifi-speed").value = "fiber";
    document.getElementById("advanced-property-wifi-airbnb").value = "yes";
    document.getElementById("advanced-property-parking-spot").value = "P4";
    document.getElementById("advanced-property-parking-floor").value = "G";
    document.getElementById("advanced-property-energy-source").value = "solar";
    document.getElementById("advanced-property-smart-tv").value = "yes";
    document.getElementById("advanced-amenity-wifi").checked = true;
    document.getElementById("advanced-amenity-pool").checked = true;
    document.getElementById("advanced-property-error").textContent = "old error";

    const propertyData = buildAdvancedPropertyDataFromForm();

    assert.equal(propertyData.type, "villa");
    assert.equal(propertyData.typology, "V3");
    assert.equal(propertyData.rooms, 3);
    assert.equal(propertyData.status, "maintenance");
    assert.equal(propertyData.bathrooms, 1.5);
    assert.deepEqual(propertyData.amenities, ["wifi", "pool"]);

    clearAdvancedPropertyForm();

    assert.equal(document.getElementById("advanced-property-name").value, "");
    assert.equal(document.getElementById("advanced-property-type").value, "");
    assert.equal(document.getElementById("advanced-property-rooms").value, "");
    assert.equal(document.getElementById("advanced-property-rooms").disabled, false);
    assert.equal(document.getElementById("advanced-amenity-wifi").checked, false);
    assert.equal(document.getElementById("advanced-property-error").textContent, "");
  });
});
