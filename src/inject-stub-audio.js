// Audio fingerprinting mitigation — MAIN world, document_start.
//
// Mode-based wrapping of audio-readback methods (parallel to canvas):
//   off        passthrough (default — no breakage)
//   stabilize  per-instance WeakMap cache; subsequent reads on the
//              same AudioBuffer / AnalyserNode / OfflineAudioContext
//              return the cached result. Defeats "render twice,
//              compare bytes, flag as Brave" detection.
//   block      return zero-filled / silent data.
//
// Wraps:
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
  // Per-AudioBuffer: array of cached Float32Arrays keyed by channel index
  const channelCache = new WeakMap();
  // Per-AnalyserNode: cached typed-array data for each of the 4 readers
  const analyserCache = new WeakMap();
  // Per-OfflineAudioContext: cached AudioBuffer
  const renderCache = new WeakMap();

  // ── AudioBuffer.getChannelData ──────────────────────────────────────
  if (typeof AudioBuffer !== "undefined") {
    const orig = AudioBuffer.prototype.getChannelData;
    const wrap = function (channel) {
      if (mode === "off") return orig.call(this, channel);
      if (mode === "block") return new Float32Array(this.length);
      // stabilize: cache per channel index
      let arr = channelCache.get(this);
      if (!arr) { arr = []; channelCache.set(this, arr); }
      if (arr[channel]) return arr[channel];
      const r = orig.call(this, channel);
      arr[channel] = r;
      return r;
    };
    fnWrapperMap.set(wrap, orig);
    copyFnIdentity(wrap, orig);
    AudioBuffer.prototype.getChannelData = wrap;

    // copyFromChannel(destination, channelNumber, bufferOffset)
    const origCopy = AudioBuffer.prototype.copyFromChannel;
    if (typeof origCopy === "function") {
      const wrapCopy = function (destination, channelNumber, bufferOffset) {
        if (mode === "off") return origCopy.call(this, destination, channelNumber, bufferOffset);
        if (mode === "block") { destination.fill(0); return; }
        // stabilize: read from cached channel data
        let arr = channelCache.get(this);
        if (!arr) { arr = []; channelCache.set(this, arr); }
        if (!arr[channelNumber]) arr[channelNumber] = orig.call(this, channelNumber);
        const src = arr[channelNumber];
        const offset = bufferOffset || 0;
        const len = Math.min(destination.length, src.length - offset);
        for (let i = 0; i < len; i++) destination[i] = src[offset + i];
      };
      fnWrapperMap.set(wrapCopy, origCopy);
      copyFnIdentity(wrapCopy, origCopy);
      AudioBuffer.prototype.copyFromChannel = wrapCopy;
    }
  }

  // ── AnalyserNode getters ────────────────────────────────────────────
  if (typeof AnalyserNode !== "undefined") {
    for (const methodName of ["getFloatFrequencyData", "getByteFrequencyData", "getFloatTimeDomainData", "getByteTimeDomainData"]) {
      const orig = AnalyserNode.prototype[methodName];
      if (typeof orig !== "function") continue;
      const wrap = function (array) {
        if (mode === "off") return orig.call(this, array);
        if (mode === "block") { array.fill(0); return; }
        let bag = analyserCache.get(this);
        if (!bag) { bag = {}; analyserCache.set(this, bag); }
        const cached = bag[methodName];
        if (cached) {
          // Copy from cache into caller's array (matches native sig)
          const len = Math.min(array.length, cached.length);
          for (let i = 0; i < len; i++) array[i] = cached[i];
          return;
        }
        orig.call(this, array);
        // Snapshot a copy so the user's array can be mutated later
        // without polluting the cache.
        bag[methodName] = array.slice();
      };
      fnWrapperMap.set(wrap, orig);
      copyFnIdentity(wrap, orig);
      AnalyserNode.prototype[methodName] = wrap;
    }
  }

  // ── OfflineAudioContext.startRendering ──────────────────────────────
  if (typeof OfflineAudioContext !== "undefined") {
    const orig = OfflineAudioContext.prototype.startRendering;
    if (typeof orig === "function") {
      const wrap = function () {
        if (mode === "off") return orig.apply(this, arguments);
        if (mode === "block") {
          // Resolve a silent buffer matching this context's shape.
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
        return orig.apply(this, arguments).then(buffer => {
          if (buffer) renderCache.set(self, buffer);
          return buffer;
        });
      };
      fnWrapperMap.set(wrap, orig);
      copyFnIdentity(wrap, orig);
      OfflineAudioContext.prototype.startRendering = wrap;
    }
  }

  // ── Per-site mode override ──────────────────────────────────────────
  document.addEventListener("__fpmit_settings", (e) => {
    try {
      const { values } = JSON.parse(e.detail);
      const v = values && values["audio.mode"];
      if (v === "off" || v === "stabilize" || v === "block") mode = v;
    } catch { /* malformed */ }
  }, { once: true });
})();
