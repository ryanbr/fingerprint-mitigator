// Background service worker — registers per-category content scripts
// and the DNR Sec-CH-UA rule. Each category is independently
// disable-able per-site via chrome.storage.local.siteOverrides:
//
//   siteOverrides: {
//     "example.com": { battery: false, sensors: false }
//     "bank.com":    { clientHints: false }
//   }
//   disabledDomains: { "fully-off.com": true }       — master per-site off
//
// All categories are on globally by default. A category is off for a
// site if (a) the site is in disabledDomains, or (b) the site has a
// false override for that category.

const ALWAYS_EXCLUDE_HOSTS = ["challenges.cloudflare.com"];

// Curated list of sites that almost always break under fingerprint
// masking (Google search uses reCAPTCHA-style checks, the reCAPTCHA
// host itself, hCaptcha). Applied via storage flag `autoDisableEnabled`
// (default true); user can disable the whole list from the popup, or
// override specific entries by adding them back manually if they want.
const AUTO_DISABLED_DOMAINS = [
  // Google search (main + major regional ccTLDs). The
  // hostsToExcludeMatches helper expands each to `*://host/*` +
  // `*://*.host/*`, so accounts.google.com / mail.google.com /
  // www.google.co.uk etc. are all covered.
  "google.com",
  "google.co.uk", "google.de", "google.fr", "google.es", "google.it",
  "google.nl", "google.pl", "google.com.tr", "google.ru",
  "google.com.au", "google.ca", "google.co.jp", "google.co.in",
  "google.co.kr", "google.com.tw", "google.com.hk", "google.com.sg",
  "google.com.br", "google.com.mx", "google.co.za",
  // Captcha providers
  "recaptcha.net",
  "hcaptcha.com",
];

// Combine user master-disable + auto-disable list. Used to decide
// what's excluded at the bridge level and as a baseline for every
// category's per-category exclude list. Auto-disable list only
// applies when chrome.storage.local.autoDisableEnabled !== false
// (default true).
function effectivelyDisabledHosts(stored) {
  const out = new Set();
  const disabled = stored.disabledDomains || {};
  for (const d of Object.keys(disabled)) if (disabled[d]) out.add(d);
  if (stored.autoDisableEnabled !== false) {
    for (const h of AUTO_DISABLED_DOMAINS) out.add(h);
  }
  return [...out];
}

// Detect this browser's actual Chromium major version from the SW's
// navigator.userAgent. Using the real version on the HTTP layer
// keeps Sec-CH-UA consistent with what JS-land navigator.userAgent
// reports — reCAPTCHA / hCaptcha / FingerprintJS all flag the
// mismatch. Falls back to a baseline if the UA string is missing or
// unparseable (e.g. on Firefox where there's no Chrome/X.Y token).
const DETECTED_CHROMIUM_VERSION = (() => {
  try {
    const m = (navigator.userAgent || "").match(/Chrome\/(\d+)/);
    return m && m[1] ? m[1] : "148";
  } catch { return "148"; }
})();

// Default Sec-CH-UA brand string. Auto-tracks the user's actual
// Chromium major. Per-site overrides via siteOverrides.values
// ["clientHints.brand"] still take precedence.
const FAKE_SEC_CH_UA =
  `"Google Chrome";v="${DETECTED_CHROMIUM_VERSION}", "Chromium";v="${DETECTED_CHROMIUM_VERSION}", "Not_A Brand";v="24"`;

// Category id → injected JS file. Each category is its own
// chrome.scripting registration so per-site exclude_matches can
// differ across categories.
const CATEGORY_SCRIPTS = {
  identity:    "src/inject-identity.js",
  privacyHints: "src/inject-stub-privacy-hints.js",
  canvas:      "src/inject-stub-canvas.js",
  audio:       "src/inject-stub-audio.js",
  webgl:       "src/inject-stub-webgl.js",
  battery:     "src/inject-stub-battery.js",
  network:     "src/inject-stub-network.js",
  hwInfo:      "src/inject-stub-hwinfo.js",
  webgpu:      "src/inject-stub-webgpu.js",
  sensors:     "src/inject-stub-sensors.js",
  idleSpeech:  "src/inject-stub-idle-speech.js",
  hardware:    "src/inject-stub-hardware.js",
  privacy:     "src/inject-stub-privacy.js",
  misc:        "src/inject-stub-misc.js",
};

