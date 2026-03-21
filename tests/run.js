import { run } from "./test-harness.js";

import "./unit/config.test.js";
import "./unit/enums.test.js";
import "./unit/locations.test.js";
import "./unit/i18n.test.js";
import "./unit/commission-calculator-manager.test.js";
import "./unit/cleaning-bills-manager.test.js";
import "./unit/welcome-pack-manager.test.js";
import "./smoke/html-pages.test.js";
import "./smoke/locales.test.js";

const results = await run();
const total = results.reduce((sum, suite) => sum + suite.tests.length, 0);
const failed = results.reduce((sum, suite) => sum + suite.tests.filter((test) => !test.pass).length, 0);
document.title = failed === 0 ? `PASS ${total}` : `FAIL ${failed}/${total}`;
window.__testResults = results;
