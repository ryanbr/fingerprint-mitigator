# CLAUDE.md

## Project overview

Fingerprint Mitigator is a Chrome/Firefox MV3 extension that **masks** the browser identity exposed to fingerprinting scripts — primarily making Chromium variants (Brave, Vivaldi, Opera, Yandex, Whale, etc.) appear as vanilla Chrome. It's the offensive counterpart to the sister **Fingerprint Detector** extension (which observes-only). Detection vectors are addressed on three layers:

1. **JS identity** — `navigator.brave`, `userAgentData.brands`, vendor globals (`window.opr`, `vivaldi`, `yandex`), `navigator.userAgent` identity tokens.
2. **HTTP Client Hints + User-Agent** — `Sec-CH-UA*` headers rewritten or stripped via `declarativeNetRequest`. When a site has `identity.customUA` set, the HTTP `User-Agent` header is rewritten to match the JS-side value (defeats server-side UA sniffing — e.g. `vivaldi.com/game/`).
3. **Brave-removed API stubs** — re-add the API surface Brave disables (Battery, Sensors, IdleDetector, SpeechRecognition, WebUSB / Bluetooth / Serial / HID, Topics, FLEDGE, Shared Storage, queryLocalFonts, PressureObserver, OTPCredential, WebGPU, NetworkInformation values, hwInfo values, privacy hints, etc.). Also: canvas / audio readback stabilisation and WebGL renderer/vendor spoofing.

Per-site, per-category, per-sub-check, and per-value granularity. Single browser-preset selector flips multiple categories at once (Chrome/Edge/Firefox/Safari).

## Architecture

```
src/inject-identity.js        \
src/inject-stub-battery.js     \
src/inject-stub-canvas.js       \
src/inject-stub-audio.js         |
src/inject-stub-webgl.js         |
src/inject-stub-webgpu.js        |  MAIN-world content scripts, each
src/inject-stub-network.js       |  registered as a separate dynamic
src/inject-stub-hwinfo.js        |  content script via chrome.scripting
src/inject-stub-privacy-hints.js |  in background.js. Per-category /
src/inject-stub-sensors.js       |  per-site enable via excludeMatches.
src/inject-stub-idle-speech.js   |
src/inject-stub-hardware.js      |
src/inject-stub-privacy.js      /
src/inject-stub-misc.js        /

src/bridge.js                  ISOLATED-world content script. Reads
                               chrome.storage.local.siteOverrides[hostname]
                               (with parent-domain inheritance) and
                               dispatches a __fpmit_settings CustomEvent
                               to all MAIN-world inject scripts.

src/background.js              Service worker. Dynamic registration of
                               every above script via
                               chrome.scripting.registerContentScripts.
                               Owns the DNR rule for Sec-CH-UA* headers.
                               Listens to chrome.storage.onChanged and
                               re-registers when settings change.

src/popup.html / popup.js      Toolbar popup: master toggle + browser
                               preset dropdown + per-category toggles
                               (10 of 15 expandable) + reset / manage
                               buttons.

src/changes.html / changes.js  Standalone settings management page.
                               Lists every site with non-default config,
                               supports per-site reset, full reset, and
                               JSON export. Live-updates via
                               chrome.storage.onChanged.
```

## Key files

