// Miscellaneous Brave-removed API stubs — MAIN world, document_start.
// 4 items, each independently toggleable via bridge.js settings event:
//   misc.queryLocalFonts
//   misc.getInstalledRelatedApps
//   misc.pressureObserver
//   misc.otpCredential
(function () {
  "use strict";
  const fnWrapperMap = new WeakMap();
  const fakeNativeMap = new WeakMap();
  function makeFakeNative(fn, name, arity) {
    try { Object.defineProperty(fn, "name", { value: name, configurable: true }); } catch { /* non-configurable */ }
    try { Object.defineProperty(fn, "length", { value: arity || 0, configurable: true }); } catch { /* non-configurable */ }
    fakeNativeMap.set(fn, `function ${name}() { [native code] }`);
    return fn;
  }
  function makeFakeNativeClass(cls, name) {
    try { Object.defineProperty(cls, "name", { value: name, configurable: true }); } catch { /* non-configurable */ }
    fakeNativeMap.set(cls, `function ${name}() { [native code] }`);
    return cls;
  }
  function fakeNativeMethods(cls, methodNames) {
    for (const m of methodNames) {
      const fn = cls.prototype && cls.prototype[m];
      if (typeof fn === "function") makeFakeNative(fn, m, fn.length);
    }
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

  const uninstallers = {};

  // ── queryLocalFonts ──────────────────────────────────────────────────
  if (typeof navigator.queryLocalFonts !== "function" && typeof Navigator !== "undefined") {
    try {
      const fn = makeFakeNative(function () {
        return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
      }, "queryLocalFonts", 0);
      Object.defineProperty(Navigator.prototype, "queryLocalFonts", {
        value: fn, writable: true, configurable: true, enumerable: true,
      });
      uninstallers["misc.queryLocalFonts"] = () => {
        try { delete Navigator.prototype.queryLocalFonts; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  // ── getInstalledRelatedApps ─────────────────────────────────────────
  if (typeof navigator.getInstalledRelatedApps !== "function" && typeof Navigator !== "undefined") {
    try {
      const fn = makeFakeNative(function () { return Promise.resolve([]); }, "getInstalledRelatedApps", 0);
      Object.defineProperty(Navigator.prototype, "getInstalledRelatedApps", {
        value: fn, writable: true, configurable: true, enumerable: true,
      });
      uninstallers["misc.getInstalledRelatedApps"] = () => {
        try { delete Navigator.prototype.getInstalledRelatedApps; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  // ── PressureObserver ────────────────────────────────────────────────
  if (typeof window.PressureObserver !== "function") {
    try {
      class PressureObserver {
        constructor(callback) {
          if (typeof callback !== "function") {
            throw new TypeError("Failed to construct 'PressureObserver': 1 argument required, but only 0 present.");
          }
          this._callback = callback;
        }
        observe() { return Promise.reject(new DOMException("Not supported", "NotSupportedError")); }
        unobserve() { /* no-op */ }
        disconnect() { /* no-op */ }
        takeRecords() { return []; }
      }
      Object.defineProperty(PressureObserver, "knownSources", {
        value: Object.freeze(["cpu"]),
        writable: false, configurable: true, enumerable: true,
      });
      makeFakeNativeClass(PressureObserver, "PressureObserver");
      fakeNativeMethods(PressureObserver, ["observe", "unobserve", "disconnect", "takeRecords"]);
      Object.defineProperty(window, "PressureObserver", {
        value: PressureObserver, writable: true, configurable: true,
      });
      uninstallers["misc.pressureObserver"] = () => {
        try { delete window.PressureObserver; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  // ── Storage Buckets ─────────────────────────────────────────────────
  // Chrome's Storage Buckets API; Brave doesn't expose. Stub:
  //   navigator.storageBuckets is a StorageBucketManager instance with
  //   no-op methods that resolve to empty / minimal results.
  if (typeof navigator.storageBuckets === "undefined" && typeof Navigator !== "undefined") {
    try {
      class StorageBucketManager {
        open() {
          // Real Chrome returns Promise<StorageBucket>. We resolve to a
          // minimal stub that supports the most-probed properties.
          return Promise.resolve({
            name: "default",
            persisted: () => Promise.resolve(false),
            estimate: () => Promise.resolve({ usage: 0, quota: 0 }),
            durability: () => Promise.resolve("relaxed"),
            expires: () => Promise.resolve(null),
            getDirectory: () => Promise.reject(new DOMException("Not supported", "NotSupportedError")),
            indexedDB: null,
            caches: null,
          });
        }
        delete() { return Promise.resolve(); }
        keys() { return Promise.resolve([]); }
      }
      makeFakeNativeClass(StorageBucketManager, "StorageBucketManager");
      fakeNativeMethods(StorageBucketManager, ["open", "delete", "keys"]);
      const instance = new StorageBucketManager();
      Object.defineProperty(Navigator.prototype, "storageBuckets", {
        get() { return instance; }, configurable: true, enumerable: true,
      });
      uninstallers["misc.storageBuckets"] = () => {
        try { delete Navigator.prototype.storageBuckets; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  // ── OTPCredential ───────────────────────────────────────────────────
  if (typeof window.OTPCredential !== "function" && typeof Credential !== "undefined") {
    try {
      const Stub = class extends Credential {
        constructor() {
          super();
          throw new DOMException("Not supported", "NotSupportedError");
        }
      };
      makeFakeNativeClass(Stub, "OTPCredential");
      Object.defineProperty(window, "OTPCredential", {
        value: Stub, writable: true, configurable: true,
      });
      uninstallers["misc.otpCredential"] = () => {
        try { delete window.OTPCredential; } catch { /* non-configurable */ }
      };
    } catch { /* sealed (Credential ctor not exposed) */ }
  }

  // ── Per-site sub-check overrides ────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { subChecks } = JSON.parse(e.detail);
      for (const key of Object.keys(uninstallers)) {
        if (subChecks && subChecks[key] === false) uninstallers[key]();
      }
    } catch { /* malformed event */ }
  }, { once: true });
})();
