# VisualContract

Visual rules written by designers, enforced in every pull request.

VisualContract is an MIT-licensed TypeScript CLI and GitHub Action that checks responsive web interfaces for horizontal overflow, text contrast, undersized touch targets, alignment drift, inconsistent spacing, and changes to protected regions. The deterministic engine runs locally and does not require a paid API.

> Status: **v0.1.0 MVP.** The public API and YAML schema may evolve before v1.0. Real-world adopters and feedback are welcome.

## Why this is different

Screenshot tests answer “did pixels change?” VisualContract lets a team state *which visual relationships matter*: three headings must share a top edge, navigation gaps must be equal, a header may change by no more than 1%, and every mobile control must be usable. Reports explain the broken rule instead of presenting only a diff image.

## Quick start

Requirements: Node.js 20 or newer.

```bash
npm install --save-dev visual-contract
npx playwright install chromium
npx visual-contract init
npx visual-contract check http://127.0.0.1:3000
```

To try this repository:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm demo:serve
```

In another terminal:

```bash
pnpm demo:check
pnpm dev check http://127.0.0.1:4173/fail.html --config examples/demo/visual-contract.yml
```

`pass.html` is expected to pass. `fail.html` deliberately contains overflow, contrast, touch-target, alignment, and spacing problems and is expected to exit with code 1.

See the copy-paste [`one-minute demo`](docs/DEMO.md) for the exact expected result.

## Configuration

`visual-contract init` creates a commented `visual-contract.yml`. A compact example:

```yaml
version: 1
project: My web app

viewports:
  - { name: mobile, width: 390, height: 844 }
  - { name: desktop, width: 1440, height: 900 }

rules:
  overflow: { enabled: true, tolerance: 1, ignore: [] }
  contrast: { enabled: true, minimumRatio: 4.5, largeTextRatio: 3, ignore: [] }
  touchTargets: { enabled: true, minimumSize: 24, ignore: [] }
  alignment:
    - name: pricing card headings
      selectors: [".plan:nth-of-type(1) h2", ".plan:nth-of-type(2) h2"]
      edge: top
      tolerance: 2
      severity: error
  spacing:
    - name: main navigation
      selectors: ["nav a:nth-of-type(1)", "nav a:nth-of-type(2)", "nav a:nth-of-type(3)"]
      axis: horizontal
      tolerance: 2
      severity: warning
  protectedRegions:
    - name: checkout summary
      selector: "[data-contract='checkout-summary']"
      maxDiffRatio: 0.01
      severity: error

output:
  directory: visual-contract-results
  baselineDirectory: .visual-contract/baselines
  failOn: error
  maxFindingsPerRule: 50
```

Navigation, browser, and optional AI settings are documented in [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md).

## Protected regions

Create or deliberately replace accepted baselines:

```bash
npx visual-contract check http://127.0.0.1:3000 --update-baselines
```

Review the files in `.visual-contract/baselines` before committing them. Later checks save current captures and pixel diffs in `visual-contract-results/artifacts`.

## GitHub Action

The bundled action uses Chrome installed on GitHub-hosted runners. Pin to a released tag in a real repository:

```yaml
- name: Check visual contract
  uses: make-make-morck/visual-contract@v0.1.0
  with:
    url: http://127.0.0.1:3000
    config: visual-contract.yml

- name: Upload report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: visual-contract-report
    path: visual-contract-results
```

The action writes a job summary, emits annotations, exposes counts as outputs, and fails according to `fail-on`.

## Optional AI review

The optional review sends accepted/current full-page screenshots to the OpenAI Responses API and asks for structured, advisory feedback. It is disabled by default, requires `OPENAI_API_KEY`, and never changes the deterministic pass/fail result.

```bash
OPENAI_API_KEY=... npx visual-contract check http://127.0.0.1:3000 --ai-review
```

The default model is `gpt-5.6-terra` and may be overridden with `OPENAI_MODEL`. Review the privacy implications before enabling it in CI; see [`PRIVACY.md`](PRIVACY.md).

## Reports and exit codes

- `0`: deterministic checks passed at the configured threshold.
- `1`: the page was checked and violations crossed the threshold.
- `2`: configuration or browser setup failed before a trustworthy result could be produced.

Use `--format terminal|markdown|json|all`, `--fail-on error|warning|never`, and `--output-dir <path>`. JSON uses schema version `1.0`.

## Scope and limitations

- The contrast rule handles ordinary rendered text and composited solid backgrounds; gradients, images, blend modes, pseudo-element text, and canvas content need human or accessibility-tool review.
- Touch-target checks measure rendered boxes, not surrounding invisible hit areas.
- Pixel baselines are sensitive to operating system, browser version, dynamic data, and font rendering. Capture and compare them in a stable CI environment.
- Cross-origin iframes and closed shadow roots are outside the deterministic DOM scan.
- This project complements accessibility testing; it is not a WCAG conformance certificate.

## Contributing and security

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), the public [`ROADMAP.md`](ROADMAP.md), and good-first issues. Report vulnerabilities according to [`SECURITY.md`](SECURITY.md), not in a public issue.

## License

MIT © VisualContract contributors.
