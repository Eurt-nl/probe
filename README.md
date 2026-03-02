# Probe PWA (Quasar + Vue + PocketBase)

Probe is a PWA implementation of the classic word game with support for offline play, synced multiplayer state through PocketBase, and preparation for in-app notifications.

## Stack

- Vue 3 + Quasar UI
- Vite + `vite-plugin-pwa`
- PocketBase JS SDK
- Optional ntfy notifications

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Configuration

All relevant endpoint URLs are centralized in:

- `src/config/settings.ts`

Override via env variables:

- `VITE_POCKETBASE_URL`
- `VITE_NTFY_BASE_URL`
- `VITE_NTFY_TOPIC_PREFIX`
- `VITE_VERSION_FEED_PATH`

## Version management in-app

- Current app version is injected from `package.json` and shown in the UI.
- `public/version.json` is fetched to check latest deploy version.
- Update button triggers service worker update (`Update nu`).

## PocketBase schema

- See `docs/pocketbase-schema.md`.

## Notifications

- Ntfy publish helper is implemented in `src/services/ntfy.ts`.
- In-app notifications collection and recommended flow are documented in `docs/notifications.md`.
