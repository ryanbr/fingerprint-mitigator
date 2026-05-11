// Settings management page — lists every site with non-default
// configuration (master-disabled, per-category off, sub-check off, or
// any value override). Lets the user remove individual sites or wipe
// the entire configuration.

document.getElementById("footer").textContent =
  "Fingerprint Mitigator v" + chrome.runtime.getManifest().version;

// Follow the popup's theme. Both pages read chrome.storage.local.theme.
chrome.storage.local.get(["theme"], (s) => {
  if (s.theme === "light") document.body.classList.add("light");
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.theme) {
    document.body.classList.toggle("light", changes.theme.newValue === "light");
  }
});

const $sites = document.getElementById("sites");
const $empty = document.getElementById("empty-state");
const $stat = document.getElementById("stat");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function fmtValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (v === null) return "null";
  return JSON.stringify(v);
}

function render() {
  chrome.storage.local.get(["disabledDomains", "siteOverrides"], (s) => {
    const disabled = s.disabledDomains || {};
    const overrides = s.siteOverrides || {};

    // Collect every site mentioned in either map.
    const sites = new Set();
    for (const k of Object.keys(disabled)) if (disabled[k]) sites.add(k);
    for (const k of Object.keys(overrides)) sites.add(k);
    const sorted = [...sites].sort();

    $stat.textContent = `${sorted.length} site${sorted.length === 1 ? "" : "s"} configured`;
    $empty.style.display = sorted.length === 0 ? "" : "none";
    $sites.innerHTML = "";

    for (const site of sorted) {
      const ov = overrides[site] || {};
      const wholeOff = !!disabled[site];

      let html = `<div class="site-card">
        <div class="site-header">
          <span class="site-domain">${escapeHtml(site)}</span>
          ${wholeOff ? '<span class="site-disabled-badge">Masking off</span>' : ""}
          <span class="site-actions">
            <button data-reset-site="${escapeHtml(site)}">Reset site</button>
          </span>
        </div>
        <div class="overrides">`;

      // Whole-category disables (top-level keys whose value is === false)
      for (const [k, v] of Object.entries(ov)) {
        if (k === "subChecks" || k === "values") continue;
        if (v === false) {
          html += `<div class="override">
            <span class="tag disabled">cat off</span>
            <span class="key">${escapeHtml(k)}</span>
          </div>`;
        }
      }

      // Sub-check opt-outs
      if (ov.subChecks) {
        for (const [k, v] of Object.entries(ov.subChecks)) {
          if (v === false) {
            html += `<div class="override">
              <span class="tag subcheck">subcheck</span>
              <span class="key">${escapeHtml(k)}</span>
            </div>`;
          }
        }
      }

      // Value overrides
      if (ov.values) {
        for (const [k, v] of Object.entries(ov.values)) {
          html += `<div class="override">
            <span class="tag value">value</span>
            <span class="key">${escapeHtml(k)}</span>
            = <span class="value">${escapeHtml(fmtValue(v))}</span>
          </div>`;
        }
      }

      if (wholeOff && Object.keys(ov).length === 0) {
        html += `<div class="override" style="color:var(--text-faint)">
          (whole-site masking off; no per-feature overrides)
        </div>`;
      }

      html += `</div></div>`;
      $sites.insertAdjacentHTML("beforeend", html);
    }

    // Wire reset buttons
    $sites.querySelectorAll("[data-reset-site]").forEach(btn => {
      btn.addEventListener("click", () => {
        const site = btn.dataset.resetSite;
        const updates = {};
        if (disabled[site]) {
          delete disabled[site];
          updates.disabledDomains = disabled;
        }
        if (overrides[site]) {
          delete overrides[site];
          updates.siteOverrides = overrides;
        }
        chrome.storage.local.set(updates);
        // render() will re-run via the storage.onChanged listener.
      });
    });
  });
}

document.getElementById("reset-all").addEventListener("click", () => {
  if (!confirm("Reset configuration for every site? Defaults will apply to all sites until you customise them again.")) return;
  chrome.storage.local.set({ disabledDomains: {}, siteOverrides: {} });
});

document.getElementById("export").addEventListener("click", () => {
  chrome.storage.local.get(["disabledDomains", "siteOverrides"], (s) => {
    const payload = {
      exportedAt: new Date().toISOString(),
      disabledDomains: s.disabledDomains || {},
      siteOverrides: s.siteOverrides || {},
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fp-mitigator-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  });
});

// Live update on any storage change.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.disabledDomains || changes.siteOverrides) render();
});

render();
