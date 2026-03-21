export function resetDom(html = "") {
  let fixture = document.getElementById("fixture");
  if (!fixture) {
    fixture = document.createElement("section");
    fixture.id = "fixture";
    fixture.hidden = true;
    document.body.appendChild(fixture);
  }

  fixture.innerHTML = html;
}

export function createStorageMock(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

export function installGlobalProperty(name, value) {
  const original = Object.getOwnPropertyDescriptor(window, name);
  Object.defineProperty(window, name, {
    configurable: true,
    writable: true,
    value
  });

  return () => {
    if (original) {
      Object.defineProperty(window, name, original);
    } else {
      delete window[name];
    }
  };
}

export function installNavigatorLanguage(language) {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "language");

  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    get() {
      return language;
    }
  });

  return () => {
    if (original) {
      Object.defineProperty(window.navigator, "language", original);
    }
  };
}

export function almostEqual(actual, expected, epsilon = 0.00001) {
  return Math.abs(actual - expected) <= epsilon;
}
