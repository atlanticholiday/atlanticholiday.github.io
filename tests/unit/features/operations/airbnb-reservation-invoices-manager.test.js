import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { AirbnbReservationInvoicesManager } from "../../../../js/features/operations/airbnb-reservation-invoices-manager.js";

describe("AirbnbReservationInvoicesManager", () => {
  test("builds the command from selected options and wires open/copy actions", async () => {
    resetDom(`
      <button id="open-airbnb-completed-reservations-btn">Open</button>
      <button id="copy-airbnb-reservation-invoices-command-btn">Copy</button>
      <input type="radio" name="airbnb-invoices-mode" value="download" checked>
      <input type="radio" name="airbnb-invoices-mode" value="dryRun">
      <input type="radio" name="airbnb-invoices-mode" value="reuseSession">
      <input id="airbnb-invoices-pages-input" type="number" value="1">
      <input id="airbnb-invoices-concurrency-input" type="number" value="10">
      <input id="airbnb-invoices-overwrite-input" type="checkbox">
      <p id="airbnb-reservation-invoices-command-description"></p>
      <pre id="airbnb-reservation-invoices-command"></pre>
      <p id="airbnb-reservation-invoices-copy-feedback" class="hidden"></p>
    `);

    const originalOpen = window.open;
    const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
    const copiedValues = [];
    let openedUrl = null;

    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url) => {
        openedUrl = url;
      }
    });

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          copiedValues.push(value);
        }
      }
    });

    try {
      const manager = new AirbnbReservationInvoicesManager();
      manager.init();

      assert.equal(
        document.getElementById("airbnb-reservation-invoices-command").textContent,
        "cd /d \"c:\\Users\\Lucas\\Documents\\GitHub\\horario\" && npm run airbnb:download-reservation-invoices -- --pages 1 --concurrency 10"
      );

      document.getElementById("airbnb-invoices-pages-input").value = "6";
      document.getElementById("airbnb-invoices-concurrency-input").value = "4";
      document.getElementById("airbnb-invoices-overwrite-input").checked = true;
      document.querySelector('input[name="airbnb-invoices-mode"][value="reuseSession"]').checked = true;
      document.querySelector('input[name="airbnb-invoices-mode"][value="reuseSession"]').dispatchEvent(new Event("change"));

      assert.equal(
        document.getElementById("airbnb-reservation-invoices-command").textContent,
        "cd /d \"c:\\Users\\Lucas\\Documents\\GitHub\\horario\" && npm run airbnb:download-reservation-invoices -- --skip-login-prompt --pages 6 --concurrency 4 --overwrite"
      );
      assert.equal(
        document.getElementById("airbnb-reservation-invoices-command-description").textContent,
        "Reuses the saved Airbnb browser session and skips the manual pause before export."
      );

      document.getElementById("open-airbnb-completed-reservations-btn").click();
      assert.equal(openedUrl, "https://www.airbnb.pt/hosting/reservations/completed");

      document.getElementById("copy-airbnb-reservation-invoices-command-btn").click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(
        copiedValues[0],
        "cd /d \"c:\\Users\\Lucas\\Documents\\GitHub\\horario\" && npm run airbnb:download-reservation-invoices -- --skip-login-prompt --pages 6 --concurrency 4 --overwrite"
      );
      assert.equal(
        document.getElementById("airbnb-reservation-invoices-copy-feedback").textContent,
        "Command copied."
      );
    } finally {
      if (originalOpen) {
        Object.defineProperty(window, "open", {
          configurable: true,
          value: originalOpen
        });
      }

      if (originalClipboard) {
        Object.defineProperty(window.navigator, "clipboard", originalClipboard);
      } else {
        delete window.navigator.clipboard;
      }
    }
  });
});
