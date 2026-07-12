const canRegisterServiceWorker =
  "serviceWorker" in navigator &&
  window.location.protocol !== "file:";

const isLocalDevHost =
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost";

if (canRegisterServiceWorker) {
  window.addEventListener("load", () => {
    if (isLocalDevHost) {
      Promise.all([
        navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        ),
        "caches" in window
          ? caches.keys().then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
          : Promise.resolve()
      ]).then(() => {
        if (navigator.serviceWorker.controller && sessionStorage.getItem("horario-sw-cleared") !== "yes") {
          sessionStorage.setItem("horario-sw-cleared", "yes");
          window.location.reload();
        }
      }).catch((error) => {
        console.warn("Local service worker cleanup failed", error);
      });
      return;
    }

    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
