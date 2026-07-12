import { describe, test, assert } from "../../../test-harness.js";
import {
  compareAlojamentosProperties,
  normalizePropertyTypology,
  parseAhWorkbookImport,
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

  test("parses names-only Alojamentos sheet", () => {
    const result = parseAlojamentosRows([
      ["Alojamento", "", "Lista de folhas"],
      ["Acanto Loft", "", "Códigos"],
      ["Atlantic Lookout", "", "Kit"]
    ]);

    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.properties.map((property) => property.name), ["Acanto Loft", "Atlantic Lookout"]);
    assert.equal(result.properties[0].location, undefined);
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

  test("builds AH workbook updates from supported sheets", () => {
    const result = parseAhWorkbookImport(
      {
        "Vídeos check-in": [
          ["Alojamentos", "Video de check-in", "Google Drive", "Link dos vídeos", "Notas"],
          ["Acanto Loft", "Sim 2 vídeos", "Sim", "https://example.com/video", "Needs sun"]
        ],
        "Recomendações": [
          ["Alojamentos", "Link das recomendações", "Links recomendações para editar", "Feito", "Notas"],
          ["Acanto Loft", "https://example.com/guest", "https://example.com/edit", "Sim", ""],
          ["Missing Place", "https://example.com/missing", "", "Sim", ""]
        ],
        "Seguro - RNAL 2026": [
          ["Alojamentos", "Nº AL", "Feito por nós?", "Se feito por nós, já está feito?", "Validade"],
          ["Acanto Loft", "160480/AL", "Sim", "Sim", 45930]
        ]
      },
      [{ id: "property-1", name: "Acanto Loft", checkinVideos: "" }]
    );

    assert.equal(result.totals.propertiesToUpdate, 1);
    assert.equal(result.totals.missingInApp, 1);
    assert.equal(result.updates[0].updates.checkinVideos, 2);
    assert.equal(result.updates[0].updates.googleDriveEnabled, "yes");
    assert.equal(result.updates[0].updates.recommendationsStatus, "yes");
    assert.equal(result.updates[0].updates.rnalNumber, "160480/AL");
    assert.equal(result.updates[0].updates.insuranceValidity, "2025-09-30");
  });

  test("does not overwrite existing property information", () => {
    const result = parseAhWorkbookImport(
      {
        "recomendacoes": [
          ["Alojamentos", "Link das recomendacoes", "Links recomendacoes para editar", "Feito", "Notas"],
          ["Acanto Loft", "https://new.example.com/guest", "https://new.example.com/edit", "Sim", "Workbook note"]
        ],
        "livros reclamacoes": [
          ["Alojamento", "Livros de reclamacoes", "Livros de reclamacoes Online", "Conta", "Password"],
          ["Acanto Loft", "Escritorio", "Sim", "new@example.com", "new-password"]
        ]
      },
      [{
        id: "property-1",
        name: "Acanto Loft",
        recommendationsLink: "https://existing.example.com/guest",
        onlineComplaintBooksEmail: "existing@example.com"
      }]
    );

    assert.equal(result.totals.propertiesToUpdate, 1);
    assert.equal(result.totals.skippedExistingFields, 2);
    assert.equal(result.updates[0].updates.recommendationsLink, undefined);
    assert.equal(result.updates[0].updates.onlineComplaintBooksEmail, undefined);
    assert.equal(result.updates[0].updates.recommendationsStatus, "yes");
    assert.equal(result.updates[0].updates.onlineComplaintBooksEnabled, "yes");
  });

  test("can explicitly build replacement updates for existing information", () => {
    const result = parseAhWorkbookImport(
      {
        "recomendacoes": [
          ["Alojamentos", "Link das recomendacoes", "Links recomendacoes para editar", "Feito", "Notas"],
          ["Acanto Loft", "https://new.example.com/guest", "https://new.example.com/edit", "Sim", "Workbook note"]
        ]
      },
      [{
        id: "property-1",
        name: "Acanto Loft",
        recommendationsLink: "https://existing.example.com/guest",
        recommendationsStatus: "missing"
      }],
      { overwriteExisting: true }
    );

    assert.equal(result.totals.propertiesToUpdate, 1);
    assert.equal(result.totals.replacedExistingFields, 2);
    assert.equal(result.updates[0].updates.recommendationsLink, "https://new.example.com/guest");
    assert.equal(result.updates[0].updates.recommendationsStatus, "yes");
  });

  test("imports recognized Portuguese columns from arbitrary sheet names and reports unsupported columns", () => {
    const result = parseAhWorkbookImport(
      {
        "Minha Folha": [
          ["Alojamento", "Localização no Google Maps", "Coluna Desconhecida"],
          ["Acanto Loft", "https://maps.example.com/acanto", "Valor ignorado"]
        ]
      },
      [{ id: "property-1", name: "Acanto Loft" }]
    );

    assert.equal(result.totals.propertiesToUpdate, 1);
    assert.equal(result.updates[0].updates.googleMapsLink, "https://maps.example.com/acanto");
    assert.equal(result.appliedChanges[0].action, "fill");
    assert.equal(result.unsupportedColumns[0].column, "Coluna Desconhecida");
  });

  test("does not report sheet-specific mapped columns as unsupported", () => {
    const result = parseAhWorkbookImport(
      {
        "Contratos": [
          ["Alojamento", "Feito", "Assinado", "Digitalizado", "Notas"],
          ["Acanto Loft", "Sim", "Sim", "Sim", "Tudo ok"]
        ]
      },
      [{ id: "property-1", name: "Acanto Loft" }]
    );

    assert.equal(result.totals.propertiesToUpdate, 1);
    assert.equal(result.unsupportedColumns.length, 0);
    assert.equal(result.updates[0].updates.contractsStatus, "signed");
    assert.equal(result.updates[0].updates.contractNotes, "Tudo ok");
  });

  test("imports Placas signage columns into signage fields", () => {
    const result = parseAhWorkbookImport(
      {
        "Placas": [
          ["Alojamento", "Placa \"Private\"", "Placa \"Proibido Fumar\"", "Placa \"Não publicidade\"", "Placa do Ruído", "Placa \"AL AH\"", "Aviso das chaves", "Placa WC", "Notas"],
          ["Acanto Loft", "Não é preciso", "Sim", "Não", "Sim", "Não", "Falta verificar", "Não", "Falta colocar sem o nome Pestana"],
          ["Agostinho Apartment", "Não é preciso", "Falta verificar", "Não é preciso", "Sim", "Não é preciso", "Não é preciso", "Sim", ""]
        ]
      },
      [
        { id: "property-1", name: "Acanto Loft" },
        { id: "property-2", name: "Agostinho Apartment" }
      ]
    );

    assert.equal(result.totals.propertiesToUpdate, 2);
    assert.equal(result.unsupportedColumns.length, 0);
    assert.equal(result.updates[0].updates.privateSign, "not-necessary");
    assert.equal(result.updates[0].updates.noSmokingSign, "yes");
    assert.equal(result.updates[0].updates.noJunkMailSign, "no");
    assert.equal(result.updates[0].updates.noiseSign, "yes");
    assert.equal(result.updates[0].updates.alAhSign, "no");
    assert.equal(result.updates[0].updates.keysNotice, "needs-checking");
    assert.equal(result.updates[0].updates.wcSign, "no");
    assert.equal(result.updates[0].updates.signageNotes, "Falta colocar sem o nome Pestana");
    assert.equal(result.updates[1].updates.wcSign, "yes");
  });
});
