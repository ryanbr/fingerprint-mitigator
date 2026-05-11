// Battery Status API stub — MAIN world, document_start.
//
// Real Chrome exposes navigator.getBattery() → Promise<BatteryManager>.
// Brave removes the API. Our stub:
//   1. Adds navigator.getBattery
//   2. Adds window.BatteryManager class (so `instanceof BatteryManager`
//      and `Object.prototype.toString.call(battery)` match Chrome)
//   3. Reads values from a closure so the bridge.js settings event can
//      update them per-site:
//        battery.charging          (default true  — plugged-in laptop)
//        battery.level             (default 1     — fully charged)
//        battery.chargingTime      (default 0     — already full)
//        battery.dischargingTime   (default Infinity — plugged in, won't discharge)

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
  function fakeNativeGetter(proto, prop) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc && desc.get) makeFakeNative(desc.get, "get " + prop, 0);
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

  if (typeof navigator.getBattery === "function") return;     // Vivaldi/Opera keep
  if (typeof Navigator === "undefined") return;

  // ── Configurable values (read live from closure) ─────────────────────
  const values = {
    charging: true,
    chargingTime: 0,            // already full
    dischargingTime: Infinity,  // plugged in
    level: 1,                   // fully charged
  };

  // String → number coercion. Storage can't serialize Infinity, so the
  // popup sends "Infinity" as a literal string; convert at apply time.
  function coerceNum(v) {
    if (v === "Infinity" || v === Infinity) return Infinity;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : Infinity;
  }

  // ── BatteryManager class ────────────────────────────────────────────
  // Real Chrome's BatteryManager extends EventTarget; not directly
  // user-constructable. Our class uses `new.target` to allow our
  // single internal instance through and reject direct user construction.
  let internalConstruction = false;
  class BatteryManager extends EventTarget {
    constructor() {
      super();
      if (!internalConstruction) {
        throw new TypeError("Illegal constructor");
      }
      // Real Chrome exposes these as settable instance properties.
      this.onchargingchange = null;
      this.onchargingtimechange = null;
      this.ondischargingtimechange = null;
      this.onlevelchange = null;
    }
    get charging() { return values.charging; }
    get chargingTime() { return values.chargingTime; }
    get dischargingTime() { return values.dischargingTime; }
    get level() { return values.level; }
    get [Symbol.toStringTag]() { return "BatteryManager"; }
  }
  makeFakeNativeClass(BatteryManager, "BatteryManager");
  fakeNativeGetter(BatteryManager.prototype, "charging");
  fakeNativeGetter(BatteryManager.prototype, "chargingTime");
  fakeNativeGetter(BatteryManager.prototype, "dischargingTime");
  fakeNativeGetter(BatteryManager.prototype, "level");

  try {
    if (typeof window.BatteryManager !== "function") {
      Object.defineProperty(window, "BatteryManager", {
        value: BatteryManager, writable: true, configurable: true,
      });
    }

    // Construct the singleton once. Cached and returned by every
    // getBattery() call — matching Chrome's behaviour where the same
    // BatteryManager instance is shared.
    internalConstruction = true;
    const battery = new BatteryManager();
    internalConstruction = false;

    const getBattery = makeFakeNative(function () {
      return Promise.resolve(battery);
    }, "getBattery", 0);
    Object.defineProperty(Navigator.prototype, "getBattery", {
      value: getBattery, writable: true, configurable: true, enumerable: true,
    });
  } catch { /* sealed */ }

  // ── Per-site value overrides ─────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values: ov } = JSON.parse(e.detail);
      if (!ov) return;
      if (ov["battery.charging"] !== undefined) {
        values.charging = ov["battery.charging"] === true || ov["battery.charging"] === "true";
      }
      if (ov["battery.level"] !== undefined) {
        const n = Number(ov["battery.level"]);
        if (Number.isFinite(n)) values.level = Math.max(0, Math.min(1, n));
      }
      if (ov["battery.chargingTime"] !== undefined) {
        values.chargingTime = coerceNum(ov["battery.chargingTime"]);
      }
      if (ov["battery.dischargingTime"] !== undefined) {
        values.dischargingTime = coerceNum(ov["battery.dischargingTime"]);
      }
    } catch { /* malformed */ }
  }, { once: true });
})();
