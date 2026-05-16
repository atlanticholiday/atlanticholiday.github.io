import { describe, test, assert } from "../../../test-harness.js";
import {
  buildHeatedPoolPlan,
  parseHeatedPoolsCsv
} from "../../../../js/features/operations/heated-pools-utils.js";

const SAMPLE_CSV = [
  ",Alojamentos,,,,,,,,,",
  ",Villa A,,,,,Villa B,,,,",
  ",Cobrar: 45€,,Pago,Avantio - 35€,,Cobrar: 50€,,Pago,Avantio - 40€,",
  ",Piscina desligada 10/5,,,,,Piscina Sempre Ligada,,,,",
  ",Sim,16//5 - 20/5,Não,À espera,,Sim,18/5 - 25/5,Sim,Sim,",
  ",Liga Remotamente,,,,,Leva mais ou menos 2 dias,,,,"
].join("\n");

describe("Heated pools utils", () => {
  test("parses the Google Sheets property-block CSV layout", () => {
    const result = parseHeatedPoolsCsv(SAMPLE_CSV, { fileName: "Lista de Reservas 2026 - Piscinas.csv" });

    assert.equal(result.year, 2026);
    assert.equal(result.summary.properties, 2);
    assert.equal(result.summary.requested, 2);
    assert.equal(result.summary.pendingPayments, 1);

    const villaA = result.properties[0];
    assert.equal(villaA.propertyName, "Villa A");
    assert.equal(villaA.chargeAmount, 45);
    assert.equal(villaA.ownerCostAmount, 35);
    assert.equal(villaA.poolState, "off");
    assert.equal(villaA.lastChangeDate, "2026-05-10");
    assert.equal(villaA.reservations[0].dateRange, "16/5 - 20/5");
    assert.equal(villaA.reservations[0].paymentStatus, "no");
    assert.equal(villaA.reservations[0].avantioStatus, "waiting");

    const villaB = result.properties[1];
    assert.equal(villaB.poolState, "always_on");
    assert.includes(villaB.notes[0], "2 dias");
  });

  test("builds due actions from heating requests", () => {
    const result = parseHeatedPoolsCsv(SAMPLE_CSV, { year: 2026 });
    const plan = buildHeatedPoolPlan(result.properties, { today: "2026-05-15", horizonDays: 14 });

    assert.equal(plan.todayTasks.length, 1);
    assert.equal(plan.todayTasks[0].type, "turn_on");
    assert.equal(plan.todayTasks[0].propertyName, "Villa A");
    assert.equal(plan.upcoming.length, 2);
    assert.deepEqual(plan.upcoming.map((task) => task.type), ["payment_check", "turn_off"]);
    assert.equal(plan.tasks.some((task) => task.propertyName === "Villa B" && task.type === "turn_on"), false);
  });

  test("does not flag a switch-on task when the pool is already on", () => {
    const csv = [
      ",Alojamentos,,,,",
      ",Villa Ready,,,,",
      ",Cobrar: 45€,,Pago,Avantio - 35€,",
      ",Piscina ligada 14/5,,,,",
      ",Sim,16/5 - 20/5,Sim,Sim,"
    ].join("\n");
    const result = parseHeatedPoolsCsv(csv, { year: 2026 });
    const plan = buildHeatedPoolPlan(result.properties, { today: "2026-05-15", horizonDays: 14 });

    assert.equal(plan.overdue.length, 0);
    assert.equal(plan.completed.some((task) => task.type === "turn_on"), true);
  });

  test("recovers property names that appear in the pricing row after merged-sheet export", () => {
    const csv = [
      ",Alojamentos,,,,,,,,,,,,",
      ",Villa Left,,,,,,,,,Villa Right,,",
      ",Cobrar: 45€,,Pago,Avantio - 35€,,Villa Missing,,Pago?,Avantio - 35€,,Cobrar: 45€,,Pago,Avantio - 35€",
      ",Piscina desligada 10/5,,,,,Piscina Sempre Ligada,,,,Piscina ligada 16/5,,",
      ",Sim,1/6 - 5/6,Sim,Sim,,Sim,2/6 - 6/6,Sim,Sim,,Sim,3/6 - 7/6,Sim,Sim"
    ].join("\n");
    const result = parseHeatedPoolsCsv(csv, { year: 2026 });

    assert.deepEqual(result.properties.map((property) => property.propertyName), [
      "Villa Left",
      "Villa Missing",
      "Villa Right"
    ]);
    assert.equal(result.properties[1].poolState, "always_on");
  });
});
