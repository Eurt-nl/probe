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
- Direct import JSON (zonder `users`): `pocketbase/collections.import.json`

### PocketBase import

1. Open PocketBase Admin UI.
2. Go to `Settings` -> `Import collections`.
3. Upload `pocketbase/collections.import.json`.
4. Keep `users` as-is (this import only creates the non-user collections).
5. If you imported an older version earlier, re-import this file so `probe_secret_words` is added.
6. If lobby/join fails with `Cannot be blank` on numeric/bool fields, run:

```bash
PB_URL=https://pb.9621da15.cloud \
PB_ADMIN_EMAIL=you@example.com \
PB_ADMIN_PASSWORD=your_password \
npm run fix:pb-required
```

7. If you see `missing or invalid collection context`, run:

```bash
PB_URL=https://pb.9621da15.cloud \
PB_ADMIN_EMAIL=you@example.com \
PB_ADMIN_PASSWORD=your_password \
npm run fix:pb-rules
```

## Notifications

- Ntfy publish helper is implemented in `src/services/ntfy.ts`.
- In-app notifications collection and recommended flow are documented in `docs/notifications.md`.

## Seed activity cards

`probe_activity_cards` can be seeded with:

```bash
PB_URL=https://pb.9621da15.cloud \
PB_ADMIN_EMAIL=you@example.com \
PB_ADMIN_PASSWORD=your_password \
npm run seed:cards
```

Seed source file:

- `pocketbase/activity-cards.seed.json`

## Realtime remote mode

- Home page now supports PocketBase login/register.
- Create a remote lobby with your own join-code (for example `1234`).
- Join accepts either PocketBase `record id` or your join-code.
- Game page in `mode=remote` subscribes realtime to:
  - `probe_games`
  - `probe_players`
  - `probe_guesses`
- Guesses are submitted as pending events and validated server-side by the referee worker.

## Server-side referee worker

Run this process on a server/VPS/container so remote games are validated automatically:

```bash
PB_URL=https://pb.9621da15.cloud \
PB_ADMIN_EMAIL=you@example.com \
PB_ADMIN_PASSWORD=your_password \
npm run referee:remote
```

What it does:

- validates each incoming guess against `probe_secret_words`
- updates score and revealed mask in `probe_players`
- handles dot penalty and turn advance on misses
- marks game as finished when all words are revealed
- writes in-app notifications for key events
