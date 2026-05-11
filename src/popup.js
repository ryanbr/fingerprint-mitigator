// Popup controller — master site toggle + 3 per-category toggles.
// Settings model:
//   disabledDomains: { "site.com": true }      — master per-site off
//   siteOverrides:   { "site.com": { identity: false, ... } }
//
// Default for any category on any site = on. Setting to off only when
// the user explicitly toggles it off (stored as false in overrides).

document.getElementById("footer").textContent =
  "Fingerprint Mitigator v" + chrome.runtime.getManifest().version;

// ── Theme ─────────────────────────────────────────────────────────────
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  const dark = document.getElementById("theme-icon-dark");
  const light = document.getElementById("theme-icon-light");
  if (dark) dark.style.display = isLight ? "none" : "";
  if (light) light.style.display = isLight ? "" : "none";
}
document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
});
chrome.storage.local.get(["theme"], (s) => {
  if (s.theme === "light") applyTheme("light");
});

// ── State ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  "identity",
  "privacyHints",
  "clientHints",
  "canvas",
  "audio",
  "webgl",
  "battery",
  "network",
  "hwInfo",
  "webgpu",
  "sensors",
  "idleSpeech",
  "hardware",
  "privacy",
  "misc",
];

// Storage-key prefixes that belong to each category. Used to decide
// whether a category row should show the "modified" visual indicator.
// Most categories own their own prefix; identity bundles its own
// settings plus the uaData high-entropy values, and privacy bundles
// topics + sharedStorage value sub-trees.
const CATEGORY_PREFIXES = {
  identity:     ["identity.", "uaData."],
  privacyHints: ["privacyHints."],
  clientHints:  ["clientHints."],
  canvas:       ["canvas."],
  audio:        ["audio."],
  webgl:        ["webgl."],
  battery:      ["battery."],
  network:      ["network."],
  hwInfo:       ["hwInfo."],
  webgpu:       ["webgpu."],
  sensors:      [],
  idleSpeech:   [],
  hardware:     ["hardware."],
  privacy:      ["privacy.", "topics.", "sharedStorage."],
  misc:         ["misc."],
};
let currentDomain = "";
let activeTabId = null;
let disabledDomains = {};
let siteOverrides = {};

const $url = document.getElementById("site-url");
const $masterToggle = document.getElementById("site-toggle");

function normalizeDomain(host) {
  return (host || "").replace(/^www\./, "");
}
function isToggleableUrl(url) {
  return /^https?:\/\//i.test(url || "");
}
// Walk parent domains for inheritance: a config on example.com flows
// down to shop.example.com (matches bridge.js + background.js exclude
// pattern semantics).
function findParentKey(map, host) {
  if (!map || !host) return null;
  if (map[host]) return host;
  const parts = host.split(".");
  while (parts.length > 1) {
    parts.shift();
    const parent = parts.join(".");
    if (map[parent]) return parent;
  }
  return null;
}

function isMasked() {
  const key = normalizeDomain(currentDomain);
  if (!key) return false;
  // Off if exact key OR any parent domain is in disabledDomains
  return !findParentKey(disabledDomains, key);
}
function getCategoryEnabled(category) {
  const key = normalizeDomain(currentDomain);
  if (!key) return true;
  // Exact override wins. Otherwise check any parent domain.
  const matchKey = findParentKey(siteOverrides, key);
  if (!matchKey) return true;
  return siteOverrides[matchKey][category] !== false;
}

// Returns true if the current site (or any ancestor it inherits from)
// has any non-default setting whose key belongs to the given category.
function isCategoryModified(category) {
  const key = normalizeDomain(currentDomain);
  if (!key) return false;
  const matchKey = findParentKey(siteOverrides, key);
  if (!matchKey) return false;
  const ov = siteOverrides[matchKey];
  // Whole-category disable
  if (ov[category] === false) return true;
  const prefixes = CATEGORY_PREFIXES[category] || [];
  if (prefixes.length === 0) return false;
  const matchesPrefix = (k) => prefixes.some(p => k.startsWith(p));
  if (ov.subChecks) {
    for (const k of Object.keys(ov.subChecks)) {
      if (ov.subChecks[k] === false && matchesPrefix(k)) return true;
    }
  }
  if (ov.values) {
    for (const k of Object.keys(ov.values)) {
      if (matchesPrefix(k)) return true;
    }
  }
  return false;
}

