// Assembles build-tmp/ for web-ext lint with a Firefox-patched manifest.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "build-tmp");

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
manifest.browser_specific_settings = {
  gecko: {
    id: "fingerprint-mitigator@ryanbr",
    strict_min_version: "128.0",
    data_collection_permissions: { required: ["none"] },
  },
};
// AMO validator requires service_worker paired with scripts for the
// Firefox build. Chrome rejects scripts in MV3, but Chrome reads the
// unpatched source manifest, not this one.
if (manifest.background && manifest.background.service_worker) {
  manifest.background = {
    service_worker: manifest.background.service_worker,
    scripts: [manifest.background.service_worker],
  };
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

// Icons
copyDir(path.join(ROOT, "icons"), path.join(OUT, "icons"));

// Source files
const srcFiles = [
  "bridge.js",
  "inject-identity.js",
  "inject-stub-privacy-hints.js",
  "inject-stub-canvas.js",
  "inject-stub-audio.js",
  "inject-stub-webgl.js",
  "inject-stub-battery.js",
  "inject-stub-network.js",
  "inject-stub-hwinfo.js",
  "inject-stub-webgpu.js",
  "inject-stub-sensors.js",
  "inject-stub-idle-speech.js",
  "inject-stub-hardware.js",
  "inject-stub-privacy.js",
  "inject-stub-misc.js",
  "background.js", "popup.html", "popup.js",
  "changes.html", "changes.js",
];
for (const f of srcFiles) {
  copy(path.join(ROOT, "src", f), path.join(OUT, "src", f));
}

console.log("Assembled extension at " + OUT);
