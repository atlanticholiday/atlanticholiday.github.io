import { describe, test, assert } from "../../test-harness.js";
import { ENUMS, getEnumOptions } from "../../../js/shared/enums.js";

describe("Enums", () => {
  test("returns enum options for known fields", () => {
    const options = getEnumOptions("wifiSpeed");
    assert.ok(Array.isArray(options), "wifiSpeed options should be an array");
    assert.equal(options[0].value, "basic");
    assert.equal(options[4].value, "fiber");
  });

  test("returns null for unknown fields", () => {
    assert.equal(getEnumOptions("does-not-exist"), null);
  });

  test("keeps every enum option shape consistent", () => {
    Object.entries(ENUMS).forEach(([field, options]) => {
      assert.ok(options.length > 0, `${field} should have at least one option`);
      options.forEach((option) => {
        assert.ok(typeof option.value === "string" && option.value.length > 0, `${field} option is missing a value`);
        assert.ok(typeof option.label === "string" && option.label.length > 0, `${field} option is missing a label`);
      });
    });
  });
});
