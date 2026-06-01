# Contributing

## Development workflow

1. Create a feature branch from `main`.
2. Keep changes focused and commit logically.
3. Run the smallest relevant checks before pushing.
4. Keep documentation aligned with behavior.

## Checks

Frontend:

```bash
cd apps/web
npm ci
npm run lint
npm run typecheck
npm run build
```

Agent:

```bash
cd services/agent
uv sync --group dev
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

## Commit style

Use conventional commits where practical:

- `feat(web): ...`
- `feat(agent): ...`
- `docs: ...`
- `ci: ...`
- `chore(security): ...`

