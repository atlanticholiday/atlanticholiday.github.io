import { describe, test, assert } from "../../test-harness.js";
import { Config } from "../../../js/core/config.js";

describe("Config", () => {
  test("includes the Firebase keys the app expects", () => {
    const keys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
    keys.forEach((key) => {
      assert.ok(Config.firebaseConfig[key], `Missing firebase config key: ${key}`);
    });
  });

  test("defines seven day labels in display order", () => {
    assert.equal(Config.DAYS_OF_WEEK.length, 7);
    assert.deepEqual(Config.DAYS_OF_WEEK, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  test("defines twelve month labels", () => {
    assert.equal(Config.MONTHS_OF_YEAR.length, 12);
    assert.equal(Config.MONTHS_OF_YEAR[0], "January");
    assert.equal(Config.MONTHS_OF_YEAR[11], "December");
  });

  test("keeps schedule status options aligned with the UI vocabulary", () => {
    ["Working", "Vacation", "Sick", "Absent"].forEach((status) => {
      assert.includes(Config.STATUS_OPTIONS, status);
    });
  });
});
