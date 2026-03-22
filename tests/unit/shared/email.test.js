import { describe, test, assert } from "../../test-harness.js";
import { canonicalizeEmail, getEmailLookupKeys, getNormalizedEmailDisplay } from "../../../js/shared/email.js";

describe("Email helpers", () => {
  test("normalizes standard email casing and spacing", () => {
    assert.equal(getNormalizedEmailDisplay("  USER@Example.com "), "user@example.com");
    assert.equal(canonicalizeEmail("  USER@Example.com "), "user@example.com");
  });

  test("canonicalizes gmail dot and plus aliases for matching", () => {
    assert.equal(
      canonicalizeEmail("Nastassja.DeAguiarAtlantic+clock@gmail.com"),
      "nastassjadeaguiaratlantic@gmail.com"
    );
  });

  test("returns both canonical and raw keys when they differ", () => {
    assert.deepEqual(
      getEmailLookupKeys("Name.With.Dots+tag@gmail.com"),
      ["namewithdots@gmail.com", "name.with.dots+tag@gmail.com"]
    );
  });
});
