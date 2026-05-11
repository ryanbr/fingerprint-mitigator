# Fingerprint Mitigator

A Chrome/Firefox MV3 extension that makes Chromium variants (Brave, Vivaldi, Opera, Yandex, Whale, etc.) appear as vanilla Chrome to JavaScript-based fingerprinting checks.

## What it does

At `document_start` in the MAIN world it:

- Hides `navigator.brave` (walks the prototype chain for Brave's multi-level definition)
- Filters `navigator.userAgentData.brands` so only Chrome / Chromium / Not.A/Brand remain
- Filters `navigator.userAgentData.getHighEntropyValues()` returned `brands` + `fullVersionList`
- Filters `navigator.userAgentData.toJSON()` output
- Hides `window.opr`, `window.opera`, `window.vivaldi`, `window.yandex`, `window.__firefox__`, etc.
- Strips identity tokens from `navigator.userAgent` if present (rare on Chromium)

All hooks are invisible to `Function.prototype.toString` and descriptor-shape anti-tamper probes — sites checking for spoofing see native source.

## What it does **not** do

- Does **not** touch HTTP-layer headers (`Sec-CH-UA`, etc.). For full masking you also need browser config or a `declarativeNetRequest` rule (out of scope for v1).
- Does **not** add canvas / audio / WebGL / font noise.
- Does **not** spoof timezone, language, or screen.

## Per-site disable

Click the toggle in the popup to disable masking on the current site (e.g. if a bank or Cloudflare-protected site flags the spoof). Setting persists across browser restarts.

## Cloudflare Turnstile

Turnstile iframes (`challenges.cloudflare.com`) are always excluded — Turnstile detects MAIN-world wrappers and loops the challenge.

## Architecture

```
manifest.json — MV3, dynamic content scripts (no static content_scripts)
src/background.js — registers inject.js via chrome.scripting on install / startup
src/inject.js — MAIN-world hooks, runs document_start
src/popup.html / popup.js — per-site toggle UI
```

## Building

No bundler — `inject.js` is plain JS.

```bash
npm install
npm run lint        # ESLint
npm run lint:ext    # web-ext lint with Firefox-patched manifest
```

Load unpacked in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select this folder.