// Compute the list of hostnames for which a given category should be
// skipped (effectively-disabled OR explicit category-off override).
// Takes pre-read storage so a refresh can fetch storage once and
// reuse for every category + the DNR rules.
function excludedHostsForCategory(category, stored) {
  const overrides = stored.siteOverrides || {};
  const out = new Set(effectivelyDisabledHosts(stored));
  for (const d of Object.keys(overrides)) {
    if (overrides[d] && overrides[d][category] === false) out.add(d);
  }
  return [...out];
}

function hostsToExcludeMatches(hosts) {
  const out = ALWAYS_EXCLUDE_HOSTS.map(h => `*://${h}/*`);
  for (const h of hosts) {
    out.push(`*://${h}/*`);
    out.push(`*://*.${h}/*`);
  }
  return out;
}

async function registerInjectScripts(stored) {
  const ids = ["fpmit-bridge", ...Object.keys(CATEGORY_SCRIPTS).map(c => `fpmit-${c}`)];
  try { await chrome.scripting.unregisterContentScripts({ ids }); } catch { /* not yet registered */ }

  const scripts = [];

  // Bridge runs in ISOLATED world and dispatches per-site sub-check /
  // value overrides to the MAIN-world category scripts. Excluded from
  // effectively-disabled sites (user master-disable + auto-disable
  // curated list when enabled).
  scripts.push({
    id: "fpmit-bridge",
    matches: ["<all_urls>"],
    excludeMatches: hostsToExcludeMatches(effectivelyDisabledHosts(stored)),
    js: ["src/bridge.js"],
    runAt: "document_start",
    world: "ISOLATED",
    allFrames: true,
    persistAcrossSessions: true,
  });

  for (const [category, file] of Object.entries(CATEGORY_SCRIPTS)) {
    const hosts = excludedHostsForCategory(category, stored);
    scripts.push({
      id: `fpmit-${category}`,
      matches: ["<all_urls>"],
      excludeMatches: hostsToExcludeMatches(hosts),
      js: [file],
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
      persistAcrossSessions: true,
    });
  }
  await chrome.scripting.registerContentScripts(scripts);
}

// High-entropy Sec-CH-UA-* headers are always removed (leak version /
// arch / brand-identity). The base values for Sec-CH-UA are user-
// configurable via siteOverrides; same for Mobile and Platform.
const HIGH_ENTROPY_REMOVES = [
  { header: "Sec-CH-UA-Full-Version-List", operation: "remove" },
  { header: "Sec-CH-UA-Full-Version", operation: "remove" },
  { header: "Sec-CH-UA-Brand", operation: "remove" },
  { header: "Sec-CH-UA-Arch", operation: "remove" },
  { header: "Sec-CH-UA-Bitness", operation: "remove" },
  { header: "Sec-CH-UA-Model", operation: "remove" },
  { header: "Sec-CH-UA-Platform-Version", operation: "remove" },
  { header: "Sec-CH-UA-WoW64", operation: "remove" },
  { header: "Sec-CH-UA-Form-Factors", operation: "remove" },
];

const DNR_RESOURCE_TYPES = [
  "main_frame", "sub_frame", "script", "stylesheet",
  "xmlhttprequest", "image", "font", "media", "websocket",
  "ping", "csp_report", "other",
];

