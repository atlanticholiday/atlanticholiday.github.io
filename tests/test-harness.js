const suites = [];
let currentSuite = null;

function ensureSuite(name) {
  let suite = suites.find((entry) => entry.name === name);
  if (!suite) {
    suite = { name, tests: [] };
    suites.push(suite);
  }
  return suite;
}

export function describe(name, fn) {
  const previousSuite = currentSuite;
  currentSuite = ensureSuite(name);
  try {
    fn();
  } finally {
    currentSuite = previousSuite;
  }
}

export function test(name, fn) {
  const suite = currentSuite || ensureSuite("General");
  suite.tests.push({ name, fn });
}

export const assert = {
  ok(value, message = "Expected value to be truthy") {
    if (!value) {
      throw new Error(message);
    }
  },

  equal(actual, expected, message = `Expected ${String(actual)} to equal ${String(expected)}`) {
    if (actual !== expected) {
      throw new Error(message);
    }
  },

  notEqual(actual, expected, message = `Expected ${String(actual)} to not equal ${String(expected)}`) {
    if (actual === expected) {
      throw new Error(message);
    }
  },

  deepEqual(actual, expected, message = "Expected values to be deeply equal") {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right) {
      throw new Error(`${message}\nActual: ${left}\nExpected: ${right}`);
    }
  },

  includes(haystack, needle, message = `Expected value to include ${String(needle)}`) {
    if (!haystack.includes(needle)) {
      throw new Error(message);
    }
  },

  match(value, pattern, message = `Expected ${String(value)} to match ${String(pattern)}`) {
    if (!pattern.test(value)) {
      throw new Error(message);
    }
  }
};

function renderSummary(results) {
  const summary = document.getElementById("summary");
  if (!summary) return;

  const totalSuites = results.length;
  const totalTests = results.reduce((sum, suite) => sum + suite.tests.length, 0);
  const failedTests = results.reduce((sum, suite) => sum + suite.tests.filter((test) => !test.pass).length, 0);
  const passedTests = totalTests - failedTests;

  summary.innerHTML = `
    <article class="card">
      <span class="label">Suites</span>
      <span class="value">${totalSuites}</span>
    </article>
    <article class="card">
      <span class="label">Tests</span>
      <span class="value">${totalTests}</span>
    </article>
    <article class="card">
      <span class="label">Passed</span>
      <span class="value ok">${passedTests}</span>
    </article>
    <article class="card">
      <span class="label">Failed</span>
      <span class="value ${failedTests ? "bad" : "ok"}">${failedTests}</span>
    </article>
  `;
}

function renderResults(results) {
  const container = document.getElementById("results");
  if (!container) return;

  container.innerHTML = results.map((suite) => `
    <section class="suite">
      <h2>${suite.name}</h2>
      <ul>
        ${suite.tests.map((testResult) => `
          <li class="${testResult.pass ? "pass" : "fail"}">
            <span class="status">${testResult.pass ? "PASS" : "FAIL"}</span>
            <span>${testResult.name}</span>
            ${testResult.error ? `<pre>${escapeHtml(testResult.error)}</pre>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function run() {
  const results = [];

  for (const suite of suites) {
    const suiteResult = { name: suite.name, tests: [] };

    for (const entry of suite.tests) {
      try {
        await entry.fn();
        suiteResult.tests.push({ name: entry.name, pass: true });
      } catch (error) {
        suiteResult.tests.push({
          name: entry.name,
          pass: false,
          error: error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error)
        });
      }
    }

    results.push(suiteResult);
  }

  renderSummary(results);
  renderResults(results);
  return results;
}
