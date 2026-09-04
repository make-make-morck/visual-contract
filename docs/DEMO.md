# One-minute demo

This demo provides a reproducible positive and negative result without an API key.

## Terminal 1 — start the fixture

```bash
pnpm demo:serve
```

## Terminal 2 — prove the contract

```bash
pnpm demo:check
```

Expected headline:

```text
VisualContract PASS — VisualContract demo
errors 0 · warnings 0 · info 0 · advisory 0
```

Now check the intentionally broken version:

```bash
pnpm dev check http://127.0.0.1:4173/fail.html --config examples/demo/visual-contract.yml --format terminal
```

Expected behavior:

- Exits with code 1.
- Reports horizontal overflow at both viewports.
- Reports low text contrast and undersized interactive targets.
- Reports the shifted card heading and uneven navigation gaps.

Open `visual-contract-results/report.md` to inspect the pull-request-friendly report, or `report.json` for automation.
