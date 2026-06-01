# Web app

Next.js 16 / React 19 application for the Prevention Coach RAG demo.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Routes

- `/` - assistant UI
- `/api/chat` - web BFF contract
- `/coach_bot` - AXA-like BFF compatibility route
- `/api/tts/stream` - Mistral Voxtral TTS streaming
- `/guide/[domain]` - guide/PDF source viewer

## Design system

The app imports AXA France Canopée `prospect` tokens and components. Chat
surfaces are custom to preserve the public assistant interaction model.

