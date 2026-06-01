# Contributing

## Development workflow

1. Create a feature branch from `main`.
2. Keep changes focused and commit logically.
3. Run the smallest relevant checks before pushing.
4. Keep documentation aligned with behavior.

## Checks

Frontend:

```bash
pnpm install
pnpm axa:web:lint
pnpm axa:web:typecheck
pnpm axa:web:build
```

Agent:

```bash
cd pocs/axa-prevention-coach/services/agent
uv sync --group dev
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

Monorepo-wide:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

## Commit style

Use conventional commits where practical:

- `feat(web): ...`
- `feat(agent): ...`
- `docs: ...`
- `ci: ...`
- `chore(security): ...`
