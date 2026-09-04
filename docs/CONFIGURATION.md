# Configuration reference

VisualContract reads `visual-contract.yml` or `visual-contract.yaml` from the working directory unless `--config` is provided.

## Top-level fields

- `version`: currently `1`.
- `project`: human-readable project name shown in reports.
- `viewports`: unique named `{ name, width, height, deviceScaleFactor? }` entries.
- `navigation`: `waitUntil`, `timeoutMs`, and a deterministic `stabilizeMs` delay.
- `rules`: deterministic checks and protected image regions.
- `output`: paths, failure threshold, and finding limit.
- `browser.channel`: optional Playwright channel such as `chrome` or `msedge`.
- `ai`: optional advisory review settings.

## Rule behavior

### Overflow

Checks both document scroll width and rendered elements extending outside the viewport. Add intentional carousels or off-canvas elements to `ignore` with CSS selectors.

### Contrast

Checks elements with direct text nodes against composited solid ancestor backgrounds. `minimumRatio` defaults to 4.5 and `largeTextRatio` to 3. See the README limitations before treating this result as accessibility conformance.

### Touch targets

Checks links, buttons, form controls, link/button roles, and focusable elements. The default minimum is 24×24 CSS pixels.

### Alignment

Each group resolves the configured selectors and compares `left`, `right`, `top`, `bottom`, `centerX`, or `centerY`. A missing selector produces a warning because a silently skipped contract is unsafe.

### Spacing

Each group needs at least three selectors. It compares consecutive horizontal or vertical gaps and reports when the largest gap difference exceeds `tolerance`.

### Protected regions

Each region captures the first visible match. `--update-baselines` accepts current images. Normal checks compare the current PNG with the accepted PNG through `pixelmatch`; dimension changes count as a complete difference.

## AI settings

```yaml
ai:
  enabled: false
  model: gpt-5.6-terra
  detail: high
  maxViewports: 2
```

The feature requires `OPENAI_API_KEY`. `OPENAI_MODEL` overrides the configured model. The request uses structured JSON output and `store: false`. Model findings are advisory and excluded from the exit-code calculation.