// Cache every selector applyToggleStates needs at module load. The
// function runs ~5× during init (theme/storage/tab-query callbacks plus
// every per-site change), so re-querying the DOM each time is wasteful.
const $masterLabel = document.getElementById("master-btn-label");
const $masterDesc    = document.getElementById("master-btn-desc");
const $catToggles = {};   // category → toggle element
const $catRows    = {};   // category → row element
for (const cat of CATEGORIES) {
  const el = document.getElementById("cat-" + cat);
  if (el) {
    $catToggles[cat] = el;
    $catRows[cat]    = el.closest(".toggle-row");
  }
}
const $subCheckEls = Array.from(document.querySelectorAll("[data-subcheck-key]"));
const $valueEls    = Array.from(document.querySelectorAll("[data-value-key]"));
const $resetBtn    = document.getElementById("reset-site");

function applyToggleStates() {
  const masked = isMasked();
  // Button toggles between green "Disable on this site" (currently
  // active) and red "Enable on this site" (currently off).
  $masterToggle.classList.toggle("is-off", !masked);
  $masterToggle.setAttribute("aria-pressed", String(!masked));
  if ($masterLabel) $masterLabel.textContent = masked
    ? "Disable on this site"
    : "Enable on this site";
  if ($masterDesc) $masterDesc.textContent = masked
    ? "Masking is currently active. Click to turn off for this site."
    : "Masking is currently off on this site. Click to re-enable.";
  document.body.classList.toggle("master-off", !masked);

  for (const cat of CATEGORIES) {
    const el = $catToggles[cat];
    if (!el) continue;
    const on = getCategoryEnabled(cat);
    el.classList.toggle("on", on);
    el.setAttribute("aria-checked", String(on));
    const row = $catRows[cat];
    if (row) row.classList.toggle("modified", isCategoryModified(cat));
  }

  // Sub-check toggles
  for (const el of $subCheckEls) {
    const on = getSubCheckEnabled(el.dataset.subcheckKey);
    el.classList.toggle("on", on);
    el.setAttribute("aria-checked", String(on));
  }

  // Value inputs
  for (const el of $valueEls) {
    const key = el.dataset.valueKey;
    const def = el.dataset.defaultValue !== undefined
      ? el.dataset.defaultValue
      : (el.tagName === "SELECT" ? el.querySelector("option[selected]")?.value : el.defaultValue);
    el.value = String(getValueOverride(key, def));
  }

  // Reset button — disabled when nothing to reset
  if ($resetBtn) {
    const k = normalizeDomain(currentDomain);
    const hasAny = !!k && (!!disabledDomains[k] || !!siteOverrides[k]);
    $resetBtn.disabled = !hasAny;
  }

  // Re-render the log only if it's the visible tab. Otherwise the
  // tab-switch handler will render it on demand.
  const logActive = document.getElementById("tab-log")?.classList.contains("active");
  if (logActive) renderLog();
}

function setMasterToggle(masked) {
  const key = normalizeDomain(currentDomain);
  if (!key) return;
  if (masked) delete disabledDomains[key];
  else disabledDomains[key] = true;
  chrome.storage.local.set({ disabledDomains });
  applyToggleStates();
  if (activeTabId) chrome.tabs.reload(activeTabId);
}

function setCategoryToggle(category, on) {
  const key = normalizeDomain(currentDomain);
  if (!key) return;
  if (!siteOverrides[key]) siteOverrides[key] = {};
  if (on) {
    delete siteOverrides[key][category];
    if (Object.keys(siteOverrides[key]).length === 0) delete siteOverrides[key];
  } else {
    siteOverrides[key][category] = false;
  }
  chrome.storage.local.set({ siteOverrides });
  applyToggleStates();
  if (activeTabId) chrome.tabs.reload(activeTabId);
}

