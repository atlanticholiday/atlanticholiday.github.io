import { describe, test, assert } from "../../test-harness.js";
import { ChangeNotifier } from "../../../js/shared/change-notifier.js";

describe("ChangeNotifier", () => {
  test("notifies every subscriber in registration order", () => {
    const notifier = new ChangeNotifier();
    const calls = [];

    notifier.subscribe(() => calls.push("first"));
    notifier.subscribe(() => calls.push("second"));

    notifier.notify();

    assert.deepEqual(calls, ["first", "second"]);
  });

  test("supports unsubscribing individual subscribers", () => {
    const notifier = new ChangeNotifier();
    let count = 0;

    const unsubscribe = notifier.subscribe(() => {
      count += 1;
    });

    notifier.notify();
    unsubscribe();
    notifier.notify();

    assert.equal(count, 1);
  });
});
