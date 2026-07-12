import { describe, test, assert } from "../../../test-harness.js";
import {
  applyPoolControlsToReservations,
  calculateTouristTaxAmount,
  filterReservations,
  getIsoWeek,
  isPmsReservationHeader,
  isWeeklyReservationSheet,
  normalizePortal,
  normalizePmsReservationRow,
  normalizeReservationRow,
  parsePoolControlMatrix,
  parseNumber,
  parseReservationDate
} from "../../../../js/features/operations/reservations-utils.js";

describe("reservations-utils", () => {
  test("detects weekly reservation sheets and ignores support sheets", () => {
    assert.equal(isWeeklyReservationSheet("95 - 165"), true);
    assert.equal(isWeeklyReservationSheet("0301 - 0901"), true);
    assert.equal(isWeeklyReservationSheet("Piscinas"), false);
    assert.equal(isWeeklyReservationSheet("Taxas"), false);
  });

  test("normalizes reservation rows from the workbook schema", () => {
    const record = normalizeReservationRow({
      Estado: "Paga",
      In: "9/5",
      "Nome alojamento": "Villa Alegria",
      "Chegada Voo": "9h10",
      "Hora in": "16h00",
      Cofre: "3",
      "Piscina Aq.": "pago",
      "Cobrar Piscina": "Cobrar: 45 EUR",
      Pago: "405,00 €",
      "1ª Mensagem": "Enviada",
      Número: "491736682567",
      Out: "18/5",
      A: "2",
      C: "0",
      Nome: "Dietmar Gebert",
      Portal: "Airbnb ",
      SEF: "Validado",
      Noites: "9",
      Taxa: "28",
      "Tax Paga?": "Airbnb",
      Concelho: "Calheta"
    }, { sheetName: "95 - 165", rowNumber: 17 });

    assert.equal(record.checkIn, "2026-05-09");
    assert.equal(record.checkOut, "2026-05-18");
    assert.equal(record.portal, "Airbnb");
    assert.equal(record.poolState, "requested");
    assert.equal(record.poolChargeAmountValue, 45);
    assert.equal(record.poolPaidAmountValue, 405);
    assert.equal(record.poolPaymentState, "paid");
    assert.equal(record.firstMessageState, "sent");
    assert.equal(record.sefState, "validated");
    assert.equal(record.week, "2026-W19");
    assert.equal(record.calculatedTouristTaxAmountValue, 28);
    assert.equal(record.touristTaxDisplayAmountValue, 28);
    assert.equal(record.validationIssues.length, 0);
  });

  test("calculates tourist tax at 2 EUR per taxable guest per night capped at 7 nights", () => {
    assert.equal(calculateTouristTaxAmount({ adults: "2", children: "1", nights: "9" }), 42);
    assert.equal(calculateTouristTaxAmount({ adults: "2", children: "0", nights: "3" }), 12);

    const record = normalizeReservationRow({
      Estado: "Paga",
      In: "9/5",
      "Nome alojamento": "Villa Alegria",
      Out: "18/5",
      A: "2",
      C: "1",
      Nome: "Guest With Child",
      Portal: "Airbnb",
      SEF: "Validado",
      Noites: "9",
      "1ª Mensagem": "Enviada",
      Cofre: "3",
      Número: "123"
    });

    assert.equal(record.calculatedTouristTaxAmountValue, 42);
    assert.equal(record.touristTaxDisplayAmountValue, 42);
    assert.equal(record.touristTaxNeedsChildAgeCheck, true);
    assert.ok(record.validationIssues.includes("tax-child-age-check"));
    assert.equal(record.validationIssues.includes("missing-tax"), false);
  });

  test("flags operational issues that need follow-up", () => {
    const record = normalizeReservationRow({
      Estado: "Paga",
      In: "15/4",
      "Nome alojamento": "Casa do Pico",
      "Piscina Aq.": "???",
      Out: "14/4",
      Nome: "Harriett O'Grady",
      Portal: "Booking",
      SEF: "À espera"
    }, { sheetName: "114 - 174", rowNumber: 103 });

    assert.ok(record.validationIssues.includes("checkout-before-checkin"));
    assert.ok(record.validationIssues.includes("missing-phone"));
    assert.ok(record.validationIssues.includes("missing-first-message"));
    assert.ok(record.validationIssues.includes("missing-arrival"));
    assert.ok(record.validationIssues.includes("pool-follow-up"));
    assert.ok(record.validationIssues.includes("missing-keybox"));
  });

  test("normalizes common portal and numeric formats", () => {
    assert.equal(normalizePortal("Atlanticholidayrentals.com"), "Atlantic");
    assert.equal(normalizePortal(" Booking "), "Booking");
    assert.equal(parseNumber("1.148,50 €"), 1148.5);
    assert.equal(parseNumber("405.0"), 405);
  });

  test("detects and cleans PMS reservation exports", () => {
    assert.equal(isPmsReservationHeader([
      "Referência",
      "Data",
      "Estado",
      "Data de check-in",
      "Nome alojamento",
      "Portal"
    ]), true);

    const record = normalizePmsReservationRow({
      Referência: "A169-5478348777-221",
      Data: "07-05-2026",
      Estado: "Paga",
      "Data de check-in": "14-05-2026",
      "Data de check-out": "19-05-2026",
      noites: "5",
      Adultos: "3",
      Crianças: "0",
      "Nome alojamento": "Infinity Blue",
      Localidade: "Câmara de Lobos",
      "Cliente: Nome": "Oryna",
      "Cliente: Sobrenomes": "Pinchuk",
      "Cliente: Telefone": "+380 96 738 5921",
      "Cliente: E-mail": "guest@example.com",
      Portal: "Booking.com",
      "Total da reserva com imposto": "887,55",
      "Estado check-in online": "À espera",
      "Comentários check-in/check-out": "late arrival"
    }, { sheetName: "Worksheet", rowNumber: 5 });

    assert.equal(record.sourceType, "pms-export");
    assert.equal(record.pmsReference, "A169-5478348777-221");
    assert.equal(record.checkIn, "2026-05-14");
    assert.equal(record.checkOut, "2026-05-19");
    assert.equal(record.guestName, "Oryna Pinchuk");
    assert.equal(record.portal, "Booking");
    assert.equal(record.sefState, "waiting");
    assert.equal(record.totalWithTax, 887.55);
    assert.equal(record.arrivalInfo, "");
    assert.equal(record.firstMessageStatus, "");
    assert.ok(record.validationIssues.includes("missing-arrival"));
    assert.ok(record.validationIssues.includes("missing-first-message"));
  });

  test("filters by worklist and search", () => {
    const records = [
      normalizeReservationRow({
        Estado: "Paga",
        In: "9/5",
        "Nome alojamento": "Villa Alegria",
        "Piscina Aq.": "a espera",
        Cofre: "2",
        Out: "18/5",
        Nome: "Dietmar Gebert",
        Portal: "Airbnb",
        SEF: "Validado",
        Número: "123"
      }),
      normalizeReservationRow({
        Estado: "Paga",
        In: "10/5",
        "Nome alojamento": "Acqua Beach",
        Out: "15/5",
        Nome: "Maria Silva",
        Portal: "Booking",
        SEF: "À espera",
        Número: "456"
      })
    ];

    assert.equal(filterReservations(records, { issue: "pool" }).length, 1);
    assert.equal(filterReservations(records, { issue: "keybox" }).length, 1);
    assert.equal(filterReservations(records, { issue: "sef" }).length, 1);
    assert.equal(filterReservations(records, { search: "acqua" }).length, 1);
  });

  test("parses pool control sheets and merges matching reservations", () => {
    const poolControls = parsePoolControlMatrix([
      ["", "Alojamentos", "", "", "", ""],
      ["", "Villa Alegria", "", "", "", ""],
      ["", "Cobrar: 45 EUR", "", "Pago", "Avantio - 35 EUR", ""],
      ["", "Piscina Ligada 7/5", "", "", "", ""],
      ["", "Sim", "9/5 - 18/5", "Sim", "Sim", ""],
      ["", "Nao", "18/5 - 25/5", "Nao", "Nao", ""]
    ]);

    assert.equal(poolControls.propertySettings.length, 1);
    assert.equal(poolControls.propertySettings[0].poolChargeAmountValue, 45);
    assert.equal(poolControls.propertySettings[0].poolHeatingState, "on");
    assert.equal(poolControls.reservationControls.length, 2);
    assert.equal(poolControls.reservationControls[0].checkIn, "2026-05-09");

    const records = [
      normalizeReservationRow({
        Estado: "Paga",
        In: "9/5",
        "Nome alojamento": "Villa Alegria",
        Out: "18/5",
        Nome: "Pool Guest",
        Portal: "Airbnb",
        SEF: "Validado",
        ["1\u00c2\u00aa Mensagem"]: "Enviada",
        Cofre: "3",
        ["N\u00c3\u00bamero"]: "123"
      })
    ];

    const [merged] = applyPoolControlsToReservations(records, poolControls);
    assert.equal(merged.heatedPool, "Sim");
    assert.equal(merged.poolPaymentState, "paid");
    assert.equal(merged.poolChargeAmountValue, 45);
    assert.equal(merged.poolAvantioAmountValue, 35);
    assert.equal(merged.poolHeatingState, "on");
    assert.equal(merged.validationIssues.includes("pool-payment-missing"), false);
  });

  test("parses short dates and ISO weeks", () => {
    assert.equal(parseReservationDate("3/1"), "2026-01-03");
    assert.equal(parseReservationDate("14-05-2026"), "2026-05-14");
    assert.equal(parseReservationDate("2026-05-09"), "2026-05-09");
    assert.equal(getIsoWeek("2026-01-03"), "2026-W01");
  });
});