// ── Sub-check toggle / value config ───────────────────────────────────
// Sub-checks live under siteOverrides[domain].subChecks["category.name"].
// Values live under   siteOverrides[domain].values["category.name"].
// Defaults are "on" / "default value" — only explicit user opt-outs are
// stored (sparse).
function getSubCheckEnabled(subKey) {
  const key = normalizeDomain(currentDomain);
  if (!key) return true;
  const matchKey = findParentKey(siteOverrides, key);
  if (!matchKey) return true;
  const ov = siteOverrides[matchKey];
  return !ov.subChecks || ov.subChecks[subKey] !== false;
}
function setSubCheck(subKey, on) {
  const key = normalizeDomain(currentDomain);
  if (!key) return;
  if (!siteOverrides[key]) siteOverrides[key] = {};
  if (!siteOverrides[key].subChecks) siteOverrides[key].subChecks = {};
  if (on) {
    delete siteOverrides[key].subChecks[subKey];
    if (Object.keys(siteOverrides[key].subChecks).length === 0) delete siteOverrides[key].subChecks;
    if (Object.keys(siteOverrides[key]).length === 0) delete siteOverrides[key];
  } else {
    siteOverrides[key].subChecks[subKey] = false;
  }
  chrome.storage.local.set({ siteOverrides });
  applyToggleStates();
  if (activeTabId) chrome.tabs.reload(activeTabId);
}
function getValueOverride(valueKey, defaultValue) {
  const key = normalizeDomain(currentDomain);
  if (!key) return defaultValue;
  const matchKey = findParentKey(siteOverrides, key);
  if (!matchKey) return defaultValue;
  const ov = siteOverrides[matchKey];
  if (!ov.values || ov.values[valueKey] === undefined) return defaultValue;
  return ov.values[valueKey];
}
function setValueOverride(valueKey, value, defaultValue) {
  const key = normalizeDomain(currentDomain);
  if (!key) return;
  if (!siteOverrides[key]) siteOverrides[key] = {};
  if (!siteOverrides[key].values) siteOverrides[key].values = {};
  // Re-equal-to-default → drop the entry (keep storage sparse)
  if (value === defaultValue || (typeof value === "string" && String(defaultValue) === value)) {
    delete siteOverrides[key].values[valueKey];
    if (Object.keys(siteOverrides[key].values).length === 0) delete siteOverrides[key].values;
    if (Object.keys(siteOverrides[key]).length === 0) delete siteOverrides[key];
  } else {
    siteOverrides[key].values[valueKey] = value;
  }
  chrome.storage.local.set({ siteOverrides });
  if (activeTabId) chrome.tabs.reload(activeTabId);
}

// ── Wire toggles ──────────────────────────────────────────────────────
$masterToggle.addEventListener("click", () => setMasterToggle(!isMasked()));
$masterToggle.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    setMasterToggle(!isMasked());
  }
});

for (const cat of CATEGORIES) {
  const el = document.getElementById("cat-" + cat);
  if (!el) continue;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    setCategoryToggle(cat, !getCategoryEnabled(cat));
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setCategoryToggle(cat, !getCategoryEnabled(cat));
    }
  });
}

// Expand / collapse for category rows that have sub-options
document.querySelectorAll(".expand-row").forEach(row => {
  row.addEventListener("click", () => row.classList.toggle("open"));
});

// Sub-check toggles
document.querySelectorAll("[data-subcheck-key]").forEach(el => {
  const handler = () => {
    const key = el.dataset.subcheckKey;
    setSubCheck(key, !getSubCheckEnabled(key));
  };
  el.addEventListener("click", (e) => { e.stopPropagation(); handler(); });
  el.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); handler(); }
  });
});

// Value inputs (select / number). Each input declares its valueKey in
// data-value-key; the page-default is the input's initial value.
document.querySelectorAll("[data-value-key]").forEach(el => {
  const key = el.dataset.valueKey;
  const def = el.tagName === "SELECT"
    ? el.querySelector("option[selected]")?.value
    : el.defaultValue;
  el.dataset.defaultValue = def;
  el.addEventListener("change", () => {
    let v = el.value;
    // Coerce numeric / boolean / null strings back to native types
    if (el.type === "number") v = Number(v);
    else if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (v === "null") v = null;
    const typedDefault = el.type === "number" ? Number(def) :
                         def === "true" ? true :
                         def === "false" ? false :
                         def === "null" ? null : def;
    setValueOverride(key, v, typedDefault);
  });
  // Stop click from bubbling to .expand-row
  el.addEventListener("click", (e) => e.stopPropagation());
});

