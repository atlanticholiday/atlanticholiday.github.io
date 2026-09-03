import { describe, test, assert } from "../../../test-harness.js";
import {
  appendPoolStatusHistory,
  buildHeatedPoolPropertyDirectory,
  buildHeatedPoolPlan,
  HEATED_POOL_PROPERTY_NAMES,
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
    assert.equal(plan.upcoming.length, 3);
    assert.deepEqual(plan.upcoming.map((task) => task.type), ["payment_check", "avantio_check", "turn_off"]);
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

  test("keeps payment and Avantio work as separate actions", () => {
    const property = {
      id: "villa-finance",
      propertyName: "Villa Finance",
      poolState: "always_on",
      reservations: [{
        id: "res-finance",
        startDate: "2026-06-10",
        endDate: "2026-06-15",
        heatingRequested: true,
        paymentStatus: "no",
        avantioStatus: "waiting",
        taskClaims: {
          avantio_check: {
            at: "2026-06-09T09:00:00.000Z",
            planningDate: "2026-06-09",
            actor: { uid: "user-1", name: "Ana" }
          }
        }
      }]
    };

    const plan = buildHeatedPoolPlan([property], { today: "2026-06-09", horizonDays: 14 });

    assert.deepEqual(plan.upcoming.map((task) => task.type), ["payment_check", "avantio_check"]);
    assert.equal(plan.upcoming.find((task) => task.type === "avantio_check").claim.actor.name, "Ana");

    property.reservations[0].paymentStatus = "yes";
    property.reservations[0].taskCompletions = {
      payment_check: {
        at: "2026-06-09T10:00:00.000Z",
        planningDate: "2026-06-09",
        actor: { uid: "user-2", name: "Joao" }
      }
    };
    const afterPayment = buildHeatedPoolPlan([property], { today: "2026-06-09", horizonDays: 14 });
    assert.equal(afterPayment.completed.some((task) => task.type === "payment_check"), true);
    assert.equal(afterPayment.upcoming.some((task) => task.type === "avantio_check"), true);
  });

  test("uses reservation-specific completion when several bookings share one pool state", () => {
    const reservations = [
      {
        id: "res-a",
        startDate: "2026-06-10",
        endDate: "2026-06-12",
        heatingRequested: true,
        paymentStatus: "yes",
        avantioStatus: "yes",
        taskCompletions: {}
      },
      {
        id: "res-b",
        startDate: "2026-06-14",
        endDate: "2026-06-16",
        heatingRequested: true,
        paymentStatus: "yes",
        avantioStatus: "yes",
        taskCompletions: {}
      }
    ];
    const property = {
      id: "villa-shared-state",
      propertyName: "Villa Shared State",
      poolState: "on",
      lastChangeDate: "2026-06-09",
      statusHistory: [],
      reservations
    };

    const before = buildHeatedPoolPlan([property], { today: "2026-06-09", horizonDays: 14 });
    assert.equal(before.upcoming.some((task) => task.type === "turn_on" && task.reservation.id === "res-a"), false);
    assert.equal(before.todayTasks.some((task) => task.type === "turn_on" && task.reservation.id === "res-a"), true);

    reservations[0].taskCompletions.turn_on = {
      at: "2026-06-09T10:00:00.000Z",
      planningDate: "2026-06-09",
      actor: { uid: "user-2", name: "Joao" }
    };
    const after = buildHeatedPoolPlan([property], { today: "2026-06-09", horizonDays: 14 });
    const completed = after.completed.find((task) => task.type === "turn_on" && task.reservation.id === "res-a");
    assert.equal(completed.completion.actor.name, "Joao");
    assert.equal(after.upcoming.some((task) => task.type === "turn_on" && task.reservation.id === "res-b"), true);
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

  test("records a manual state change with its colleague and reservation", () => {
    const history = appendPoolStatusHistory([], {
      id: "change-1",
      previousState: "off",
      state: "on",
      at: "2026-08-23T09:30:00.000Z",
      planningDate: "2026-08-23",
      actor: { uid: "user-1", email: "ana@example.com", name: "Ana" },
      reservation: { id: "res-1", dateRange: "24/8 - 31/8" }
    });

    assert.equal(history.length, 1);
    assert.equal(history[0].previousState, "off");
    assert.equal(history[0].state, "on");
    assert.equal(history[0].actor.name, "Ana");
    assert.equal(history[0].reservation.id, "res-1");
    assert.equal(history[0].reservation.label, "24/8 - 31/8");
  });

  test("does not add duplicate no-op state changes", () => {
    const original = [{ id: "existing", state: "on" }];
    const history = appendPoolStatusHistory(original, {
      previousState: "on",
      state: "on"
    });

    assert.equal(history, original);
  });

  test("keeps the heated-pool directory restricted to safe display fields", () => {
    const directory = buildHeatedPoolPropertyDirectory([
      { id: "villa-1", name: "Villa Ocean Haven", apiKey: "must-not-leak", icalUrl: "private" },
      { id: "villa-2", displayName: "Villa Vista Atlântica", ownerEmail: "private@example.com" },
      { id: "other", name: "Not approved", apiSecret: "must-not-leak" }
    ]);

    assert.equal(HEATED_POOL_PROPERTY_NAMES.length, 21);
    assert.deepEqual(directory, [
      { id: "villa-1", name: "Villa Ocean Haven" },
      { id: "villa-2", name: "Villa Vista Atlântica" }
    ]);
    assert.equal(JSON.stringify(directory).includes("must-not-leak"), false);
    assert.equal(JSON.stringify(directory).includes("private@example.com"), false);
  });
});
