import { describe, test, assert } from "../../test-harness.js";
import { LOCATIONS, TRAVEL_FEES } from "../../../js/shared/locations.js";

describe("Locations", () => {
  test("covers every canonical location with a travel fee", () => {
    LOCATIONS.forEach((location) => {
      assert.ok(Object.prototype.hasOwnProperty.call(TRAVEL_FEES, location), `Missing travel fee for ${location}`);
      assert.ok(Number.isFinite(TRAVEL_FEES[location]), `Travel fee for ${location} must be numeric`);
    });
  });

  test("does not define travel fees for unknown locations", () => {
    const unknownFees = Object.keys(TRAVEL_FEES).filter((location) => !LOCATIONS.includes(location));
    assert.deepEqual(unknownFees, []);
  });

  test("keeps locations unique", () => {
    assert.equal(new Set(LOCATIONS).size, LOCATIONS.length, "Locations list contains duplicates");
  });
});