// ── External storage changes (e.g. another popup) ─────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.disabledDomains) disabledDomains = changes.disabledDomains.newValue || {};
  if (changes.siteOverrides) siteOverrides = changes.siteOverrides.newValue || {};
  if (changes.disabledDomains || changes.siteOverrides) applyToggleStates();
});

// ── Init ──────────────────────────────────────────────────────────────
chrome.storage.local.get(["disabledDomains", "siteOverrides"], (s) => {
  disabledDomains = s.disabledDomains || {};
  siteOverrides = s.siteOverrides || {};
  applyToggleStates();
});

// ── Tabs + Log panel ──────────────────────────────────────────────────
// "Settings" tab (the main config UI) and "Log" tab (a console-style
// dump of every setting's current value + source). The log refreshes
// automatically when state changes or the user switches to the tab.
const $logOutput = document.getElementById("log-output");

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === null) return "null";
  return String(v);
}

function pad(str, n) {
  str = String(str);
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

// Generate the log content from the current popup state. Reads from
// the same closure data the rest of the popup uses (siteOverrides,
// disabledDomains, currentDomain) plus the DOM-attribute caches
// ($subCheckEls, $valueEls).
function renderLog() {
  if (!$logOutput) return;
  const key = normalizeDomain(currentDomain);
  const lines = [];

  lines.push(`Current site: ${escHtml(currentDomain || "(none)")}`);
  const inheritedFrom = key ? findParentKey(siteOverrides, key) : null;
  if (inheritedFrom && inheritedFrom !== key) {
    lines.push(`<span class="src">Inheriting overrides from: ${escHtml(inheritedFrom)}</span>`);
  }
  lines.push("");

  // ── Master ──
  lines.push(`<span class="group">master</span>`);
  const masterOn = isMasked();
  const masterParent = key ? findParentKey(disabledDomains, key) : null;
  const masterSrc = masterParent ? (masterParent === key ? "this site" : "inherited:" + masterParent) : "default";
  lines.push(
    `  ${pad("mask", 24)} ` +
    `<span class="${masterOn ? "on" : "off"}">${masterOn ? "ON " : "OFF"}</span> ` +
    `<span class="src">[${escHtml(masterSrc)}]</span>`
  );
  lines.push("");

  // ── Per-category breakdown ──
  for (const cat of CATEGORIES) {
    const prefixes = CATEGORY_PREFIXES[cat] || [];
    const subKeys = $subCheckEls
      .map(el => el.dataset.subcheckKey)
      .filter(k => prefixes.some(p => k.startsWith(p)));
    const valEls = $valueEls.filter(el => prefixes.some(p => el.dataset.valueKey.startsWith(p)));

    lines.push(`<span class="group">${escHtml(cat)}</span>`);

    // Category enable/disable
    const catOn = getCategoryEnabled(cat);
    const matchKey = key ? findParentKey(siteOverrides, key) : null;
    const catOverridden = !!matchKey && siteOverrides[matchKey][cat] === false;
    const catSrc = catOverridden
      ? (matchKey === key ? "this site" : "inherited:" + matchKey)
      : "default";
    lines.push(
      `  ${pad(cat, 24)} ` +
      `<span class="${catOn ? "on" : "off"}">${catOn ? "ON " : "OFF"}</span> ` +
      `<span class="src">[${escHtml(catSrc)}]</span>`
    );

    // Sub-checks
    for (const sk of subKeys) {
      const on = getSubCheckEnabled(sk);
      const ov = matchKey ? siteOverrides[matchKey].subChecks : null;
      const isOverride = ov && ov[sk] === false;
      const src = isOverride
        ? (matchKey === key ? "this site" : "inherited:" + matchKey)
        : "default";
      lines.push(
        `    ${pad(sk, 22)} ` +
        `<span class="${on ? "on" : "off"}">${on ? "ON " : "OFF"}</span> ` +
        `<span class="src">[${escHtml(src)}]</span>`
      );
    }

    // Values
    for (const el of valEls) {
      const vk = el.dataset.valueKey;
      const def = el.dataset.defaultValue !== undefined
        ? el.dataset.defaultValue
        : (el.tagName === "SELECT" ? el.querySelector("option[selected]")?.value : el.defaultValue);
      const cur = getValueOverride(vk, def);
      const isOverride = String(cur) !== String(def);
      const ovValues = matchKey ? siteOverrides[matchKey].values : null;
      const explicitOverride = ovValues && ovValues[vk] !== undefined;
      const src = explicitOverride
        ? (matchKey === key ? "this site" : "inherited:" + matchKey)
        : "default";
      lines.push(
        `    ${pad(vk, 22)} = ` +
        `<span class="${isOverride ? "override" : ""}">${escHtml(fmtValue(cur))}</span> ` +
        `<span class="src">[${escHtml(src)}]</span>`
      );
    }

    lines.push("");
  }

  $logOutput.innerHTML = lines.join("\n");
}

document.querySelectorAll(".tab").forEach(el => {
  el.addEventListener("click", () => {
    const target = el.dataset.tab;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === el));
    document.querySelectorAll(".tab-panel").forEach(p => {
      p.classList.toggle("active", p.id === "tab-" + target);
    });
    if (target === "log") renderLog();
  });
});

