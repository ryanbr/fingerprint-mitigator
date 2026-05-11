// Generic Sensor API stubs — MAIN world, document_start.
//
// Sensor is an abstract base class; the concrete classes (Accelerometer,
// Gyroscope, etc.) extend it. Real Chrome:
//   - `new Sensor()` throws TypeError ("Illegal constructor")
//   - `new Accelerometer()` constructs successfully; `.start()` rejects
//     without permission
//   - `Accelerometer.prototype instanceof Sensor === true`
// Our stubs match all three so fingerprinters probing the hierarchy see
// the expected shape, not a flat collection of unrelated classes.

(function () {
  "use strict";
  const fakeNativeMap = new WeakMap();
  function makeFakeNativeClass(cls, name) {
    try { Object.defineProperty(cls, "name", { value: name, configurable: true }); } catch { /* non-configurable */ }
    fakeNativeMap.set(cls, `function ${name}() { [native code] }`);
    return cls;
  }
  function makeFakeNative(fn, name, arity) {
    try { Object.defineProperty(fn, "name", { value: name, configurable: true }); } catch { /* non-configurable */ }
    try { Object.defineProperty(fn, "length", { value: arity || 0, configurable: true }); } catch { /* non-configurable */ }
    fakeNativeMap.set(fn, `function ${name}() { [native code] }`);
    return fn;
  }
  function fakeNativeMethods(cls, methodNames) {
    for (const m of methodNames) {
      const fn = cls.prototype && cls.prototype[m];
      if (typeof fn === "function") makeFakeNative(fn, m, fn.length);
    }
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
      return origToString.call(this);
    };
    fakeNativeMap.set(newToString, "function toString() { [native code] }");
    try { Object.defineProperty(newToString, "name", { value: "toString", configurable: true }); } catch { /* non-configurable */ }
    try { Object.defineProperty(newToString, "length", { value: 0, configurable: true }); } catch { /* non-configurable */ }
    Function.prototype.toString = newToString;
  }

  // Only install the whole hierarchy if Sensor is missing. On Vivaldi/
  // Opera (which keep the Sensor classes) the native impls win.
  if (typeof window.Sensor === "function") return;

  // ── Sensor base class ────────────────────────────────────────────────
  // Direct construction throws (matches Chrome's [Exposed=Window] abstract
  // base). Subclasses pass `new.target === SubClass`, so super() works.
  class Sensor extends EventTarget {
    constructor() {
      super();
      if (new.target === Sensor) {
        throw new TypeError("Illegal constructor");
      }
      this.onreading = null;
      this.onactivate = null;
      this.onerror = null;
    }
    start() {
      throw new DOMException("Not allowed by feature policy", "SecurityError");
    }
    stop() { /* no-op */ }
    get activated() { return false; }
    get hasReading() { return false; }
    get timestamp() { return null; }
  }
  makeFakeNativeClass(Sensor, "Sensor");
  fakeNativeMethods(Sensor, ["start", "stop"]);
  fakeNativeGetter(Sensor.prototype, "activated");
  fakeNativeGetter(Sensor.prototype, "hasReading");
  fakeNativeGetter(Sensor.prototype, "timestamp");
  try {
    Object.defineProperty(window, "Sensor", {
      value: Sensor, writable: true, configurable: true,
    });
  } catch { /* sealed */ }

  // ── Concrete subclasses ─────────────────────────────────────────────
  // All extend Sensor so `instanceof Sensor` holds. Construction is
  // permissive (matches Chrome); failure mode is start() rejecting.
  const CONCRETE_SENSORS = [
    "Accelerometer", "LinearAccelerationSensor", "GravitySensor",
    "Gyroscope", "Magnetometer", "AmbientLightSensor",
    "AbsoluteOrientationSensor", "RelativeOrientationSensor",
    "OrientationSensor",
  ];
  for (const name of CONCRETE_SENSORS) {
    if (typeof window[name] !== "function") {
      try {
        const Stub = class extends Sensor {
          constructor() { super(); }
        };
        makeFakeNativeClass(Stub, name);
        Object.defineProperty(window, name, {
          value: Stub, writable: true, configurable: true,
        });
      } catch { /* sealed */ }
    }
  }
})();
