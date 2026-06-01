# Client AI POCs Monorepo

[![CI](https://github.com/gfortaine/prevention-coach-rag/actions/workflows/ci.yml/badge.svg)](https://github.com/gfortaine/prevention-coach-rag/actions/workflows/ci.yml)

Production-grade POCs and MVPs for interviews, contracts and new client
opportunities. The repository is organized as a polyglot Turborepo: pnpm/Turbo
orchestrates tasks, while each project keeps its own language-specific tooling.

## Repository layout

```text
pocs/
  axa-prevention-coach/
    apps/web/        Next.js web app and BFF
    services/agent/  Python LangGraph Agent Server project
    docs/            POC-specific docs and ADRs
docs/                Monorepo-level guidance
.github/workflows/   CI and optional deployment workflows
```

## Current POCs

| POC | Description | Docs |
| --- | --- | --- |
| `pocs/axa-prevention-coach` | Interview MVP for an agentic prevention coach with RAG, voice and AXA-like UI. | [README](pocs/axa-prevention-coach/README.md) |

## Commands

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

POC-specific shortcuts:

```bash
pnpm axa:web:dev
pnpm axa:agent:dev
```

## Monorepo conventions

- `pocs/<name>/apps/*` contains user-facing deployables.
- `pocs/<name>/services/*` contains backend/runtime deployables such as
  agents, APIs and workers.
- `pocs/<name>/packages/*` is reserved for shared libraries if a POC needs
  them.
- Python services remain uv-managed and expose tiny `package.json` wrappers so
  Turbo can orchestrate lint/typecheck/test tasks.
- Root docs stay generic; client- or opportunity-specific material belongs in
  the POC folder.

See [docs/monorepo.md](docs/monorepo.md) for the full structure guide.
