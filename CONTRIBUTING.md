# Contributing

Thanks for helping turn design intent into reliable, explainable checks.

## Development setup

1. Install Node.js 20+ and pnpm.
2. Run `pnpm install`.
3. Run `pnpm exec playwright install chromium`.
4. Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
5. Start the fixtures with `pnpm demo:serve` and exercise both demo pages.

## Pull requests

- Open an issue before large behavior or schema changes.
- Add focused tests for bug fixes and rules.
- Keep deterministic checks independent of network services and API keys.
- Update English and Chinese documentation when user-facing behavior changes.
- Do not commit secrets, generated report folders, or machine-specific baselines.
- Keep AI findings advisory; deterministic pass/fail must remain reproducible.

Small pull requests are easier to review. Maintainers may ask for a fixture that demonstrates both a pass and a failure.

## Good first contributions

Documentation corrections, framework recipes, reduced false-positive fixtures, new reporters, and reproducible browser edge cases are especially useful.