// ── Browser presets ───────────────────────────────────────────────────
// Each preset is a flat map of (storage value-key → value). When the
// user picks one from the popup dropdown, the popup writes every entry
// into siteOverrides[site].values for the current site, then reloads
// the tab. Firefox / Safari presets set clientHints.mode="remove" so
// the DNR rule strips Sec-CH-UA entirely, and identity.uaDataMode=
// "remove" so navigator.userAgentData is deleted.
const PRESETS = {
  // ── Chrome ──
  "chrome-148-win": {
    "identity.customUA": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "identity.uaDataMode": "normal",
    "clientHints.mode": "set",
    "clientHints.brand": '"Google Chrome";v="148", "Chromium";v="148", "Not_A Brand";v="24"',
    "clientHints.mobile": "?0",
    "clientHints.platform": '"Windows"',
    "uaData.platformVersion": "15.0.0",
    "uaData.architecture": "x86",
    "uaData.bitness": "64",
    "uaData.uaFullVersion": "148.0.0.0",
    "uaData.wow64": false,
    "uaData.formFactor": "Desktop",
    "webgl.vendor": "Google Inc. (Intel)",
    "webgl.renderer": "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "webgpu.canvasFormat": "bgra8unorm",
  },
  "chrome-148-mac": {
    "identity.customUA": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "identity.uaDataMode": "normal",
    "clientHints.mode": "set",
    "clientHints.brand": '"Google Chrome";v="148", "Chromium";v="148", "Not_A Brand";v="24"',
    "clientHints.mobile": "?0",
    "clientHints.platform": '"macOS"',
    "uaData.platformVersion": "14.7.0",
    "uaData.architecture": "arm",
    "uaData.bitness": "64",
    "uaData.uaFullVersion": "148.0.0.0",
    "uaData.wow64": false,
    "uaData.formFactor": "Desktop",
    "webgl.vendor": "Google Inc. (Apple)",
    "webgl.renderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)",
    "webgpu.canvasFormat": "rgba8unorm",
  },
  "chrome-148-linux": {
    "identity.customUA": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "identity.uaDataMode": "normal",
    "clientHints.mode": "set",
    "clientHints.brand": '"Google Chrome";v="148", "Chromium";v="148", "Not_A Brand";v="24"',
    "clientHints.mobile": "?0",
    "clientHints.platform": '"Linux"',
    "uaData.platformVersion": "6.10.0",
    "uaData.architecture": "x86",
    "uaData.bitness": "64",
    "uaData.uaFullVersion": "148.0.0.0",
    "uaData.wow64": false,
    "uaData.formFactor": "Desktop",
    "webgl.vendor": "Google Inc. (Intel)",
    "webgl.renderer": "ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)",
    "webgpu.canvasFormat": "bgra8unorm",
  },
  "chrome-148-android": {
    "identity.customUA": "Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
    "identity.uaDataMode": "normal",
    "clientHints.mode": "set",
    "clientHints.brand": '"Google Chrome";v="148", "Chromium";v="148", "Not_A Brand";v="24"',
    "clientHints.mobile": "?1",
    "clientHints.platform": '"Android"',
    "uaData.platformVersion": "14.0.0",
    "uaData.architecture": "arm",
    "uaData.bitness": "64",
    "uaData.model": "Pixel 9",
    "uaData.uaFullVersion": "148.0.0.0",
    "uaData.wow64": false,
    "uaData.formFactor": "Mobile",
    "webgl.vendor": "Google Inc. (Qualcomm)",
    "webgl.renderer": "ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)",
    "webgpu.canvasFormat": "bgra8unorm",
  },
  // ── Edge ──
  "edge-148-win": {
    "identity.customUA": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
    "identity.uaDataMode": "normal",
    "clientHints.mode": "set",
    "clientHints.brand": '"Microsoft Edge";v="148", "Chromium";v="148", "Not_A Brand";v="24"',
    "clientHints.mobile": "?0",
    "clientHints.platform": '"Windows"',
    "uaData.platformVersion": "15.0.0",
    "uaData.architecture": "x86",
    "uaData.bitness": "64",
    "uaData.uaFullVersion": "148.0.0.0",
    "uaData.wow64": false,
    "uaData.formFactor": "Desktop",
    "webgl.vendor": "Google Inc. (Intel)",
    "webgl.renderer": "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "webgpu.canvasFormat": "bgra8unorm",
  },
  // ── Firefox (no Sec-CH-UA; no userAgentData) ──
  "firefox-142-win": {
    "identity.customUA": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
    "identity.uaDataMode": "remove",
    "clientHints.mode": "remove",
    "webgl.vendor": "Mozilla",
    "webgl.renderer": "Mozilla",
  },
  "firefox-142-mac": {
    "identity.customUA": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:142.0) Gecko/20100101 Firefox/142.0",
    "identity.uaDataMode": "remove",
    "clientHints.mode": "remove",
    "webgl.vendor": "Mozilla",
    "webgl.renderer": "Mozilla",
  },
  // ── Safari (no Sec-CH-UA; no userAgentData) ──
  "safari-17-mac": {
    "identity.customUA": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "identity.uaDataMode": "remove",
    "clientHints.mode": "remove",
    "webgl.vendor": "Apple Inc.",
    "webgl.renderer": "Apple GPU",
  },
};

