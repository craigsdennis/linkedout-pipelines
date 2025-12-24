(function () {
  const TRACK_ENDPOINT = "/api/track";

  function sendBeacon(clickedAnchor) {
    if (!("sendBeacon" in navigator)) {
      return;
    }

    const payload = JSON.stringify({
      url: window.location.href,
      out: clickedAnchor?.href ?? null,
    });
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon(TRACK_ENDPOINT, blob);
  }

  function handleClick(event) {
    const target = event.target;
    const anchor = typeof target?.closest === "function" ? target.closest("a[href]") : null;

    if (!anchor) {
      return;
    }

    sendBeacon(anchor);
  }

  function enableLinkTracking() {
    document.addEventListener("click", handleClick, true);
  }

  enableLinkTracking();
})();
