# Brand and evidence assets

The SVG files are the editable sources. The icon and social preview were
rasterized with Sharp `0.34.5` / libvips `8.17.3`. The terminal proof was
rasterized at 1280x720 with headless Chrome `150.0.7871.187`. No generative
image model was used.

| Asset | Dimensions | Purpose and alt text |
|---|---:|---|
| `inspectrum-icon.png` | 512×512 | Icon. Alt: “A magnifying lens crossing cyan, violet and amber spectrum bands on a dark field.” |
| `social-preview.png` | 1280×640 | GitHub social preview. Alt: “Inspectrum wordmark beside a spectrum magnifying lens: Review the plan. Keep the human gate.” |
| `terminal-doctor.png` | 1280×720 | Public evidence. Alt: “Actual Inspectrum 0.2.3 run: doctor passed with optional-reviewer warnings in 3.17 seconds, then Codex rejected an unsafe migration plan in 50.80 seconds.” |

`terminal-doctor.txt` is the accessible source transcript. It came from the
published 0.2.3 npm package in an empty working directory with a fresh npm
cache. Existing Node, reviewer CLIs, logins, user config, and public plugin
installs were reused. Home paths were normalized to `$USER_HOME`; npm update
notices were excluded. Failures, warnings, timings, and measurement limits were
preserved; the first report is an excerpt. The SVG is explicitly an excerpt.

Visual inspection was performed at original resolution after rasterization. Sample text/background contrast ratios were 17.74:1 (primary), 13.07:1 (body), 12.84:1 (cyan), 7.47:1 (terminal muted) and 11.44:1 (success), all above WCAG AA text thresholds.

## SHA-256

```text
4134f2fcccf40c1be5d65097ad720058f36d2c7f3adf8aa2f9b59e45953c3a60  inspectrum-icon.svg
8c6e76be28967c9a3603532d55ffff028c823eeac6f0cf41d7176cacba464965  inspectrum-icon.png
26f3350e5a03d112c996507ec6e303455e40bd505d6ba41813e1b80f613f4f76  social-preview.svg
e2d599c8578eb6a7c3f90937939457da3111d9ffdedcd00269584fa2aa9cb44d  social-preview.png
6f8eeadb66bd09eeca2953f607c8a44e8d2e7ec53f762e1926add8f632dc27ee  terminal-doctor.svg
111eda8d04e68429ece2bae00de6d2daf111ac948ebe88c80d3e412de4c19e4f  terminal-doctor.png
7db8b3eace689520eb10510b80810e4fa804a2c67e369d24027d19634c8059ed  terminal-doctor.txt
```