- `manifest.json` — MV3. Permissions: `activeTab`, `storage`, `tabs`, `scripting`, `declarativeNetRequestWithHostAccess`. `host_permissions: ["<all_urls>"]`. No static `content_scripts` — everything is registered dynamically by `background.js`. Firefox `browser_specific_settings.gecko` block is added by `prepare-ext.js` (and the release workflow, when set up).
- `src/inject-identity.js` — `navigator.brave` deletion (walks prototype chain), brand filter on `userAgentData` (adds `Google Chrome` if missing — critical, this entry's absence is itself a Brave tell), vendor-globals strip, UA identity-token strip, customUA value override, `identity.uaDataMode = "remove"` deletes `navigator.userAgentData` entirely (Firefox/Safari presets). Also includes a vendor-scheme navigation guard (`identity.protocolBlock`) that swallows `vivaldi://`, `brave://`, `opera://`, `opera-gx://`, `yandex://`, `whale://` from `location.href` setter, `location.assign/replace`, `window.open`, and anchor clicks — suppresses the OS "Open in <X>?" handler popup when a UA-sniffing site deep-links into the browser it thinks we are.
- `src/inject-stub-canvas.js` — canvas readback (toDataURL / toBlob / getImageData / OffscreenCanvas.convertToBlob). Mode: `off` (default) / `stabilize` (WeakMap cache) / `block` (1×1 PNG + SecurityError). Default off — opt-in per site to avoid captcha breakage.
- `src/inject-stub-audio.js` — same model as canvas; wraps AudioBuffer.getChannelData/copyFromChannel, AnalyserNode.getFloat\*Data/getByte\*Data, OfflineAudioContext.startRendering. Mode: `off` / `stabilize` / `block`. Default off.
- `src/inject-stub-webgl.js` — wraps `WebGLRenderingContext.prototype.getParameter` (and WebGL2 variant) to spoof `WEBGL_debug_renderer_info.UNMASKED_VENDOR_WEBGL` (`0x9245`) and `UNMASKED_RENDERER_WEBGL` (`0x9246`). Configurable vendor + renderer strings. Default: Intel UHD on D3D11.
- `src/inject-stub-webgpu.js` — full GPU + GPUAdapter + GPUAdapterInfo + GPUSupportedFeatures + GPUSupportedLimits classes on `window`. `navigator.gpu.requestAdapter()` returns null (default) or a stub adapter (configurable). Spoofed canvas format, vendor, architecture.
- `src/inject-stub-network.js` — wraps `NetworkInformation.prototype` getters for effectiveType / saveData / downlink / rtt / type / downlinkMax. Values configurable.
- `src/inject-stub-hwinfo.js` — wraps `navigator.deviceMemory`, `hardwareConcurrency`, `maxTouchPoints`, `pdfViewerEnabled`. All configurable.
- `src/inject-stub-privacy-hints.js` — spoofs `navigator.globalPrivacyControl`, `doNotTrack`, `language`, `languages`. Configurable.
- `src/inject-stub-battery.js` — proper `BatteryManager` class with internal-construction sentinel. charging/level/chargingTime/dischargingTime configurable.
- `src/inject-stub-sensors.js` — Sensor abstract base + 9 concrete subclasses (Accelerometer etc.) extending Sensor properly so `instanceof` chain holds.
- `src/inject-stub-idle-speech.js` — IdleDetector + SpeechRecognition + webkitSpeechRecognition.
- `src/inject-stub-hardware.js` — USB / Bluetooth / Serial / HID classes on `window` + instances on `navigator`; `requestMIDIAccess`. Per-API sub-toggle.
- `src/inject-stub-privacy.js` — Topics (`document.browsingTopics`), Protected Audience / FLEDGE (8 Navigator methods), Shared Storage. 3 sub-toggles + topic IDs / taxonomyVersion / modelVersion / sharedStorage budget values.
- `src/inject-stub-misc.js` — queryLocalFonts, getInstalledRelatedApps, PressureObserver, OTPCredential, storageBuckets. 5 sub-toggles.
- `src/bridge.js` — reads `siteOverrides` and dispatches `__fpmit_settings` event. Walks parent domains for inheritance.
- `src/background.js` — `registerInjectScripts()` registers each category script + the bridge with computed `excludeMatches`. `updateSecChUaRules()` builds a base DNR rule + per-site override rules. Refreshes on `chrome.storage.onChanged`. Default `FAKE_SEC_CH_UA` brand string; bump version when Chromium major rolls forward. Per-site override rules also include a `User-Agent` set action when `identity.customUA` is configured (gated on identity category being on, to avoid HTTP↔JS mismatch).
- `src/popup.html` / `popup.js` — toolbar UI. Browser preset selector + master toggle + 15 category toggles (10 expandable). Sub-checks via `data-subcheck-key` attributes; value inputs via `data-value-key`. `CATEGORY_PREFIXES` map decides which category's "modified" indicator lights up. Theme follows `chrome.storage.local.theme`.
- `src/changes.html` / `changes.js` — settings management. Lists every site in `disabledDomains` or `siteOverrides`. Per-site reset + full reset + JSON export. Theme synced.

## Storage model

```js
chrome.storage.local = {
  // Master per-site off. Storage key is hostname with leading "www." stripped.
  disabledDomains: { "site.com": true },

  // Per-site overrides. Sparse — only explicit non-default entries stored.
  siteOverrides: {
    "site.com": {
      // Whole-category off (top-level keys whose value is === false).
      // e.g. hardware: false, clientHints: false
      clientHints: false,

      // Sub-check opt-outs (key format: "category.sub").
      subChecks: {
        "hardware.usb": false,
        "identity.brave": false,
        "misc.storageBuckets": false,
      },

      // Value overrides (key format: "category.field" or "uaData.field").
      values: {
        "network.effectiveType": "3g",
        "battery.charging": false,
        "identity.customUA": "Mozilla/5.0 (...)",
        "identity.uaDataMode": "remove",  // Firefox/Safari presets
        "clientHints.mode": "remove",     // Firefox/Safari presets
      },
    },
  },

  // Theme persistence (popup + changes.html share this).
  theme: "light" | "dark",
};
```

### Subdomain inheritance

Both `disabledDomains` and `siteOverrides` lookups walk parent domains: a config on `example.com` applies to `shop.example.com` and `cart.example.com`. Exact match wins; otherwise the closest parent. Implemented identically in `bridge.js` (`lookupOverrides`) and `popup.js` (`findParentKey`). The `excludeMatches` patterns generated by `background.js` use `*://*.host/*` so category enable/disable also covers subdomains.

**Saving keys by exact hostname** — a per-site change on `shop.example.com` stores under `shop.example.com`, which takes precedence over `example.com` for shop and its sub-subdomains. To configure the whole domain root, visit `example.com` directly and toggle there.

## Categories (15 total)

| Category | What it wraps | Configurable values |
|---|---|---|
| `identity` | navigator.brave, userAgentData.brands/getHEV/toJSON, vendor globals, UA strip | customUA, uaDataMode, uaData.platformVersion/architecture/bitness/model/uaFullVersion/wow64/formFactor |
| `privacyHints` | globalPrivacyControl, doNotTrack, language, languages | all 4 |
| `clientHints` | DNR rule for Sec-CH-UA* HTTP headers | brand, mobile, platform, mode (set/remove) |
| `canvas` | toDataURL / toBlob / getImageData / convertToBlob | mode (off/stabilize/block) |
| `audio` | AudioBuffer / AnalyserNode / OfflineAudioContext | mode (off/stabilize/block) |
| `webgl` | WebGLRenderingContext.getParameter UNMASKED_* | vendor, renderer |
| `webgpu` | navigator.gpu, GPU/GPUAdapter/GPUDevice/GPUAdapterInfo/GPUSupportedFeatures/GPUSupportedLimits | canvasFormat, exposeAdapter, adapterVendor, adapterArchitecture, isFallbackAdapter |
| `battery` | navigator.getBattery + BatteryManager class | charging, level, chargingTime, dischargingTime |
| `network` | NetworkInformation getters | effectiveType, saveData, downlink, rtt (+ type / downlinkMax internally) |
| `hwInfo` | navigator.deviceMemory/hardwareConcurrency/maxTouchPoints/pdfViewerEnabled | all 4 |
| `sensors` | 10 sensor classes (Sensor abstract + 9 concrete) | — |
| `idleSpeech` | IdleDetector, SpeechRecognition, webkitSpeechRecognition | — |
| `hardware` | WebUSB/Bluetooth/Serial/HID classes + instances, requestMIDIAccess | per-API sub-toggles (5) |
| `privacy` | Topics, FLEDGE (8 methods), SharedStorage | sub-toggles per API + topics.ids/taxonomyVersion/modelVersion + sharedStorage.budget |
| `misc` | queryLocalFonts, getInstalledRelatedApps, PressureObserver, OTPCredential, storageBuckets | per-API sub-toggles (5) |

## Browser presets

Defined in `popup.js` as the `PRESETS` map. Selecting one writes ~10–15 values into `siteOverrides[site].values`, then reloads the tab. Available:

- **Chrome 148 / Windows | macOS | Linux | Android** — full Chrome-shape spoof with platform-appropriate UA, Sec-CH-UA, platformVersion, architecture, WebGL vendor/renderer, WebGPU canvas format.
- **Edge 148 / Windows** — Chrome-shape with `"Microsoft Edge"` brand instead.
- **Firefox 142 / Windows | macOS** — `identity.customUA` set to Firefox UA; `identity.uaDataMode = "remove"` deletes `navigator.userAgentData`; `clientHints.mode = "remove"` makes DNR strip Sec-CH-UA / Mobile / Platform entirely. WebGL vendor/renderer set to "Mozilla".
- **Safari 17 / macOS** — same removal pattern with Safari UA and "Apple Inc." / "Apple GPU" WebGL.

After applying a preset, users can hand-tweak individual values in the expandable category rows — preset is a starting point, not a lock.

## Anti-tamper plumbing

Each `inject-*.js` script has its own copy of:

- `fnWrapperMap` (WeakMap) — wrapper fn → original native fn. `Function.prototype.toString` checks this and returns the wrapped native's source.
- `fakeNativeMap` (WeakMap) — stub fn → canned `"function NAME() { [native code] }"` string. Used for stubs that don't wrap a native (added APIs like `IdleDetector`).
- `copyFnIdentity(wrapper, orig)` — copies `.name` and `.length` from native to wrapper so descriptor probes don't expose the wrapper.
- `Function.prototype.toString` wrapper at the top of each script.

When multiple scripts run, each wraps `Function.prototype.toString` independently. The wrappers cascade safely: each one checks its own maps first, then falls through to the prior wrapper (which becomes `origToString` from its perspective), all the way down to the native at the bottom. Verified by walking through the call chain — every script's wrappers are queryable independently.

## Settings flow (race-tolerant)

1. Each MAIN-world inject script installs all its hooks at document_start with default values.
2. ISOLATED-world `bridge.js` reads `chrome.storage.local.siteOverrides[hostname]` (async; ~1–5 ms after document_start).
3. Once read, dispatches `__fpmit_settings` CustomEvent (detail: JSON of `{subChecks, values}`).
4. Each MAIN-world script's `document.addEventListener("__fpmit_settings", ..., { once: true })` handler:
   - For each `subChecks[key] === false`, calls the recorded uninstaller (deletes added properties, restores original descriptors).
   - For each `values[key]` present, updates closure variables that the installed wrappers read live.

**Race window** (1–5 ms): page scripts running inline at document_start see defaults briefly. Most fingerprinting libraries load via async `<script src>` and run after DOMContentLoaded — race is academic for them.

## Build / lint

```bash
npm install           # install eslint + web-ext
npm run lint          # ESLint on src/
npm run lint:fix      # auto-fix
npm run lint:ext      # assembles build-tmp/ + Mozilla web-ext lint (with FF-patched manifest)
npm run lint:all      # both
```

There's no bundler — every inject script is a self-contained IIFE delivered as-is. Load unpacked in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select repo root.

`scripts/prepare-ext.js` assembles a Firefox-patched copy of the manifest into `build-tmp/` for `web-ext lint`. It adds `browser_specific_settings.gecko` and pairs `background.service_worker` with `background.scripts` (AMO validator requirement).

## Common pitfalls

- **Don't expect to fool sophisticated fingerprinters from JS alone.** Brave's canvas / audio / WebGL output randomisation happens at the C++ engine layer; our hooks run above that. The Canvas/Audio `stabilize` modes defeat naive "read-twice-compare" detection but can't undo Brave's noise. For full masking the user must also set Brave Shields → Down (or Strict → Standard) on the site.
- **Sec-CH-UA version vs JS userAgentData version must agree.** If you bump one (e.g. Chromium 148 → 149) update both: `FAKE_SEC_CH_UA` in `background.js` AND `uaFullVersion` default in `inject-identity.js` AND popup-default text in `popup.html`. The Chrome 148 preset in `popup.js` PRESETS also needs updating.
- **The brand filter MUST add a "Google Chrome" entry**, not just strip Brave. Real Chrome's `userAgentData.brands` always contains "Google Chrome"; a 2-entry list with only "Chromium" + placeholder is itself a Brave tell. See `filterBrands` in `inject-identity.js`.
- **`identity.uaDataMode = "remove"`** (Firefox/Safari presets) overrides `Navigator.prototype.userAgentData` with a getter returning `undefined`. `'userAgentData' in navigator` still returns true, but `if (navigator.userAgentData)` is the common check and that falls through.
- **`clientHints.mode = "remove"`** (Firefox/Safari presets) makes the DNR rule strip ALL Sec-CH-UA-* headers (not just high-entropy). Without this, Firefox preset would still send Sec-CH-UA which would be a tell.
- **Per-site disable rebuilds the dynamic scripts and DNR rules.** Toggling reloads the tab so changes take effect on the current page.
- **Settings flow has a 1–5 ms race window.** Acceptable for most fingerprinters (async loaders), bad for inline-at-document_start fingerprint code. If a site is a known holdout, change the bridge approach.
- **Storage-key normalisation** strips leading `www.` only. Other subdomains (`shop.`, `app.`) store as-is. Subdomain inheritance walks parents at lookup time.
- **`chrome.storage.local.compareTheme`** is unused legacy from earlier dev — safe to remove from any old installs but no migration shipped.

## Adding a new category

1. Create `src/inject-stub-<name>.js`. Start by copy-pasting the anti-tamper prologue from any existing stub file.
2. Implement the wrap / stub logic. Use `makeFakeNative` / `makeFakeNativeClass` / `fakeNativeMethods` helpers.
3. Add `document.addEventListener("__fpmit_settings", ..., {once:true})` if the category has per-site sub-checks or value overrides.
4. Register in `background.js` `CATEGORY_SCRIPTS` map.
5. Add to `popup.js` `CATEGORIES` array and `CATEGORY_PREFIXES` map.
6. Add the popup row to `popup.html` (use `expand-row` + `expand-content` blocks if it has sub-controls).
7. Add to `scripts/prepare-ext.js` `srcFiles` list.
8. If new globals are referenced (e.g. `NetworkInformation`), add to `eslint.config.js` globals.
9. `npm run lint:all` — must pass with 0 errors. 2 warnings (`UNSAFE_VAR_ASSIGNMENT` from `changes.js`'s sanitised innerHTML) are expected and harmless.

## Security posture

- No external network requests; all data in `chrome.storage.local`.
- No `eval` / `new Function` (ESLint-enforced).
- CSP in manifest: `script-src 'self'; object-src 'self'`.
- All `innerHTML` values in `changes.js` sanitised via `escapeHtml`.
- Anti-tamper spoofing (`Function.prototype.toString`, descriptor probing) prevents trivial wrapper detection — still detectable by extreme fingerprinters via behaviour (e.g. timing of wrapper-vs-native, multi-read canvas comparisons).
