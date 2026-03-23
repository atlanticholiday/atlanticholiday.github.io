import { describe, test, assert } from "../../../test-harness.js";
import { buildEmployeeAccessOverview } from "../../../../js/features/admin/access-linking.js";
import { TIME_CLOCK_STATION_ROLE } from "../../../../js/shared/access-roles.js";

describe("Access linking", () => {
  test("classifies missing email, missing access, clock-only, station, and privileged staff access", () => {
    const rows = buildEmployeeAccessOverview(
      [
        { id: "1", name: "Ana", email: "ana@example.com" },
        { id: "2", name: "Bruno", email: "bruno@example.com" },
        { id: "3", name: "Carla" },
        { id: "4", name: "Duarte", email: "duarte@example.com" },
        { id: "5", name: "Eva", email: "eva@example.com" }
      ],
      [
        { email: "ana@example.com", roles: [] },
        { email: "bruno@example.com", roles: ["manager"] },
        { email: "eva@example.com", roles: [TIME_CLOCK_STATION_ROLE] },
        { email: "other@example.com", roles: [] }
      ]
    );

    const byName = Object.fromEntries(rows.map((row) => [row.employeeName, row]));

    assert.equal(byName.Ana.status, "clock-only");
    assert.equal(byName.Bruno.status, "privileged");
    assert.equal(byName.Carla.status, "missing-email");
    assert.equal(byName.Duarte.status, "missing-access");
    assert.equal(byName.Eva.status, "station");
  });

  test("matches gmail aliases canonically", () => {
    const [row] = buildEmployeeAccessOverview(
      [{ id: "1", name: "Nastassja", email: "nastassjadeaguiaratlantic@gmail.com" }],
      [{ email: "nastassja.deaguiaratlantic+clock@gmail.com", roles: ["employee"] }]
    );

    assert.equal(row.status, "clock-only");
  });
});
