const canRegisterServiceWorker =
  "serviceWorker" in navigator &&
  window.location.protocol !== "file:";

if (canRegisterServiceWorker) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
