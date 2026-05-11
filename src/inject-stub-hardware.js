// Hardware-access API stubs — MAIN world, document_start.
// Each sub-check installs both the class on `window` (so
// `typeof USB === "function"` and `navigator.usb instanceof USB` pass)
// and the instance on `navigator`. Bridge.js settings event can
// uninstall per-API.
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

  // Install (a) the class on window — for `typeof X === "function"`
  // and `instanceof X` checks; (b) an instance on Navigator.prototype.
  // Uninstaller removes both.
  function installNavigatorClass({ propName, className, methodNames, factory, subKey }) {
    if (typeof navigator[propName] !== "undefined") return;
    if (typeof Navigator === "undefined") return;
    try {
      const Cls = factory();
      makeFakeNativeClass(Cls, className);
      fakeNativeMethods(Cls, methodNames);
      // Expose class on window
      Object.defineProperty(window, className, {
        value: Cls, writable: true, configurable: true,
      });
      // Expose singleton on navigator
      const instance = new Cls();
      Object.defineProperty(Navigator.prototype, propName, {
        get() { return instance; }, configurable: true, enumerable: true,
      });
      uninstallers[subKey] = () => {
        try { delete Navigator.prototype[propName]; } catch { /* non-configurable */ }
        try { delete window[className]; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  installNavigatorClass({
    propName: "usb", className: "USB",
    methodNames: ["getDevices", "requestDevice"],
    subKey: "hardware.usb",
    factory: () => class USB extends EventTarget {
      constructor() { super(); this.onconnect = null; this.ondisconnect = null; }
      getDevices() { return Promise.resolve([]); }
      requestDevice() { return Promise.reject(new DOMException("No device selected", "NotFoundError")); }
    },
  });

  installNavigatorClass({
    propName: "bluetooth", className: "Bluetooth",
    methodNames: ["getAvailability", "getDevices", "requestDevice", "referringDevice"],
    subKey: "hardware.bluetooth",
    factory: () => class Bluetooth extends EventTarget {
      constructor() { super(); this.onavailabilitychanged = null; this.ongattserverdisconnected = null; }
      getAvailability() { return Promise.resolve(false); }
      getDevices() { return Promise.resolve([]); }
      requestDevice() { return Promise.reject(new DOMException("No device selected", "NotFoundError")); }
      referringDevice() { return null; }
    },
  });

  installNavigatorClass({
    propName: "serial", className: "Serial",
    methodNames: ["getPorts", "requestPort"],
    subKey: "hardware.serial",
    factory: () => class Serial extends EventTarget {
      constructor() { super(); this.onconnect = null; this.ondisconnect = null; }
      getPorts() { return Promise.resolve([]); }
      requestPort() { return Promise.reject(new DOMException("No port selected", "NotFoundError")); }
    },
  });

  installNavigatorClass({
    propName: "hid", className: "HID",
    methodNames: ["getDevices", "requestDevice"],
    subKey: "hardware.hid",
    factory: () => class HID extends EventTarget {
      constructor() { super(); this.onconnect = null; this.ondisconnect = null; }
      getDevices() { return Promise.resolve([]); }
      requestDevice() { return Promise.reject(new DOMException("No device selected", "NotFoundError")); }
    },
  });

  // MIDI — only a request function lives on Navigator. No class to expose.
  if (typeof navigator.requestMIDIAccess !== "function" && typeof Navigator !== "undefined") {
    try {
      const fn = makeFakeNative(function () {
        return Promise.reject(new DOMException("Permission denied", "SecurityError"));
      }, "requestMIDIAccess", 0);
      Object.defineProperty(Navigator.prototype, "requestMIDIAccess", {
        value: fn, writable: true, configurable: true, enumerable: true,
      });
      uninstallers["hardware.midi"] = () => {
        try { delete Navigator.prototype.requestMIDIAccess; } catch { /* non-configurable */ }
      };
    } catch { /* sealed */ }
  }

  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { subChecks } = JSON.parse(e.detail);
      for (const key of Object.keys(uninstallers)) {
        if (subChecks && subChecks[key] === false) uninstallers[key]();
      }
    } catch { /* malformed event */ }
  }, { once: true });
})();
