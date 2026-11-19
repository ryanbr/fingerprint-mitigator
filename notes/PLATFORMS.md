# Navigator platform reference

`navigator.platform` (also `window.navigator.platform`) is a legacy, normally read-only browser-reported string, not reliable evidence of the actual OS or CPU.

Source: the supplied [Stack Overflow](https://stackoverflow.com/questions/19877924/what-is-the-list-of-possible-values-for-navigator-platform-as-of-today), attributed to Robbert (November 9, 2013, with later additions). This is a historical compilation, not a verified modern compatibility matrix; no original URL was supplied.

## Preset values

| Preset family | Target OS | `navigator.platform` | Client Hints platform |
| --- | --- | --- | --- |
| Chrome, Vivaldi, Edge | Windows | `Win32` | `Windows` |
| Chrome, Vivaldi | macOS | `MacIntel` | `macOS` |
| Chrome, Vivaldi | Linux | `Linux x86_64` | `Linux` |
| Chrome | Android | `Linux armv8l` | `Android` |
| Firefox | Windows | `Win32` | Removed |
| Firefox, Safari | macOS | `MacIntel` | Removed |

These are preset choices, not universal browser behavior. `Win32` is common on 64-bit Windows; `MacIntel` covers Intel and Apple Silicon Macs. Android may report Linux-style values, and modern iPads need not report `iPad`.

`navigator.platform` is independent of `navigator.userAgentData.platform` and HTTP `Sec-CH-UA-Platform`. For example, legacy `Win32` maps to Client Hints `Windows`; HTTP string values are quoted on the wire, unlike JavaScript values. A matching platform alone does not ensure a consistent or undetectable fingerprint.

## Override

In the popup, expand **Identity masking**, enable **Override navigator.platform**, and enter or select a **Platform** value. Blank preserves the native value; disabling the toggle ignores any configured value.

- Storage: `values["identity.platform"]`; opt-out: `subChecks["identity.platform"] = false`. Site inheritance, reset, logs, and export apply. Presets set the value without clearing an explicit opt-out.
- Only nonempty strings are supported. Typing `null`, `true`, or `false` returns literal text. Historical empty-string (Firefox OS/KaiOS) and rare Android `null` reports cannot be forced.
- The `Navigator.prototype` getter wrapper preserves native descriptor flags, receiver validation, and read-only assignment behavior; protected or missing descriptors are skipped.
- Settings arrive asynchronously after `document_start`, so early reads may see the original value. Only injected page frames are covered, not workers or disabled/excluded sites.

## Historical suggestions

All 58 popup suggestions follow. Preserve capitalization, spaces, and punctuation exactly; these values do not guarantee current behavior.

| Group | Values |
| --- | --- |
| Android / Linux | `Android`, `Linux`, `Linux aarch64`, `Linux armv5tejl`, `Linux armv6l`, `Linux armv7l`, `Linux armv8l`, `Linux i686`, `Linux i686 on x86_64`, `Linux i686 X11`, `Linux MSM8960_v3.2.1.1_N_R069_Rev:18`, `Linux ppc64`, `Linux x86_64`, `Linux x86_64 X11` |
| Apple | `iPhone`, `iPod`, `iPad`, `iPhone Simulator`, `iPod Simulator`, `iPad Simulator`, `Macintosh`, `MacIntel`, `MacPPC`, `Mac68K`, `Pike v7.6 release 92`, `Pike v7.8 release 517` |
| Windows / legacy | `OS/2`, `Pocket PC`, `Windows`, `Win16`, `Win32`, `WinCE` |
| BSD / Solaris | `FreeBSD`, `FreeBSD i386`, `FreeBSD amd64`, `OpenBSD amd64`, `SunOS`, `SunOS i86pc`, `SunOS sun4u` |
| Other mobile | `BlackBerry`, `Nokia_Series_40`, `S60`, `Symbian`, `Symbian OS`, `PalmOS`, `webOS` |
| Consoles | `New Nintendo 3DS`, `Nintendo DSi`, `Nintendo 3DS`, `Nintendo Wii`, `Nintendo WiiU`, `PLAYSTATION 3`, `PlayStation 4`, `PSP` |
| Other | `HP-UX`, `masking-agent`, `WebTV OS`, `X11` |

Reference context: the long `Linux MSM8960...` value came from a Sony Xperia V; the `Pike` values came from Opera Mini 5/7 on iPhone. ARM suffixes describe features (T: Thumb, E: DSP, J: Jazelle), not OS versions. `masking-agent` refers to the historical Masking Agent Firefox extension.

## Implementation

- [inject-identity.js](../src/inject-identity.js): getter wrapper and settings.
- [popup.html](../src/popup.html) / [popup.js](../src/popup.js): controls, suggestions, persistence, and presets.
- [bridge.js](../src/bridge.js): inherited settings lookup and delivery.
