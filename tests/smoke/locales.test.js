import { describe, test, assert } from "../test-harness.js";

describe("Locales smoke", () => {
  test("English and Portuguese locale files are valid JSON objects", async () => {
    for (const path of ["../locales/en.json", "../locales/pt.json"]) {
      const response = await fetch(path);
      assert.ok(response.ok, `Failed to fetch ${path}`);

      const json = await response.json();
      assert.ok(json && typeof json === "object" && !Array.isArray(json), `${path} should contain an object`);
      assert.equal(json.landing.title, path.includes("/en.") ? "Team Hub" : "Portal da Equipa");
    }
  });

  test("Heated Pools has complete English and Portuguese translations", async () => {
    const [englishResponse, portugueseResponse, htmlResponse, managerResponse] = await Promise.all([
      fetch("../locales/en.json"),
      fetch("../locales/pt.json"),
      fetch("../index.html"),
      fetch("../js/features/operations/heated-pools-manager.js")
    ]);
    const englishLocale = await englishResponse.json();
    const portugueseLocale = await portugueseResponse.json();
    const english = englishLocale.heatedPools;
    const portuguese = portugueseLocale.heatedPools;

    const leafPaths = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" && !Array.isArray(child)
        ? leafPaths(child, path)
        : [path];
    });

    assert.deepEqual(leafPaths(portuguese).sort(), leafPaths(english).sort(), "Heated Pools locale keys should stay in sync");
    assert.equal(portuguese.nav.settings, "Definições");
    assert.equal(portuguese.fields.remoteYes, "Sim — disponível remotamente");
    assert.equal(portuguese.states.off, "DESLIGADA");

    const usedKeys = new Set();
    const html = await htmlResponse.text();
    const manager = await managerResponse.text();
    for (const match of html.matchAll(/(?:data-i18n|data-i18n-title|data-i18n-aria-label)="(heatedPools\.[^"]+)"/g)) {
      usedKeys.add(match[1]);
    }
    for (const match of manager.matchAll(/hp\('([^']+)'/g)) {
      usedKeys.add(`heatedPools.${match[1]}`);
    }

    const resolve = (locale, key) => key.split(".").reduce((value, part) => value?.[part], locale);
    usedKeys.forEach((key) => {
      assert.notEqual(resolve(englishLocale, key), undefined, `Missing English translation: ${key}`);
      assert.notEqual(resolve(portugueseLocale, key), undefined, `Missing Portuguese translation: ${key}`);
    });
  });
});
