// Privacy Sandbox API stubs (Topics, FLEDGE, Shared Storage) — MAIN world, document_start.
//
// Three independently disable-able sub-checks:
//   privacy.topics         document.browsingTopics()
//   privacy.fledge         Protected Audience / FLEDGE Navigator methods
//   privacy.sharedStorage  window.sharedStorage
//
// Three configurable values:
//   topics.ids               comma-separated topic IDs to return (default empty)
//   topics.taxonomyVersion   default 6 (current Chrome taxonomy)
//   topics.modelVersion      default 1
//   sharedStorage.budget     default 12.0 (Chrome's per-origin daily privacy budget)
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

  // Configurable values read live from closure.
  const values = {
    topicIds: [],            // empty = no topics; populated = fake "interests"
    taxonomyVersion: 6,
    modelVersion: 1,
    sharedStorageBudget: 12, // Chrome's per-origin daily privacy budget
  };

  // ── Topics API ───────────────────────────────────────────────────────
  if (typeof document.browsingTopics !== "function" && typeof Document !== "undefined") {
    try {
      const fn = makeFakeNative(function () {
        // Real Chrome returns array of { taxonomyVersion, modelVersion, topic, version }
        const out = values.topicIds.map(id => ({
          taxonomyVersion: values.taxonomyVersion,
          modelVersion: values.modelVersion,
          topic: id,
          version: `chrome.1:${values.taxonomyVersion}:${values.modelVersion}`,
        }));
        return Promise.resolve(out);
      }, "browsingTopics", 0);
      Object.defineProperty(Document.prototype, "browsingTopics", {
        value: fn, writable: true, configurable: true, enumerable: true,
      });
      uninstallers["privacy.topics"] = () => {
        try { delete Document.prototype.browsingTopics; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  // ── Protected Audience (FLEDGE) ─────────────────────────────────────
  {
    const FLEDGE_METHODS = {
      joinAdInterestGroup:               function () { return Promise.resolve(); },
      leaveAdInterestGroup:              function () { return Promise.resolve(); },
      updateAdInterestGroups:            function () { /* no return */ },
      runAdAuction:                      function () { return Promise.resolve(null); },
      clearOriginJoinedAdInterestGroups: function () { return Promise.resolve(); },
      deprecatedURNToURL:                function () { return Promise.resolve(null); },
      deprecatedReplaceInURN:            function () { return Promise.resolve(); },
      createAuctionNonce:                function () { return Promise.resolve(""); },
    };
    const installed = [];
    for (const name of Object.keys(FLEDGE_METHODS)) {
      if (typeof navigator[name] !== "function" && typeof Navigator !== "undefined") {
        try {
          const fn = makeFakeNative(FLEDGE_METHODS[name], name, 0);
          Object.defineProperty(Navigator.prototype, name, {
            value: fn, writable: true, configurable: true, enumerable: true,
          });
          installed.push(name);
        } catch { /* sealed */ }
      }
    }
    if (installed.length > 0) {
      uninstallers["privacy.fledge"] = () => {
        for (const name of installed) {
          try { delete Navigator.prototype[name]; } catch { /* non-configurable */ }
        }
      };
    }
  }

  // ── Shared Storage ──────────────────────────────────────────────────
  if (typeof window.sharedStorage === "undefined") {
    try {
      class SharedStorage {
        set() { return Promise.resolve(); }
        append() { return Promise.resolve(); }
        delete() { return Promise.resolve(); }
        clear() { return Promise.resolve(); }
        get() { return Promise.resolve(""); }
        length() { return Promise.resolve(0); }
        keys() { return Promise.resolve({ next: () => ({ done: true, value: undefined }) }); }
        entries() { return Promise.resolve({ next: () => ({ done: true, value: undefined }) }); }
        run() { return Promise.resolve(); }
        selectURL() { return Promise.resolve(null); }
        remainingBudget() { return Promise.resolve(values.sharedStorageBudget); }
      }
      makeFakeNativeClass(SharedStorage, "SharedStorage");
      fakeNativeMethods(SharedStorage, [
        "set", "append", "delete", "clear", "get", "length",
        "keys", "entries", "run", "selectURL", "remainingBudget",
      ]);
      const instance = new SharedStorage();
      Object.defineProperty(window, "sharedStorage", {
        get() { return instance; }, configurable: true, enumerable: true,
      });
      uninstallers["privacy.sharedStorage"] = () => {
        try { delete window.sharedStorage; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  // ── Per-site overrides ──────────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { subChecks, values: ov } = JSON.parse(e.detail);
      for (const key of Object.keys(uninstallers)) {
        if (subChecks && subChecks[key] === false) uninstallers[key]();
      }
      if (!ov) return;
      // Topic IDs: comma-separated string of integers
      const ids = ov["topics.ids"];
      if (typeof ids === "string") {
        values.topicIds = ids.split(",")
          .map(s => parseInt(s.trim(), 10))
          .filter(n => Number.isInteger(n) && n >= 0);
      }
      if (ov["topics.taxonomyVersion"] !== undefined) {
        const n = Number(ov["topics.taxonomyVersion"]);
        if (Number.isFinite(n)) values.taxonomyVersion = n;
      }
      if (ov["topics.modelVersion"] !== undefined) {
        const n = Number(ov["topics.modelVersion"]);
        if (Number.isFinite(n)) values.modelVersion = n;
      }
      if (ov["sharedStorage.budget"] !== undefined) {
        const n = Number(ov["sharedStorage.budget"]);
        if (Number.isFinite(n)) values.sharedStorageBudget = n;
      }
    } catch { /* malformed event */ }
  }, { once: true });
})();