function buildHeaderActions(brand, mobile, platform, mode, customUA) {
  // mode === "remove" → strip Sec-CH-UA entirely (Firefox / Safari
  // don't send any of these). Otherwise behave as the configurable
  // Chrome-set mode: set the brand list + optional Mobile / Platform.
  // customUA, when present, also rewrites the User-Agent HTTP header
  // so server-side UA sniffing sees the same value JS does. Defeats
  // the document_start race for sites that sniff UA server-side
  // (vivaldi.com serves different HTML based on the UA header).
  let out;
  if (mode === "remove") {
    out = [
      { header: "Sec-CH-UA", operation: "remove" },
      { header: "Sec-CH-UA-Mobile", operation: "remove" },
      { header: "Sec-CH-UA-Platform", operation: "remove" },
      ...HIGH_ENTROPY_REMOVES,
    ];
  } else {
    out = [];
    if (brand) out.push({ header: "Sec-CH-UA", operation: "set", value: brand });
    if (mobile) out.push({ header: "Sec-CH-UA-Mobile", operation: "set", value: mobile });
    if (platform) out.push({ header: "Sec-CH-UA-Platform", operation: "set", value: platform });
    out.push(...HIGH_ENTROPY_REMOVES);
  }
  if (customUA) out.push({ header: "User-Agent", operation: "set", value: customUA });
  return out;
}

async function updateSecChUaRules(stored) {
  const overrides = stored.siteOverrides || {};

  // Sites where the clientHints category is fully off (master OR
  // per-category override OR in the auto-disable list). These get
  // NO rule at all so Sec-CH-UA passes through unmodified.
  const offSet = new Set(effectivelyDisabledHosts(stored));
  for (const s of Object.keys(overrides)) {
    if (overrides[s] && overrides[s].clientHints === false) offSet.add(s);
  }

  // Sites with per-site value overrides (any of brand / mobile /
  // platform / mode / customUA). These get their own rule with
  // priority 2. customUA is only honoured at the HTTP layer when the
  // identity category is on for the site — otherwise JS-land would
  // report the real UA while HTTP-land reports the spoofed one, which
  // is itself a fingerprint.
  const customSites = {};
  for (const site of Object.keys(overrides)) {
    if (offSet.has(site)) continue;
    const v = overrides[site].values;
    if (!v) continue;
    const brand    = v["clientHints.brand"];
    const mobile   = v["clientHints.mobile"];
    const platform = v["clientHints.platform"];
    const mode     = v["clientHints.mode"];
    const identityOn = overrides[site].identity !== false;
    const customUA   = identityOn ? v["identity.customUA"] : null;
    if (brand || mobile || platform || mode === "remove" || customUA) {
      customSites[site] = { brand, mobile, platform, mode, customUA };
    }
  }

  // ── Base rule ─────────────────────────────────────────────────────
  // Applies to everyone except (a) sites in offSet — fully excluded;
  // (b) sites with per-site overrides — handled by their own rule.
  const baseExcluded = [
    ...ALWAYS_EXCLUDE_HOSTS,
    ...offSet,
    ...Object.keys(customSites),
  ];
  const baseCondition = { resourceTypes: DNR_RESOURCE_TYPES };
  if (baseExcluded.length > 0) baseCondition.excludedRequestDomains = baseExcluded;
  const addRules = [
    {
      id: 101,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: buildHeaderActions(FAKE_SEC_CH_UA, null, null),
      },
      condition: baseCondition,
    },
  ];

  // ── Per-site override rules (200+) ────────────────────────────────
  let ruleId = 200;
  for (const [site, v] of Object.entries(customSites)) {
    addRules.push({
      id: ruleId++,
      priority: 2,
      action: {
        type: "modifyHeaders",
        requestHeaders: buildHeaderActions(
          v.brand || FAKE_SEC_CH_UA,
          v.mobile || null,
          v.platform || null,
          v.mode || null,
          v.customUA || null,
        ),
      },
      condition: {
        resourceTypes: DNR_RESOURCE_TYPES,
        requestDomains: [site],
      },
    });
  }

  // Clear all prior dynamic rules and reinstall.
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(r => r.id),
      addRules,
    });
  } catch (e) {
    console.error("[fp-mitigator] DNR update failed:", e);
  }
}

async function refreshAll() {
  // Single storage read shared across both refreshers.
  const stored = await chrome.storage.local.get([
    "disabledDomains", "siteOverrides", "autoDisableEnabled",
  ]);
  registerInjectScripts(stored).catch(() => {});
  updateSecChUaRules(stored).catch(() => {});
}

chrome.runtime.onInstalled.addListener(refreshAll);
chrome.runtime.onStartup.addListener(refreshAll);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.disabledDomains || changes.siteOverrides || changes.autoDisableEnabled) {
    refreshAll();
  }
});
