// Privacy-hint masking — MAIN world, document_start.
//
// Brave-distinctive navigator getters that vanilla Chrome reports
// differently:
//
//   navigator.globalPrivacyControl   Brave default: true.  Chrome: false / undefined.
//   navigator.doNotTrack             Brave default: "1".   Chrome: null (unless user opted in).
//   navigator.languages              Brave in strict mode may reduce to ["en-US"];
//                                    Chrome reports OS-derived list.
//   navigator.language               Mirrors languages[0].
//
// All four configurable per-site under "privacyHints.<name>".

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

  // Defaults match Chrome's typical out-of-box values.
  const values = {
    globalPrivacyControl: false,
    doNotTrack: null,
    languages: ["en-US", "en"],
    language: "en-US",
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
    spoofGetter(Navigator.prototype, "globalPrivacyControl");
    spoofGetter(Navigator.prototype, "doNotTrack");
    spoofGetter(Navigator.prototype, "language");
    spoofGetter(Navigator.prototype, "languages");
  }

  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values: ov } = JSON.parse(e.detail);
      if (!ov) return;
      // languages is stored as a comma-separated string in the popup
      // for ease of editing; convert back to array when applying.
      const langs = ov["privacyHints.languages"];
      if (typeof langs === "string" && langs.trim()) {
        values.languages = langs.split(",").map(s => s.trim()).filter(Boolean);
        values.language = values.languages[0] || "en-US";
      }
      const gpc = ov["privacyHints.globalPrivacyControl"];
      if (gpc !== undefined) values.globalPrivacyControl = gpc;
      const dnt = ov["privacyHints.doNotTrack"];
      if (dnt !== undefined) values.doNotTrack = dnt;
    } catch { /* malformed */ }
  }, { once: true });
})();
