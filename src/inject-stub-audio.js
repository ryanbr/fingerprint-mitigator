// Audio fingerprinting mitigation — MAIN world, document_start.
//
// Same model as canvas: mode-based wrapping with lazy install. Default
// mode "off" means wrappers are NOT installed on the prototype, so our
// line never appears in any stack trace.
//
//   off        passthrough (default — no wrappers installed)
//   stabilize  per-instance WeakMap cache; subsequent reads on the
//              same AudioBuffer / AnalyserNode / OfflineAudioContext
//              return the cached result. Defeats "render twice,
//              compare bytes, flag as Brave" detection.
//   block      return zero-filled / silent data.
//
// Wraps (when mode is non-off):
//   AudioBuffer.prototype.getChannelData
//   AudioBuffer.prototype.copyFromChannel
//   AnalyserNode.prototype.getFloatFrequencyData
//   AnalyserNode.prototype.getByteFrequencyData
//   AnalyserNode.prototype.getFloatTimeDomainData
//   AnalyserNode.prototype.getByteTimeDomainData
//   OfflineAudioContext.prototype.startRendering

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
  const channelCache = new WeakMap();
  const analyserCache = new WeakMap();
  const renderCache = new WeakMap();

  // ── Originals captured once ─────────────────────────────────────────
  const origGetChannelData = typeof AudioBuffer !== "undefined"
    ? AudioBuffer.prototype.getChannelData : null;
  const origCopyFromChannel = typeof AudioBuffer !== "undefined" && typeof AudioBuffer.prototype.copyFromChannel === "function"
    ? AudioBuffer.prototype.copyFromChannel : null;
  const ANALYSER_METHODS = ["getFloatFrequencyData", "getByteFrequencyData", "getFloatTimeDomainData", "getByteTimeDomainData"];
  const origAnalyser = {};
  if (typeof AnalyserNode !== "undefined") {
    for (const m of ANALYSER_METHODS) {
      if (typeof AnalyserNode.prototype[m] === "function") {
        origAnalyser[m] = AnalyserNode.prototype[m];
      }
    }
  }
  const origStartRendering = typeof OfflineAudioContext !== "undefined" && typeof OfflineAudioContext.prototype.startRendering === "function"
    ? OfflineAudioContext.prototype.startRendering : null;

  // ── Wrappers (built once) ───────────────────────────────────────────
  let wrapGetChannelData, wrapCopyFromChannel, wrapStartRendering;
  const wrapAnalyser = {};

  if (origGetChannelData) {
    wrapGetChannelData = function (channel) {
      if (mode === "block") return new Float32Array(this.length);
      let arr = channelCache.get(this);
      if (!arr) { arr = []; channelCache.set(this, arr); }
      if (arr[channel]) return arr[channel];
      const r = origGetChannelData.call(this, channel);
      arr[channel] = r;
      return r;
    };
    fnWrapperMap.set(wrapGetChannelData, origGetChannelData);
    copyFnIdentity(wrapGetChannelData, origGetChannelData);
  }

  if (origCopyFromChannel) {
    wrapCopyFromChannel = function (destination, channelNumber, bufferOffset) {
      if (mode === "block") { destination.fill(0); return; }
      let arr = channelCache.get(this);
      if (!arr) { arr = []; channelCache.set(this, arr); }
      if (!arr[channelNumber]) arr[channelNumber] = origGetChannelData.call(this, channelNumber);
      const src = arr[channelNumber];
      const offset = bufferOffset || 0;
      const len = Math.min(destination.length, src.length - offset);
      for (let i = 0; i < len; i++) destination[i] = src[offset + i];
    };
    fnWrapperMap.set(wrapCopyFromChannel, origCopyFromChannel);
    copyFnIdentity(wrapCopyFromChannel, origCopyFromChannel);
  }

  for (const methodName of ANALYSER_METHODS) {
    const orig = origAnalyser[methodName];
    if (!orig) continue;
    const wrap = function (array) {
      if (mode === "block") { array.fill(0); return; }
      let bag = analyserCache.get(this);
      if (!bag) { bag = {}; analyserCache.set(this, bag); }
      const cached = bag[methodName];
      if (cached) {
        const len = Math.min(array.length, cached.length);
        for (let i = 0; i < len; i++) array[i] = cached[i];
        return;
      }
      orig.call(this, array);
      bag[methodName] = array.slice();
    };
    fnWrapperMap.set(wrap, orig);
    copyFnIdentity(wrap, orig);
    wrapAnalyser[methodName] = wrap;
  }

  if (origStartRendering) {
    wrapStartRendering = function () {
      if (mode === "block") {
        try {
          const buf = new AudioBuffer({
            length: this.length,
            sampleRate: this.sampleRate,
            numberOfChannels: 1,
          });
          return Promise.resolve(buf);
        } catch (e) {
          return Promise.reject(e);
        }
      }
      const cached = renderCache.get(this);
      if (cached) return Promise.resolve(cached);
      const self = this;
      return origStartRendering.apply(this, arguments).then(buffer => {
        if (buffer) renderCache.set(self, buffer);
        return buffer;
      });
    };
    fnWrapperMap.set(wrapStartRendering, origStartRendering);
    copyFnIdentity(wrapStartRendering, origStartRendering);
  }

  // ── Lazy install / uninstall ────────────────────────────────────────
  let installed = false;
  function install() {
    if (installed) return;
    if (wrapGetChannelData)  AudioBuffer.prototype.getChannelData = wrapGetChannelData;
    if (wrapCopyFromChannel) AudioBuffer.prototype.copyFromChannel = wrapCopyFromChannel;
    for (const m of ANALYSER_METHODS) if (wrapAnalyser[m]) AnalyserNode.prototype[m] = wrapAnalyser[m];
    if (wrapStartRendering)  OfflineAudioContext.prototype.startRendering = wrapStartRendering;
    installed = true;
  }
  function uninstall() {
    if (!installed) return;
    if (origGetChannelData)  AudioBuffer.prototype.getChannelData = origGetChannelData;
    if (origCopyFromChannel) AudioBuffer.prototype.copyFromChannel = origCopyFromChannel;
    for (const m of ANALYSER_METHODS) if (origAnalyser[m]) AnalyserNode.prototype[m] = origAnalyser[m];
    if (origStartRendering)  OfflineAudioContext.prototype.startRendering = origStartRendering;
    installed = false;
  }

  // ── Per-site mode override ──────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values } = JSON.parse(e.detail);
      const v = values && values["audio.mode"];
      if (v === "off" || v === "stabilize" || v === "block") mode = v;
    } catch { /* malformed */ }
    if (mode === "off") uninstall();
    else install();
  }, { once: true });
})();
