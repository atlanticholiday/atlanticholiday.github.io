import { describe, test, assert } from "../test-harness.js";

describe("Locales smoke", () => {
  test("English and Portuguese locale files are valid JSON objects", async () => {
    for (const path of ["../locales/en.json", "../locales/pt.json"]) {
      const response = await fetch(path);
      assert.ok(response.ok, `Failed to fetch ${path}`);

      const json = await response.json();
      assert.ok(json && typeof json === "object" && !Array.isArray(json), `${path} should contain an object`);
    }
  });
});
