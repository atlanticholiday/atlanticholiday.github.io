import { describe, test, assert } from "../../../test-harness.js";
import {
  compareAlojamentosProperties,
  normalizePropertyTypology,
  parseAlojamentosRows
} from "../../../../js/features/properties/property-import-utils.js";

describe("property-import-utils", () => {
  test("normalizes Portuguese typologies into property fields", () => {
    assert.deepEqual(normalizePropertyTypology("T 2"), {
      typology: "T2",
      type: "apartment",
      rooms: 2
    });

    assert.deepEqual(normalizePropertyTypology("v3"), {
      typology: "V3",
      type: "villa",
      rooms: 3
    });

    assert.equal(normalizePropertyTypology("A2"), null);
  });

  test("parses Alojamentos rows by header name", () => {
    const rows = [
      ["", "", "", "", ""],
      ["", "Alojamento", "Localização", "Tipologia", ""],
      ["", "Acanto Loft", "Funchal", "T1", ""],
      ["", "Atlantic Lookout", "Calheta", "V3", ""],
      ["", "", "", "", ""],
      ["", "Broken Place", "Funchal", "bad", ""]
    ];

    const result = parseAlojamentosRows(rows);

    assert.equal(result.properties.length, 2);
    assert.equal(result.properties[0].name, "Acanto Loft");
    assert.equal(result.properties[0].location, "Funchal");
    assert.equal(result.properties[0].type, "apartment");
    assert.equal(result.properties[0].typology, "T1");
    assert.equal(result.properties[1].type, "villa");
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].lineNumber, 6);
  });

  test("reports missing required headers", () => {
    const result = parseAlojamentosRows([["Name", "City", "Type"]]);

    assert.equal(result.properties.length, 0);
    assert.equal(result.errors.length, 1);
  });

  test("compares imported Alojamentos rows with app properties", () => {
    const comparison = compareAlojamentosProperties(
      [
        { name: "Acanto Loft", location: "Funchal", typology: "T1" },
        { name: "Old Property", location: "Machico", typology: "T2" }
      ],
      [
        { name: "Acanto Loft", location: "Santa Cruz", typology: "T1" },
        { name: "Atlantic Lookout", location: "Calheta", typology: "V3" }
      ]
    );

    assert.equal(comparison.totals.matched, 1);
    assert.equal(comparison.totals.missingInApp, 1);
    assert.equal(comparison.totals.extraInApp, 1);
    assert.equal(comparison.totals.differences, 1);
    assert.equal(comparison.differences[0].fields[0].field, "location");
  });
});
