// Hardware info value spoof — MAIN world, document_start.
//
// Brave hardcodes navigator.deviceMemory (8 GB), hardwareConcurrency
// (2 or 4 cores), and rounds touch / display info to fixed values.
// Real Chrome reports actual hardware. Fingerprinters detect Brave by
// either the specific values (always 8 GB, always 2 cores) or by
// noticing inconsistency between these and other signals (UA, screen
// size). Normalising to user-configured values defeats the per-value
// detection; defaults match common Chrome desktop configurations.
//
// Each property is configurable per-site via the bridge.js settings
// event under "hwInfo.<prop>".

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

  // Closure-local values; bridge.js's settings event may update these
  // after document_start. The getters we install read live from here.
  const values = {
    deviceMemory: 8,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    pdfViewerEnabled: true,
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

  if (typeof Navigator !== "undefined") {
    spoofGetter(Navigator.prototype, "deviceMemory");
    spoofGetter(Navigator.prototype, "hardwareConcurrency");
    spoofGetter(Navigator.prototype, "maxTouchPoints");
    spoofGetter(Navigator.prototype, "pdfViewerEnabled");
  }

  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values: ov } = JSON.parse(e.detail);
      if (!ov) return;
      for (const prop of Object.keys(values)) {
        const key = "hwInfo." + prop;
        if (ov[key] !== undefined) values[prop] = ov[key];
      }
    } catch { /* malformed */ }
  }, { once: true });
})();
