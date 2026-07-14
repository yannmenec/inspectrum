# Brand and evidence assets

The SVG files are the editable sources. PNGs were rasterized at the declared dimensions with Sharp `0.34.5` / libvips `8.17.3`, SVG density 72, explicit resize and PNG compression level 9. No generative image model was used.

| Asset | Dimensions | Purpose and alt text |
|---|---:|---|
| `inspectrum-icon.png` | 512×512 | Icon. Alt: “A magnifying lens crossing cyan, violet and amber spectrum bands on a dark field.” |
| `social-preview.png` | 1280×640 | GitHub social preview. Alt: “Inspectrum wordmark beside a spectrum magnifying lens: Review the plan. Keep the human gate.” |
| `terminal-doctor.png` | 1280×720 | Static evidence fallback. Alt: “Actual Inspectrum 0.2.1 doctor output excerpt showing Node, default config, Codex 0.144.2, plugin 0.2.1 and all checks passed.” |

`terminal-doctor.txt` is the full accessible source transcript. It came from the published npm package in an empty working directory and empty `HOME`, with the public plugin freshly installed and existing Codex authentication referenced separately. The temporary home path was replaced with `$FRESH_HOME`; non-product wrapper/update notices were excluded. The SVG is explicitly an excerpt and omits the session path and optional-reviewer warnings.

Visual inspection was performed at original resolution after rasterization. Sample text/background contrast ratios were 17.74:1 (primary), 13.07:1 (body), 12.84:1 (cyan), 7.47:1 (terminal muted) and 11.44:1 (success), all above WCAG AA text thresholds.

## SHA-256

```text
4134f2fcccf40c1be5d65097ad720058f36d2c7f3adf8aa2f9b59e45953c3a60  inspectrum-icon.svg
8c6e76be28967c9a3603532d55ffff028c823eeac6f0cf41d7176cacba464965  inspectrum-icon.png
26f3350e5a03d112c996507ec6e303455e40bd505d6ba41813e1b80f613f4f76  social-preview.svg
e2d599c8578eb6a7c3f90937939457da3111d9ffdedcd00269584fa2aa9cb44d  social-preview.png
aca0508fc0c18d239f9a0e4ba13bfceac5959832af48a444e6940cc25a9a6be3  terminal-doctor.svg
12897044e2f747547bd201843a0b7d3bdc12166252a98c8353c30a04d68fc237  terminal-doctor.png
aad9ff8defabc905580df3aed56d0514bab28dc33e99d97ff7005a6aa2b63a57  terminal-doctor.txt
```
