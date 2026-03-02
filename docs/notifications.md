# Notification Preparation (in-app + ntfy)

## Flow

1. Game event occurs (turn start, interruptive guess success, game finished).
2. Server logic (PocketBase hook/script) creates rows in `in_app_notifications` for target users.
3. Optional: publish to ntfy topic `probe-game-<gameId>` for push-like behavior.
4. Client subscribes to `in_app_notifications` realtime feed and shows badges/toasts.

## Why this split

- `in_app_notifications` is the source of truth and supports read/unread state.
- ntfy is only transport; messages can be lost without affecting app history.

## PocketBase server hooks (recommended)

- On create in `probe_turns` with `status=active`: notify next player (`turn_start`).
- On create in `probe_guesses` with bonus events: notify all players (`game_update`).
- On update in `probe_games` to `finished`: notify all players with final scores.

## Client work prepared in this repo

- Endpoint config in `src/config/settings.ts`
- ntfy publisher in `src/services/ntfy.ts`
- schema for `in_app_notifications` in `docs/pocketbase-schema.md`
