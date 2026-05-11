// IdleDetector + SpeechRecognition stubs — MAIN world, document_start.
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

  if (typeof window.IdleDetector !== "function") {
    try {
      class IdleDetector extends EventTarget {
        constructor() {
          super();
          this.userState = null;
          this.screenState = null;
          this.onchange = null;
        }
        start() {
          return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
        }
      }
      IdleDetector.requestPermission = makeFakeNative(function () {
        return Promise.resolve("denied");
      }, "requestPermission", 0);
      makeFakeNativeClass(IdleDetector, "IdleDetector");
      fakeNativeMethods(IdleDetector, ["start"]);
      Object.defineProperty(window, "IdleDetector", {
        value: IdleDetector, writable: true, configurable: true,
      });
    } catch { /* sealed */ }
  }

  for (const ctorName of ["SpeechRecognition", "webkitSpeechRecognition"]) {
    if (typeof window[ctorName] !== "function") {
      try {
        const Stub = class extends EventTarget {
          constructor() {
            super();
            this.continuous = false;
            this.interimResults = false;
            this.lang = "";
            this.maxAlternatives = 1;
            this.serviceURI = "";
            this.grammars = null;
            this.onresult = null;
            this.onerror = null;
            this.onend = null;
            this.onstart = null;
          }
          start() { throw new DOMException("Not allowed", "NotAllowedError"); }
          stop() {}
          abort() {}
        };
        makeFakeNativeClass(Stub, ctorName);
        fakeNativeMethods(Stub, ["start", "stop", "abort"]);
        Object.defineProperty(window, ctorName, {
          value: Stub, writable: true, configurable: true,
        });
      } catch { /* sealed */ }
    }
  }
})();
