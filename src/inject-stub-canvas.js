// Canvas fingerprinting mitigation — MAIN world, document_start.
//
// Mode-based wrapping of canvas readback methods. Default mode "off"
// so the script is harmless until the user opts in per-site.
//
//   off        passthrough; canvas works normally (default)
//   stabilize  per-canvas-instance WeakMap cache — first read on a
//              canvas is computed, subsequent reads on the same canvas
//              return the cached result. Defeats "read twice, compare
//              bytes" Brave detection. Breaks apps that draw + re-read
//              on the same canvas (image editors, animated canvas
//              games, some captchas).
//   block      toDataURL/toBlob/convertToBlob → 1x1 transparent PNG;
//              getImageData → SecurityError. Bulletproof but breaks
//              anything legitimately using canvas readback.
//
// Wraps these methods:
//   HTMLCanvasElement.prototype.toDataURL
//   HTMLCanvasElement.prototype.toBlob
//   CanvasRenderingContext2D.prototype.getImageData
//   OffscreenCanvas.prototype.convertToBlob (when present)

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

  let mode = "off";
  const dataUrlCache = new WeakMap();   // HTMLCanvasElement → string
  const blobCache = new WeakMap();      // HTMLCanvasElement | OffscreenCanvas → Blob
  const imageDataCache = new WeakMap(); // CanvasRenderingContext2D → ImageData

  // 1×1 fully transparent PNG.
  const BLANK_PNG_DATAURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==";
  function makeBlankBlob() {
    const b64 = BLANK_PNG_DATAURL.split(",")[1];
    const bytes = atob(b64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return new Blob([buf], { type: "image/png" });
  }

  // ── toDataURL ────────────────────────────────────────────────────────
  if (typeof HTMLCanvasElement !== "undefined") {
    const orig = HTMLCanvasElement.prototype.toDataURL;
    const wrap = function () {
      if (mode === "off") return orig.apply(this, arguments);
      if (mode === "block") return BLANK_PNG_DATAURL;
      // stabilize
      if (dataUrlCache.has(this)) return dataUrlCache.get(this);
      const r = orig.apply(this, arguments);
      dataUrlCache.set(this, r);
      return r;
    };
    fnWrapperMap.set(wrap, orig);
    copyFnIdentity(wrap, orig);
    HTMLCanvasElement.prototype.toDataURL = wrap;
  }

  // ── toBlob ───────────────────────────────────────────────────────────
  if (typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.toBlob === "function") {
    const orig = HTMLCanvasElement.prototype.toBlob;
    const wrap = function (callback) {
      if (mode === "off") return orig.apply(this, arguments);
      if (typeof callback !== "function") {
        // Match Chrome: TypeError on missing callback
        throw new TypeError("Failed to execute 'toBlob' on 'HTMLCanvasElement': 1 argument required");
      }
      if (mode === "block") {
        const blob = makeBlankBlob();
        setTimeout(() => callback(blob), 0);
        return;
      }
      // stabilize
      const cached = blobCache.get(this);
      if (cached) {
        setTimeout(() => callback(cached), 0);
        return;
      }
      const self = this;
      const intercept = function (blob) {
        if (blob) blobCache.set(self, blob);
        callback(blob);
      };
      const args = [intercept];
      for (let i = 1; i < arguments.length; i++) args.push(arguments[i]);
      return orig.apply(this, args);
    };
    fnWrapperMap.set(wrap, orig);
    copyFnIdentity(wrap, orig);
    HTMLCanvasElement.prototype.toBlob = wrap;
  }

  // ── getImageData (2D) ────────────────────────────────────────────────
  if (typeof CanvasRenderingContext2D !== "undefined") {
    const orig = CanvasRenderingContext2D.prototype.getImageData;
    const wrap = function () {
      if (mode === "off") return orig.apply(this, arguments);
      if (mode === "block") {
        throw new DOMException(
          "The canvas has been tainted by cross-origin data.",
          "SecurityError",
        );
      }
      if (imageDataCache.has(this)) return imageDataCache.get(this);
      const r = orig.apply(this, arguments);
      imageDataCache.set(this, r);
      return r;
    };
    fnWrapperMap.set(wrap, orig);
    copyFnIdentity(wrap, orig);
    CanvasRenderingContext2D.prototype.getImageData = wrap;
  }

  // ── OffscreenCanvas.convertToBlob ───────────────────────────────────
  if (typeof OffscreenCanvas !== "undefined" && typeof OffscreenCanvas.prototype.convertToBlob === "function") {
    const orig = OffscreenCanvas.prototype.convertToBlob;
    const wrap = function () {
      if (mode === "off") return orig.apply(this, arguments);
      if (mode === "block") return Promise.resolve(makeBlankBlob());
      const cached = blobCache.get(this);
      if (cached) return Promise.resolve(cached);
      const self = this;
      return orig.apply(this, arguments).then(blob => {
        if (blob) blobCache.set(self, blob);
        return blob;
      });
    };
    fnWrapperMap.set(wrap, orig);
    copyFnIdentity(wrap, orig);
    OffscreenCanvas.prototype.convertToBlob = wrap;
  }

  // ── Per-site mode override ──────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values } = JSON.parse(e.detail);
      const v = values && values["canvas.mode"];
      if (v === "off" || v === "stabilize" || v === "block") mode = v;
    } catch { /* malformed */ }
  }, { once: true });
})();