const $presetSelector = document.getElementById("preset-selector");
$presetSelector?.addEventListener("change", () => {
  const presetId = $presetSelector.value;
  if (!presetId || !PRESETS[presetId]) return;
  const key = normalizeDomain(currentDomain);
  if (!key) {
    $presetSelector.value = "";
    return;
  }
  if (!siteOverrides[key]) siteOverrides[key] = {};
  if (!siteOverrides[key].values) siteOverrides[key].values = {};
  for (const [k, v] of Object.entries(PRESETS[presetId])) {
    siteOverrides[key].values[k] = v;
  }
  chrome.storage.local.set({ siteOverrides });
  applyToggleStates();
  if (activeTabId) chrome.tabs.reload(activeTabId);
  // Reset the selector to its placeholder so re-picking the same
  // preset re-applies it (useful after manual tweaks).
  $presetSelector.value = "";
});

// ── Reset / manage buttons ────────────────────────────────────────────
document.getElementById("reset-site")?.addEventListener("click", () => {
  const key = normalizeDomain(currentDomain);
  if (!key) return;
  delete disabledDomains[key];
  delete siteOverrides[key];
  chrome.storage.local.set({ disabledDomains, siteOverrides });
  applyToggleStates();
  if (activeTabId) chrome.tabs.reload(activeTabId);
});
document.getElementById("manage-all")?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/changes.html") });
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab) return;
  activeTabId = tab.id;
  const url = tab.url || "";
  try { currentDomain = new URL(url).hostname; } catch { currentDomain = ""; }

  if (!isToggleableUrl(url)) {
    $url.textContent = "(masking not available on this page)";
    document.querySelectorAll(".toggle-row").forEach(r => r.style.display = "none");
    return;
  }
  $url.textContent = currentDomain || "(unknown)";
  applyToggleStates();
});
