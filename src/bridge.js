// Bridge — runs in ISOLATED world at document_start in every frame.
// Reads per-site settings from chrome.storage.local and dispatches
// them to the MAIN-world inject scripts via a DOM event. The MAIN-
// world scripts install all checks with defaults at document_start
// (no waiting), then uninstall the user-disabled sub-checks when the
// event arrives (~1-5ms later). Acceptable race: most fingerprinting
// scripts load via async <script src> and don't run until well after.

(function () {
  "use strict";
  const hostname = (location.hostname || "").replace(/^www\./, "");

  // Walk parent domains so a config on example.com applies to
  // shop.example.com too — matching the *://*.host/* exclude_matches
  // semantic the background SW uses for category-level toggles. Exact
  // match wins; otherwise the closest parent wins.
  function lookupOverrides(all, host) {
    if (!all) return null;
    if (all[host]) return all[host];
    const parts = host.split(".");
    while (parts.length > 1) {
      parts.shift();
      const parent = parts.join(".");
      if (all[parent]) return all[parent];
    }
    return null;
  }

  chrome.storage.local.get(["siteOverrides"], (s) => {
    const ov = lookupOverrides(s.siteOverrides, hostname) || {};
    const payload = {
      // {  "hardware.usb": false, "identity.brave": false, ... }
      subChecks: ov.subChecks || {},
      // { "network.effectiveType": "3g", "network.downlink": 5, ... }
      values: ov.values || {},
    };
    document.dispatchEvent(new CustomEvent("__fpmit_settings", {
      detail: JSON.stringify(payload),
    }));
  });
})();
