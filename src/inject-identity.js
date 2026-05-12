// Identity masking — runs in MAIN world at document_start.
//
// Strips Brave / Opera / Vivaldi / Yandex / etc. identity from
// navigator.brave, navigator.userAgentData.brands, vendor window
// globals (window.opr / window.vivaldi etc.), and navigator.userAgent.
//
// Each transformation is independently disable-able per-site via the
// bridge.js settings event:
//   identity.brave           hide navigator.brave
//   identity.brands          filter userAgentData.brands / getHEV / toJSON
//   identity.vendorGlobals   hide window.opr / opera / vivaldi / etc.
//   identity.uaStrip         strip identity tokens from navigator.userAgent
//   identity.protocolBlock   swallow vendor-scheme navigations (vivaldi://, brave://, ...)
//
// Plus one value override:
//   identity.customUA        replace navigator.userAgent with a custom string

(function () {
  "use strict";

  const fnWrapperMap = new WeakMap();
  const fakeNativeMap = new WeakMap();

  function copyFnIdentity(wrapper, orig) {
    try { Object.defineProperty(wrapper, "name", { value: (orig && orig.name) || "", configurable: true }); } catch { /* non-configurable */ }
    try { Object.defineProperty(wrapper, "length", { value: (orig && orig.length) || 0, configurable: true }); } catch { /* non-configurable */ }
  }
  {
    const origToString = Function.prototype.toString;
    const newToString = function () {
      const fakeSrc = fakeNativeMap.get(this);
      if (fakeSrc) return fakeSrc;
      const orig = fnWrapperMap.get(this);
      return origToString.call(orig || this);
    };
    fnWrapperMap.set(newToString, origToString);
    try { Object.defineProperty(newToString, "name", { value: "toString", configurable: true }); } catch { /* non-configurable */ }
    try { Object.defineProperty(newToString, "length", { value: 0, configurable: true }); } catch { /* non-configurable */ }
    Function.prototype.toString = newToString;
  }

  const IDENTITY_BRAND_RE = /\b(brave|opera|opr|vivaldi|yandex|samsung|ucbrowser|microsoft edge|edg(?!e)|naver whale|whale)\b/i;
  function filterBrands(arr) {
    if (!Array.isArray(arr)) return arr;
    // Strip identity brands (Brave / Opera / Vivaldi / etc.).
    const out = arr.filter(b => b && typeof b.brand === "string" && !IDENTITY_BRAND_RE.test(b.brand));
    // Real Chrome's brands list always contains a "Google Chrome"
    // entry. Brave's list never does (just "Chromium" + a Not.A/Brand
    // placeholder). Stripping isn't enough — fingerprinters notice
    // the missing "Google Chrome". Add it using Chromium's version so
    // the entry stays internally consistent. Skip if a Google Chrome
    // entry already exists (Vivaldi / Edge / Opera might add their own
    // and have already been stripped via IDENTITY_BRAND_RE).
    const hasGoogleChrome = out.some(b => /google chrome/i.test(b.brand));
    if (!hasGoogleChrome) {
      const chromium = out.find(b => /^chromium$/i.test(b.brand));
      out.push({
        brand: "Google Chrome",
        version: (chromium && chromium.version) || "148",
      });
    }
    return out;
  }

  const uninstallers = {};
  let customUA = "";

  // userAgentData spoof values. mobile/platform mirror the
  // clientHints.* values so HTTP and JS layers tell the same story.
  // High-entropy values default to plausible Chrome 131 / Windows 15
  // values — overridable per-site via uaData.* keys.
  const uaData = {
    mobile: null,           // null = pass through; bool = override
    platform: null,         // null = pass through; string = override
    platformVersion: "15.0.0",
    architecture: "x86",
    bitness: "64",
    model: "",
    uaFullVersion: "148.0.0.0",
    wow64: false,
    formFactor: ["Desktop"],
  };

  // ── navigator.brave ──────────────────────────────────────────────────
  {
    const braveOriginals = [];   // [{ proto, desc }]
    let obj = navigator;
    let depth = 0;
    while (obj && obj !== Object.prototype && depth < 8) {
      const desc = Object.getOwnPropertyDescriptor(obj, "brave");
      if (desc) {
        braveOriginals.push({ proto: obj, desc });
        let deleted = false;
        try { deleted = delete obj.brave; } catch { deleted = false; }
        if (!deleted) {
          try {
            Object.defineProperty(obj, "brave", {
              get() { return undefined; }, set() { /* no-op */ },
              configurable: true, enumerable: false,
            });
          } catch { /* non-configurable */ }
        }
      }
      obj = Object.getPrototypeOf(obj);
      depth++;
    }
    if (braveOriginals.length > 0) {
      uninstallers["identity.brave"] = () => {
        // Restore every original descriptor — undoes both the delete
        // and any getter-shadow we installed as a fallback.
        for (const { proto, desc } of braveOriginals) {
          try { Object.defineProperty(proto, "brave", desc); } catch { /* sealed */ }
        }
      };
    }
  }

  // ── userAgentData brand filtering ────────────────────────────────────
  if (typeof NavigatorUAData !== "undefined") {
    const restores = [];
    try {
      const desc = Object.getOwnPropertyDescriptor(NavigatorUAData.prototype, "brands");
      if (desc && desc.get) {
        const origGet = desc.get;
        const newGet = function () { return filterBrands(origGet.call(this)); };
        fnWrapperMap.set(newGet, origGet);
        copyFnIdentity(newGet, origGet);
        Object.defineProperty(NavigatorUAData.prototype, "brands", { ...desc, get: newGet });
        restores.push(() => Object.defineProperty(NavigatorUAData.prototype, "brands", desc));
      }
    } catch { /* protected */ }

    // Helper: apply all user-agent-data spoofs to a returned-data dict.
    // Only fields the caller actually requested are present, so we
    // override only those — keeps "field absent" semantics intact.
    function applyUaDataSpoofs(data) {
      if (!data) return data;
      if (Array.isArray(data.brands)) data.brands = filterBrands(data.brands);
      if (Array.isArray(data.fullVersionList)) data.fullVersionList = filterBrands(data.fullVersionList);
      if (data.mobile !== undefined && uaData.mobile !== null) data.mobile = uaData.mobile;
      if (data.platform !== undefined && uaData.platform !== null) data.platform = uaData.platform;
      if (data.platformVersion !== undefined) data.platformVersion = uaData.platformVersion;
      if (data.architecture !== undefined) data.architecture = uaData.architecture;
      if (data.bitness !== undefined) data.bitness = uaData.bitness;
      if (data.model !== undefined) data.model = uaData.model;
      if (data.uaFullVersion !== undefined) data.uaFullVersion = uaData.uaFullVersion;
      if (data.wow64 !== undefined) data.wow64 = uaData.wow64;
      if (Array.isArray(data.formFactor) || Array.isArray(data.formFactors)) {
        data.formFactor = uaData.formFactor.slice();
        data.formFactors = uaData.formFactor.slice();
      }
      return data;
    }

    // Spoof userAgentData.mobile (boolean getter)
    try {
      const desc = Object.getOwnPropertyDescriptor(NavigatorUAData.prototype, "mobile");
      if (desc && desc.get) {
        const origGet = desc.get;
        const newGet = function () {
          return uaData.mobile !== null ? uaData.mobile : origGet.call(this);
        };
        fnWrapperMap.set(newGet, origGet);
        copyFnIdentity(newGet, origGet);
        Object.defineProperty(NavigatorUAData.prototype, "mobile", { ...desc, get: newGet });
        restores.push(() => Object.defineProperty(NavigatorUAData.prototype, "mobile", desc));
      }
    } catch { /* protected */ }

    // Spoof userAgentData.platform (string getter)
    try {
      const desc = Object.getOwnPropertyDescriptor(NavigatorUAData.prototype, "platform");
      if (desc && desc.get) {
        const origGet = desc.get;
        const newGet = function () {
          return uaData.platform !== null ? uaData.platform : origGet.call(this);
        };
        fnWrapperMap.set(newGet, origGet);
        copyFnIdentity(newGet, origGet);
        Object.defineProperty(NavigatorUAData.prototype, "platform", { ...desc, get: newGet });
        restores.push(() => Object.defineProperty(NavigatorUAData.prototype, "platform", desc));
      }
    } catch { /* protected */ }

    try {
      const origGetHEV = NavigatorUAData.prototype.getHighEntropyValues;
      if (typeof origGetHEV === "function") {
        const newGetHEV = function (hints) {
          return origGetHEV.call(this, hints).then(applyUaDataSpoofs);
        };
        fnWrapperMap.set(newGetHEV, origGetHEV);
        copyFnIdentity(newGetHEV, origGetHEV);
        NavigatorUAData.prototype.getHighEntropyValues = newGetHEV;
        restores.push(() => { NavigatorUAData.prototype.getHighEntropyValues = origGetHEV; });
      }
    } catch { /* protected */ }

    try {
      const origToJSON = NavigatorUAData.prototype.toJSON;
      if (typeof origToJSON === "function") {
        const newToJSON = function () { return applyUaDataSpoofs(origToJSON.call(this)); };
        fnWrapperMap.set(newToJSON, origToJSON);
        copyFnIdentity(newToJSON, origToJSON);
        NavigatorUAData.prototype.toJSON = newToJSON;
        restores.push(() => { NavigatorUAData.prototype.toJSON = origToJSON; });
      }
    } catch { /* protected */ }

    if (restores.length > 0) {
      uninstallers["identity.brands"] = () => {
        for (const r of restores) { try { r(); } catch { /* sealed */ } }
      };
    }
  }

  // ── Vendor globals ───────────────────────────────────────────────────
  {
    const vendorOrigs = {};   // name → original descriptor
    for (const name of ["opr", "opera", "vivaldi", "__firefox__", "yandex", "__ybro", "__yb"]) {
      try {
        if (name in window) {
          const desc = Object.getOwnPropertyDescriptor(window, name);
          if (desc) {
            vendorOrigs[name] = desc;
            Object.defineProperty(window, name, {
              get() { return undefined; }, set() { /* no-op */ },
              configurable: true, enumerable: false,
            });
          }
        }
      } catch { /* non-configurable */ }
    }
    if (Object.keys(vendorOrigs).length > 0) {
      uninstallers["identity.vendorGlobals"] = () => {
        for (const [name, desc] of Object.entries(vendorOrigs)) {
          try { Object.defineProperty(window, name, desc); } catch { /* sealed */ }
        }
      };
    }
  }

  // ── navigator.userAgent strip + customUA ────────────────────────────
  // Wrapper always installed (low-frequency getter). It reads two
  // closure flags at call time so settings can toggle behaviour without
  // unwrapping:
  //   customUA non-empty → return customUA
  //   else                → strip identity tokens (the default)
  // identity.uaStrip subcheck = false → uninstall the wrapper entirely,
  // restoring the original getter.
  try {
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent");
    if (desc && desc.get) {
      const origGet = desc.get;
      const newGet = function () {
        if (customUA) return customUA;
        const ua = origGet.call(this);
        if (typeof ua === "string" && /\b(Brave|OPR|Vivaldi|YaBrowser|Whale)\//.test(ua)) {
          return ua.replace(/\s+(?:Brave|OPR|Vivaldi|YaBrowser|Whale)\/[^\s)]+/g, "");
        }
        return ua;
      };
      fnWrapperMap.set(newGet, origGet);
      copyFnIdentity(newGet, origGet);
      Object.defineProperty(Navigator.prototype, "userAgent", { ...desc, get: newGet });
      uninstallers["identity.uaStrip"] = () => {
        try { Object.defineProperty(Navigator.prototype, "userAgent", desc); } catch { /* sealed */ }
      };
    }
  } catch { /* protected */ }

  // ── Vendor-protocol navigation guard ────────────────────────────────
  // When a page believes we're Vivaldi/Brave/Opera/etc. (often as a
  // direct consequence of the customUA spoof), it may deep-link into
  // the actual browser via vivaldi://, brave://, opera://, yandex:// or
  // whale://. Chrome then shows the OS "Open in <X>?" handler popup.
  // Swallow these schemes when navigated from script or anchor clicks
  // so the popup never fires.
  {
    const VENDOR_SCHEME_RE = /^\s*(?:vivaldi|brave|opera|opera-gx|yandex|whale):/i;
    const isVendorScheme = (s) => {
      try { return typeof s === "string" && VENDOR_SCHEME_RE.test(s); }
      catch { return false; }
    };

    const restores = [];

    try {
      const desc = Object.getOwnPropertyDescriptor(Location.prototype, "href");
      if (desc && desc.set) {
        const origSet = desc.set;
        const newSet = function (v) {
          if (isVendorScheme(v)) return;
          return origSet.call(this, v);
        };
        fnWrapperMap.set(newSet, origSet);
        copyFnIdentity(newSet, origSet);
        Object.defineProperty(Location.prototype, "href", { ...desc, set: newSet });
        restores.push(() => Object.defineProperty(Location.prototype, "href", desc));
      }
    } catch { /* protected */ }

    for (const method of ["assign", "replace"]) {
      try {
        const orig = Location.prototype[method];
        if (typeof orig === "function") {
          const wrapped = function (v) {
            if (isVendorScheme(v)) return;
            return orig.call(this, v);
          };
          fnWrapperMap.set(wrapped, orig);
          copyFnIdentity(wrapped, orig);
          Location.prototype[method] = wrapped;
          restores.push(() => { Location.prototype[method] = orig; });
        }
      } catch { /* protected */ }
    }

    try {
      const origOpen = window.open;
      if (typeof origOpen === "function") {
        const newOpen = function (url, ...rest) {
          if (isVendorScheme(url)) return null;
          return origOpen.call(this, url, ...rest);
        };
        fnWrapperMap.set(newOpen, origOpen);
        copyFnIdentity(newOpen, origOpen);
        window.open = newOpen;
        restores.push(() => { window.open = origOpen; });
      }
    } catch { /* protected */ }

    // Capture-phase click swallow — vivaldi.com pages may use plain
    // <a href="vivaldi://..."> deep links. closest() finds the
    // enclosing anchor for clicks on nested spans/icons inside the link.
    const onClick = (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      const a = t.closest("a");
      if (a && isVendorScheme(a.getAttribute("href"))) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    restores.push(() => document.removeEventListener("click", onClick, true));

    if (restores.length > 0) {
      uninstallers["identity.protocolBlock"] = () => {
        for (const r of restores) { try { r(); } catch { /* sealed */ } }
      };
    }
  }

  // ── Per-site settings ────────────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { subChecks, values } = JSON.parse(e.detail);
      for (const key of Object.keys(uninstallers)) {
        if (subChecks && subChecks[key] === false) uninstallers[key]();
      }
      if (!values) return;

      if (typeof values["identity.customUA"] === "string") {
        customUA = values["identity.customUA"];
      }

      // identity.uaDataMode = "remove" → delete navigator.userAgentData
      // entirely (Firefox / Safari preset). Wrapping isn't enough; some
      // fingerprinters specifically test `'userAgentData' in navigator`,
      // which would still be true with a getter returning undefined.
      // Override via Navigator.prototype with an undefined-returning
      // getter; `in` still returns true, but most code does
      // `if (navigator.userAgentData)` which falls through.
      if (values["identity.uaDataMode"] === "remove") {
        try {
          if (typeof Navigator !== "undefined") {
            Object.defineProperty(Navigator.prototype, "userAgentData", {
              get() { return undefined; },
              configurable: true,
              enumerable: false,
            });
          }
          try { delete window.NavigatorUAData; } catch { /* sealed */ }
        } catch { /* protected */ }
      }

      // Mirror HTTP clientHints config to JS userAgentData. The HTTP
      // values include quotes for the brand string and ?-prefix for
      // mobile; the JS API uses plain values, so we coerce.
      const httpMobile = values["clientHints.mobile"];
      if (typeof httpMobile === "string" && httpMobile) {
        uaData.mobile = httpMobile === "?1";
      }
      const httpPlatform = values["clientHints.platform"];
      if (typeof httpPlatform === "string" && httpPlatform) {
        uaData.platform = httpPlatform.replace(/^"|"$/g, "");
      }

      // Direct uaData.* overrides for high-entropy fields.
      const map = {
        "uaData.platformVersion": "platformVersion",
        "uaData.architecture":    "architecture",
        "uaData.bitness":         "bitness",
        "uaData.model":           "model",
        "uaData.uaFullVersion":   "uaFullVersion",
        "uaData.wow64":           "wow64",
      };
      for (const [k, prop] of Object.entries(map)) {
        if (values[k] !== undefined) uaData[prop] = values[k];
      }
      // formFactor as comma-separated string in storage
      const ff = values["uaData.formFactor"];
      if (typeof ff === "string" && ff.trim()) {
        uaData.formFactor = ff.split(",").map(s => s.trim()).filter(Boolean);
      }
    } catch { /* malformed event */ }
  }, { once: true });
})();
