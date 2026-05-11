// WebGL renderer / vendor spoof — MAIN world, document_start.
//
// Brave normalizes WEBGL_debug_renderer_info to obscure the real GPU.
// Real Chrome returns specific ANGLE/D3D11/Metal strings. We wrap
// WebGLRenderingContext.prototype.getParameter (and the WebGL2
// variant) to return user-configurable vendor / renderer strings for
// the two unmasked parameters from WEBGL_debug_renderer_info.
//
// We intentionally don't touch the masked VENDOR (0x1F00) and
// RENDERER (0x1F01) because Chrome's values there are already
// deterministic ("WebKit" / "WebKit WebGL") and match Brave's
// defaults, so no spoof gain.
//
// Configurable values:
//   webgl.vendor    UNMASKED_VENDOR_WEBGL   (default: Google Inc. (Intel))
//   webgl.renderer  UNMASKED_RENDERER_WEBGL (default: typical Intel UHD)

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

  const values = {
    vendor:   "Google Inc. (Intel)",
    renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  };

  // WEBGL_debug_renderer_info constants
  const UNMASKED_VENDOR_WEBGL   = 0x9245; // 37445
  const UNMASKED_RENDERER_WEBGL = 0x9246; // 37446

  function wrapGetParameter(proto) {
    if (!proto) return;
    const orig = proto.getParameter;
    if (typeof orig !== "function") return;
    const wrap = function (pname) {
      if (pname === UNMASKED_VENDOR_WEBGL)   return values.vendor;
      if (pname === UNMASKED_RENDERER_WEBGL) return values.renderer;
      return orig.call(this, pname);
    };
    fnWrapperMap.set(wrap, orig);
    copyFnIdentity(wrap, orig);
    proto.getParameter = wrap;
  }

  if (typeof WebGLRenderingContext !== "undefined") wrapGetParameter(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== "undefined") wrapGetParameter(WebGL2RenderingContext.prototype);

  // ── Per-site value overrides ────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values: ov } = JSON.parse(e.detail);
      if (!ov) return;
      if (typeof ov["webgl.vendor"]   === "string" && ov["webgl.vendor"])   values.vendor   = ov["webgl.vendor"];
      if (typeof ov["webgl.renderer"] === "string" && ov["webgl.renderer"]) values.renderer = ov["webgl.renderer"];
    } catch { /* malformed */ }
  }, { once: true });
})();
