// Canvas fingerprinting mitigation — MAIN world, document_start.
//
// Mode-based wrapping of canvas readback methods. Default mode "off"
// so the script is harmless until the user opts in per-site.
//
//   off        passthrough; canvas works normally (default).
//              Our wrappers are NOT installed on the prototype, so
//              our line never appears in any stack trace.
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
// Wraps these methods (when mode is non-off):
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

  // ── Originals captured once at document_start ───────────────────────
  // Stored so we can lazily install / uninstall the wrappers when the
  // user toggles canvas mode without leaving stale references behind.
  const origToDataURL = typeof HTMLCanvasElement !== "undefined"
    ? HTMLCanvasElement.prototype.toDataURL : null;
  const origToBlob = typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.toBlob === "function"
    ? HTMLCanvasElement.prototype.toBlob : null;
  const origGetImageData = typeof CanvasRenderingContext2D !== "undefined"
    ? CanvasRenderingContext2D.prototype.getImageData : null;
  const origConvertToBlob = typeof OffscreenCanvas !== "undefined" && typeof OffscreenCanvas.prototype.convertToBlob === "function"
    ? OffscreenCanvas.prototype.convertToBlob : null;

  // ── Wrappers (constructed once, installed on demand) ────────────────
  // These all read `mode` live from the closure so the same wrapper
  // serves both "stabilize" and "block" modes.
  let wrapToDataURL, wrapToBlob, wrapGetImageData, wrapConvertToBlob;

  if (origToDataURL) {
    wrapToDataURL = function () {
      if (mode === "block") return BLANK_PNG_DATAURL;
      // stabilize
      if (dataUrlCache.has(this)) return dataUrlCache.get(this);
      const r = origToDataURL.apply(this, arguments);
      dataUrlCache.set(this, r);
      return r;
    };
    fnWrapperMap.set(wrapToDataURL, origToDataURL);
    copyFnIdentity(wrapToDataURL, origToDataURL);
  }

  if (origToBlob) {
    wrapToBlob = function (callback) {
      if (typeof callback !== "function") {
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
      return origToBlob.apply(this, args);
    };
    fnWrapperMap.set(wrapToBlob, origToBlob);
    copyFnIdentity(wrapToBlob, origToBlob);
  }

  if (origGetImageData) {
    wrapGetImageData = function () {
      if (mode === "block") {
        throw new DOMException(
          "The canvas has been tainted by cross-origin data.",
          "SecurityError",
        );
      }
      if (imageDataCache.has(this)) return imageDataCache.get(this);
      const r = origGetImageData.apply(this, arguments);
      imageDataCache.set(this, r);
      return r;
    };
    fnWrapperMap.set(wrapGetImageData, origGetImageData);
    copyFnIdentity(wrapGetImageData, origGetImageData);
  }

  if (origConvertToBlob) {
    wrapConvertToBlob = function () {
      if (mode === "block") return Promise.resolve(makeBlankBlob());
      const cached = blobCache.get(this);
      if (cached) return Promise.resolve(cached);
      const self = this;
      return origConvertToBlob.apply(this, arguments).then(blob => {
        if (blob) blobCache.set(self, blob);
        return blob;
      });
    };
    fnWrapperMap.set(wrapConvertToBlob, origConvertToBlob);
    copyFnIdentity(wrapConvertToBlob, origConvertToBlob);
  }

  // ── Lazy install / uninstall ────────────────────────────────────────
  // Defaults to NOT installed. Switching to stabilize/block installs;
  // switching back to off uninstalls (prototype reverts to native).
  // Net effect: when mode is "off", our wrappers are never on the
  // prototype chain — our line cannot appear in any stack trace.
  let installed = false;
  function install() {
    if (installed) return;
    if (wrapToDataURL)      HTMLCanvasElement.prototype.toDataURL = wrapToDataURL;
    if (wrapToBlob)         HTMLCanvasElement.prototype.toBlob = wrapToBlob;
    if (wrapGetImageData)   CanvasRenderingContext2D.prototype.getImageData = wrapGetImageData;
    if (wrapConvertToBlob)  OffscreenCanvas.prototype.convertToBlob = wrapConvertToBlob;
    installed = true;
  }
  function uninstall() {
    if (!installed) return;
    if (origToDataURL)      HTMLCanvasElement.prototype.toDataURL = origToDataURL;
    if (origToBlob)         HTMLCanvasElement.prototype.toBlob = origToBlob;
    if (origGetImageData)   CanvasRenderingContext2D.prototype.getImageData = origGetImageData;
    if (origConvertToBlob)  OffscreenCanvas.prototype.convertToBlob = origConvertToBlob;
    installed = false;
  }

  // ── Per-site mode override ──────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values } = JSON.parse(e.detail);
      const v = values && values["canvas.mode"];
      if (v === "off" || v === "stabilize" || v === "block") mode = v;
    } catch { /* malformed */ }
    if (mode === "off") uninstall();
    else install();
  }, { once: true });
})();
