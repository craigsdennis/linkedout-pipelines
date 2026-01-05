(function () {
  const TRACK_ENDPOINT = "/api/track";
  const VISITOR_ID_COOKIE = "_lo_vid";

  // Generate a unique visitor ID (UUID v4)
  function generateVisitorId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Get or create visitor ID
  function getVisitorId() {
    // Check if we already have a visitor ID in a cookie
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith(VISITOR_ID_COOKIE + '=')) {
        return cookie.substring(VISITOR_ID_COOKIE.length + 1);
      }
    }

    // Generate new visitor ID
    const visitorId = generateVisitorId();
    
    // Store in cookie (2 years expiry)
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 2);
    document.cookie = VISITOR_ID_COOKIE + '=' + visitorId + '; expires=' + expires.toUTCString() + '; path=/; SameSite=Lax';
    
    return visitorId;
  }

  const visitorId = getVisitorId();

  function sendBeacon(clickedAnchor) {
    if (!("sendBeacon" in navigator)) {
      return;
    }

    // Get the link text (innerText or textContent)
    const linkText = clickedAnchor?.innerText || clickedAnchor?.textContent || null;

    const payload = JSON.stringify({
      url: window.location.href,
      out: clickedAnchor?.href ?? null,
      link_text: linkText,
      visitor_id: visitorId,
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
