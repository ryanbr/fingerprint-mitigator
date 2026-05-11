// WebGPU stub — MAIN world, document_start.
//
// Chrome 113+ exposes navigator.gpu. Brave currently doesn't, so a
// `typeof navigator.gpu === "object"` check distinguishes. Two
// levels of stubbing, controlled per-site:
//
//   exposeAdapter = false (default)  → requestAdapter() resolves null
//                                       (matches Chrome with no usable GPU)
//   exposeAdapter = true              → returns a stub GPUAdapter with
//                                       configurable vendor / architecture
//
// When the stub adapter is exposed, we also create the companion
// classes (GPUAdapterInfo, GPUSupportedFeatures, GPUSupportedLimits)
// so `adapter.info instanceof GPUAdapterInfo` etc. pass. Limits use
// Chrome's spec-mandated defaults so a fingerprinter pulling
// `adapter.limits.maxTextureDimension2D` gets 8192 (Chrome typical).

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

  if (typeof navigator.gpu !== "undefined") return;     // Vivaldi/Opera keep WebGPU
  if (typeof Navigator === "undefined") return;

  // Per-site configurable values.
  const values = {
    canvasFormat:        "bgra8unorm",
    exposeAdapter:       false,
    adapterVendor:       "intel",
    adapterArchitecture: "gen-12lp",
    isFallbackAdapter:   false,
  };

  // ── GPUAdapterInfo ──────────────────────────────────────────────────
  class GPUAdapterInfo {
    constructor({ vendor, architecture, device, description } = {}) {
      Object.defineProperty(this, "vendor", { value: vendor || "", enumerable: true });
      Object.defineProperty(this, "architecture", { value: architecture || "", enumerable: true });
      Object.defineProperty(this, "device", { value: device || "", enumerable: true });
      Object.defineProperty(this, "description", { value: description || "", enumerable: true });
    }
    get [Symbol.toStringTag]() { return "GPUAdapterInfo"; }
  }
  makeFakeNativeClass(GPUAdapterInfo, "GPUAdapterInfo");

  // ── GPUSupportedFeatures (Set-like) ─────────────────────────────────
  // Real Chrome's GPUSupportedFeatures is a setlike interface. We use
  // Set directly + label it via Symbol.toStringTag so
  // Object.prototype.toString.call(adapter.features) returns
  // "[object GPUSupportedFeatures]" matching Chrome.
  class GPUSupportedFeatures extends Set {
    get [Symbol.toStringTag]() { return "GPUSupportedFeatures"; }
  }
  makeFakeNativeClass(GPUSupportedFeatures, "GPUSupportedFeatures");

  // ── GPUSupportedLimits ──────────────────────────────────────────────
  // Numeric values match Chrome's spec-mandated minimums. Real Chrome
  // on hardware often exposes higher limits; using the minimums is a
  // safe lower bound that doesn't claim more capability than verified.
  const LIMITS_DEFAULTS = Object.freeze({
    maxTextureDimension1D: 8192,
    maxTextureDimension2D: 8192,
    maxTextureDimension3D: 2048,
    maxTextureArrayLayers: 256,
    maxBindGroups: 4,
    maxBindGroupsPlusVertexBuffers: 24,
    maxBindingsPerBindGroup: 1000,
    maxDynamicUniformBuffersPerPipelineLayout: 8,
    maxDynamicStorageBuffersPerPipelineLayout: 4,
    maxSampledTexturesPerShaderStage: 16,
    maxSamplersPerShaderStage: 16,
    maxStorageBuffersPerShaderStage: 8,
    maxStorageTexturesPerShaderStage: 4,
    maxUniformBuffersPerShaderStage: 12,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 134217728,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    maxVertexBuffers: 8,
    maxBufferSize: 268435456,
    maxVertexAttributes: 16,
    maxVertexBufferArrayStride: 2048,
    maxInterStageShaderVariables: 16,
    maxColorAttachments: 8,
    maxColorAttachmentBytesPerSample: 32,
    maxComputeWorkgroupStorageSize: 16384,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeWorkgroupsPerDimension: 65535,
  });
  class GPUSupportedLimits {
    constructor() {
      for (const [k, v] of Object.entries(LIMITS_DEFAULTS)) {
        Object.defineProperty(this, k, { value: v, enumerable: true });
      }
    }
    get [Symbol.toStringTag]() { return "GPUSupportedLimits"; }
  }
  makeFakeNativeClass(GPUSupportedLimits, "GPUSupportedLimits");

  // ── GPUAdapter ──────────────────────────────────────────────────────
  class GPUAdapter extends EventTarget {
    constructor(info, features, limits, isFallback) {
      super();
      this._info = info;
      this._features = features;
      this._limits = limits;
      this._isFallback = isFallback;
    }
    get info() { return this._info; }
    get features() { return this._features; }
    get limits() { return this._limits; }
    get isFallbackAdapter() { return this._isFallback; }
    requestDevice() {
      // Chrome can fail device creation with OperationError; mirroring
      // that is more believable than "not implemented".
      return Promise.reject(new DOMException("Device creation failed", "OperationError"));
    }
    requestAdapterInfo() { return Promise.resolve(this._info); } // deprecated but still callable
    get [Symbol.toStringTag]() { return "GPUAdapter"; }
  }
  makeFakeNativeClass(GPUAdapter, "GPUAdapter");
  fakeNativeMethods(GPUAdapter, ["requestDevice", "requestAdapterInfo"]);

  // ── GPU (top-level entry point) ─────────────────────────────────────
  class GPU extends EventTarget {
    requestAdapter() {
      if (!values.exposeAdapter) return Promise.resolve(null);
      const info = new GPUAdapterInfo({
        vendor: values.adapterVendor,
        architecture: values.adapterArchitecture,
        device: "",
        description: "",
      });
      const features = new GPUSupportedFeatures();
      const limits = new GPUSupportedLimits();
      return Promise.resolve(new GPUAdapter(info, features, limits, values.isFallbackAdapter));
    }
    getPreferredCanvasFormat() { return values.canvasFormat; }
    get wgslLanguageFeatures() { return new Set(); }
  }
  makeFakeNativeClass(GPU, "GPU");
  fakeNativeMethods(GPU, ["requestAdapter", "getPreferredCanvasFormat"]);

  // ── Expose globals + the singleton instance ─────────────────────────
  try {
    for (const [name, cls] of [
      ["GPU", GPU],
      ["GPUAdapter", GPUAdapter],
      ["GPUAdapterInfo", GPUAdapterInfo],
      ["GPUSupportedFeatures", GPUSupportedFeatures],
      ["GPUSupportedLimits", GPUSupportedLimits],
    ]) {
      if (typeof window[name] !== "function") {
        Object.defineProperty(window, name, { value: cls, writable: true, configurable: true });
      }
    }
    // GPUDevice / GPUCanvasContext as throw-on-construct stubs (Chrome
    // exposes the constructors but they're not directly user-constructable).
    for (const name of ["GPUDevice", "GPUCanvasContext"]) {
      if (typeof window[name] !== "function") {
        const Stub = class extends EventTarget {
          constructor() {
            super();
            throw new TypeError("Illegal constructor");
          }
        };
        makeFakeNativeClass(Stub, name);
        Object.defineProperty(window, name, { value: Stub, writable: true, configurable: true });
      }
    }

    const instance = new GPU();
    Object.defineProperty(Navigator.prototype, "gpu", {
      get() { return instance; }, configurable: true, enumerable: true,
    });
  } catch { /* sealed */ }

  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values: ov } = JSON.parse(e.detail);
      if (!ov) return;
      if (ov["webgpu.canvasFormat"]) values.canvasFormat = ov["webgpu.canvasFormat"];
      if (ov["webgpu.exposeAdapter"] !== undefined) values.exposeAdapter = ov["webgpu.exposeAdapter"];
      if (ov["webgpu.adapterVendor"] !== undefined) values.adapterVendor = ov["webgpu.adapterVendor"];
      if (ov["webgpu.adapterArchitecture"] !== undefined) values.adapterArchitecture = ov["webgpu.adapterArchitecture"];
      if (ov["webgpu.isFallbackAdapter"] !== undefined) values.isFallbackAdapter = ov["webgpu.isFallbackAdapter"];
    } catch { /* malformed */ }
  }, { once: true });
})();
