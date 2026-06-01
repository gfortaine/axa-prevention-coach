# Monorepo guide

This repository hosts client AI POCs and MVPs. Each POC should be self-contained
so interview, contract and new-contract work can evolve without turning the
repository root into a single-client project.

## Structure

```text
pocs/<poc-name>/
  apps/       Frontend or user-facing deployables
  services/   Backend services, agents, workers and APIs
  packages/   Optional shared libraries
  docs/       POC-specific architecture, deployment and ADRs
```

## Turborepo and polyglot services

Turborepo orchestrates tasks across workspace projects. It does not own every
language toolchain:

- JavaScript/TypeScript apps use pnpm dependencies and package scripts.
- Python services use `uv`, `pyproject.toml` and `uv.lock`.
- Python services expose a small private `package.json` only so Turbo can run
  `lint`, `format:check`, `typecheck`, `test` and `dev` consistently.

This keeps the repository queryable and cacheable from the root while preserving
the right ecosystem tooling inside each service.

## Adding a POC

1. Create `pocs/<client-or-opportunity>/`.
2. Add apps under `apps/` and runtime services under `services/`.
3. Add a POC README and POC-specific docs.
4. Register any app/service package in the pnpm workspace through the existing
   `pocs/*/apps/*` and `pocs/*/services/*` globs.
5. Keep root docs generic.
