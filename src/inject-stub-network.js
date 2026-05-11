// Network Information API spoof — MAIN world, document_start.
// Each value is independently configurable via the bridge.js settings
// event ("network.<prop>": <value>). Defaults below are Chrome-typical.

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

  // Spoofed values live in this closure object so the bridge.js
  // settings event can update them after document_start; the getters
  // we install read live from here.
  const values = {
    effectiveType: "4g",
    saveData: false,
    downlink: 10,
    rtt: 50,
    type: "wifi",
    downlinkMax: 10,
  };

  function spoofGetter(proto, prop) {
    try {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.get) return;
      const origGet = desc.get;
      const newGet = function () { return values[prop]; };
      fnWrapperMap.set(newGet, origGet);
      copyFnIdentity(newGet, origGet);
      Object.defineProperty(proto, prop, { ...desc, get: newGet });
    } catch { /* protected */ }
  }

  if (typeof NetworkInformation !== "undefined") {
    spoofGetter(NetworkInformation.prototype, "effectiveType");
    spoofGetter(NetworkInformation.prototype, "saveData");
    spoofGetter(NetworkInformation.prototype, "downlink");
    spoofGetter(NetworkInformation.prototype, "rtt");
    spoofGetter(NetworkInformation.prototype, "type");
    spoofGetter(NetworkInformation.prototype, "downlinkMax");
  }

  // Per-site value overrides from bridge.js.
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values: ov } = JSON.parse(e.detail);
      if (!ov) return;
      for (const prop of Object.keys(values)) {
        const key = "network." + prop;
        if (ov[key] !== undefined) values[prop] = ov[key];
      }
    } catch { /* malformed */ }
  }, { once: true });
})();
