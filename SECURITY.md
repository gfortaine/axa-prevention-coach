# Security Policy

## Supported scope

This is an interview-grade prototype, not a production AXA service. Security
reports are still welcome for issues in this repository.

## Reporting a vulnerability

Open a private security advisory or contact the repository owner directly.
Please do not create a public issue containing secrets, exploit payloads, or
personal data.

## Secret handling

- Runtime secrets belong in Vercel, LangSmith/LangGraph, or GitHub Actions
  secrets.
- Never commit `.env`, `.vercel`, `.langgraph_api`, API keys, service-account
  files, certificates, or private keys.
- CI is intentionally designed to run without live LLM, TTS or LangGraph cloud
  secrets.

## Data handling

The application is designed around minimization: user prompts are sent only to
server-side routes, and external provider calls are isolated behind a BFF-style
API. The demo corpus is public or synthetic.

