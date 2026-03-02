# PocketBase Schema for Probe

This schema supports lobby creation, turn flow, score tracking, activity cards, in-app notifications and app version info.

## 1) `users` (auth collection)

Use PocketBase default auth users.

Extra fields:

- `display_name` (text, required, min 2, max 24)
- `avatar` (file, optional)

Rules:

- List rule: `@request.auth.id != ""`
- View rule: `@request.auth.id != ""`
- Create rule: `true` (signup enabled) or admin only
- Update rule: `@request.auth.id = id`
- Delete rule: `@request.auth.id = id`

## 2) `probe_games`

Fields:

- `status` (select: `lobby`, `active`, `finished`; required)
- `owner` (relation -> users, required, maxSelect=1)
- `turn_player` (relation -> users, maxSelect=1)
- `max_players` (number, required, min 2, max 4, default 4)
- `rule_mode` (select: `classic`, `two_player`, `progressive`; required)
- `seed` (text, optional) for deterministic deck shuffle
- `ended_at` (date, optional)

Rules:

- List/View: `@request.auth.id != "" && (owner = @request.auth.id || probe_players_via_game.player ?= @request.auth.id)`
- Create: `@request.auth.id != "" && owner = @request.auth.id`
- Update: `@request.auth.id != "" && (owner = @request.auth.id || turn_player = @request.auth.id)`
- Delete: `@request.auth.id != "" && owner = @request.auth.id`

## 3) `probe_players`

One row per player in a game.

Fields:

- `game` (relation -> probe_games, required, maxSelect=1)
- `player` (relation -> users, required, maxSelect=1)
- `seat_index` (number, required, min 0, max 3)
- `score` (number, required, default 0)
- `secret_word_hash` (text, required) hash instead of plaintext
- `secret_length` (number, required, min 1, max 12)
- `dot_count` (number, required, min 0, max 5)
- `revealed_mask` (json, required) e.g. `[false, true, ...]`
- `is_word_revealed` (bool, required, default false)
- `misspelled` (bool, required, default false)

Rules:

- List/View: `@request.auth.id != "" && game.probe_players_via_game.player ?= @request.auth.id`
- Create: `@request.auth.id != "" && player = @request.auth.id`
- Update: `@request.auth.id != "" && game.turn_player = @request.auth.id`
- Delete: `@request.auth.id != "" && game.owner = @request.auth.id && game.status = "lobby"`

## 4) `probe_turns`

Track each turn and active card.

Fields:

- `game` (relation -> probe_games, required)
- `player` (relation -> users, required)
- `turn_index` (number, required)
- `activity_card` (relation -> probe_activity_cards, optional)
- `multiplier` (number, required, default 1)
- `status` (select: `active`, `ended`, required)

Rules:

- List/View: `@request.auth.id != "" && game.probe_players_via_game.player ?= @request.auth.id`
- Create/Update: `@request.auth.id != "" && game.turn_player = @request.auth.id`
- Delete: admin only

## 5) `probe_guesses`

Audit log for every guess or interruptive guess.

Fields:

- `game` (relation -> probe_games, required)
- `turn` (relation -> probe_turns, optional)
- `actor` (relation -> users, required)
- `target_player` (relation -> users, required)
- `guess_char` (text, optional, max 1)
- `guess_word` (text, optional, max 12)
- `is_interruptive` (bool, required, default false)
- `success` (bool, required)
- `points_delta` (number, required)
- `reason` (text, optional)

Rules:

- List/View: `@request.auth.id != "" && game.probe_players_via_game.player ?= @request.auth.id`
- Create: `@request.auth.id != "" && actor = @request.auth.id && game.turn_player = @request.auth.id`
- Update/Delete: admin only

## 6) `probe_activity_cards`

Card master data.

Fields:

- `code` (text, unique, required)
- `label` (text, required)
- `type` (select; required):
  - `NORMAL_TURN`
  - `ADDITIONAL_TURN`
  - `LEFT_EXPOSES`
  - `RIGHT_EXPOSES`
  - `EXPOSE_OWN_DOT`
  - `MULTIPLY_FIRST_GUESS`
  - `ADD_SCORE`
  - `DEDUCT_SCORE`
- `value` (number, optional)
- `enabled` (bool, required, default true)

Rules:

- List/View: `@request.auth.id != ""`
- Create/Update/Delete: admin only

## 7) `in_app_notifications`

In-app inbox and push fanout status.

Fields:

- `user` (relation -> users, required)
- `game` (relation -> probe_games, optional)
- `type` (select: `turn_start`, `game_update`, `system`, required)
- `title` (text, required)
- `body` (text, required)
- `is_read` (bool, required, default false)
- `sent_via_ntfy` (bool, required, default false)
- `ntfy_topic` (text, optional)

Rules:

- List/View: `@request.auth.id = user`
- Create: server/admin only
- Update: `@request.auth.id = user`
- Delete: `@request.auth.id = user`

## 8) `app_versions`

Current published app versions.

Fields:

- `version` (text, unique, required)
- `build_date` (date, required)
- `min_supported_version` (text, optional)
- `release_notes` (editor, optional)
- `is_latest` (bool, required)

Rules:

- List/View: `@request.auth.id != ""`
- Create/Update/Delete: admin only

## Suggested indexes

- `probe_players`: unique composite on (`game`, `player`)
- `probe_turns`: unique composite on (`game`, `turn_index`)
- `probe_guesses`: indexes on (`game`, `created`), (`actor`, `created`)
- `in_app_notifications`: indexes on (`user`, `is_read`, `created`)
