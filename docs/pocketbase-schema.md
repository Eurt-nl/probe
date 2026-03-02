# PocketBase Schema for Probe

This schema supports lobby creation, turn flow, score tracking, activity cards, in-app notifications, app version info and server-side guess validation.

## 1) `users` (auth collection)

Use PocketBase default auth users.

Extra fields:

- `display_name` (text, min 2, max 24)
- `avatar` (file, optional)

## 2) `probe_games`

Fields:

- `status` (`lobby` | `active` | `finished`)
- `owner` (relation -> users)
- `turn_player` (relation -> users)
- `max_players` (number, 2..4)
- `rule_mode` (`classic` | `two_player` | `progressive`)
- `seed` (text, optional)
- `ended_at` (date, optional)

Rules:

- List/View: `@request.auth.id != "" && (owner = @request.auth.id || probe_players_via_game.player ?= @request.auth.id)`
- Create: `@request.auth.id != "" && owner = @request.auth.id`
- Update: `@request.auth.id != "" && (owner = @request.auth.id || turn_player = @request.auth.id)`
- Delete: `@request.auth.id != "" && owner = @request.auth.id`

## 3) `probe_players`

Fields:

- `game` (relation -> probe_games)
- `player` (relation -> users)
- `seat_index` (number, 0..3)
- `score` (number)
- `secret_word_hash` (text)
- `secret_length` (number, 1..12)
- `dot_count` (number, 0..5)
- `revealed_mask` (json)
- `is_word_revealed` (bool)
- `misspelled` (bool)

Rules:

- List/View: `@request.auth.id != "" && game.probe_players_via_game.player ?= @request.auth.id`
- Create: `@request.auth.id != "" && player = @request.auth.id`
- Update: `@request.auth.id != "" && (player = @request.auth.id || game.turn_player = @request.auth.id)`
- Delete: `@request.auth.id != "" && game.owner = @request.auth.id && game.status = "lobby"`

## 4) `probe_secret_words`

Stores the plaintext secret for server-side validation.

Fields:

- `game` (relation -> probe_games)
- `player` (relation -> users)
- `secret_word` (hidden text, `^[A-Z.]{1,12}$`)

Rules:

- List/View: `@request.auth.id != "" && game.probe_players_via_game.player ?= @request.auth.id && player = @request.auth.id`
- Create: `@request.auth.id != "" && player = @request.auth.id`
- Update/Delete: `@request.auth.id != "" && player = @request.auth.id && game.status = "lobby"`

## 5) `probe_turns`

Fields:

- `game` (relation -> probe_games)
- `player` (relation -> users)
- `turn_index` (number)
- `activity_card` (relation -> probe_activity_cards, optional)
- `multiplier` (number)
- `status` (`active` | `ended`)

Rules:

- List/View: `@request.auth.id != "" && game.probe_players_via_game.player ?= @request.auth.id`
- Create/Update: `@request.auth.id != "" && game.turn_player = @request.auth.id`

## 6) `probe_guesses`

Fields:

- `game` (relation -> probe_games)
- `turn` (relation -> probe_turns, optional)
- `actor` (relation -> users)
- `target_player` (relation -> users)
- `guess_char` (text, max 1)
- `guess_word` (text, max 12, optional)
- `is_interruptive` (bool)
- `success` (bool)
- `points_delta` (number)
- `reason` (text)

Rules:

- List/View: `@request.auth.id != "" && game.probe_players_via_game.player ?= @request.auth.id`
- Create: `@request.auth.id != "" && actor = @request.auth.id && game.turn_player = @request.auth.id`

## 7) `probe_activity_cards`

Fields:

- `code` (text, unique)
- `label` (text)
- `type` (`NORMAL_TURN`, `ADDITIONAL_TURN`, `LEFT_EXPOSES`, `RIGHT_EXPOSES`, `EXPOSE_OWN_DOT`, `MULTIPLY_FIRST_GUESS`, `ADD_SCORE`, `DEDUCT_SCORE`)
- `value` (number, optional)
- `enabled` (bool)

Rules:

- List/View: `@request.auth.id != ""`
- Create/Update/Delete: admin only

## 8) `in_app_notifications`

Fields:

- `user` (relation -> users)
- `game` (relation -> probe_games, optional)
- `type` (`turn_start`, `game_update`, `system`)
- `title` (text)
- `body` (text)
- `is_read` (bool)
- `sent_ntfy` (bool)
- `ntfy_topic` (text, optional)

Rules:

- List/View: `@request.auth.id = user`
- Create: server/admin only
- Update/Delete: `@request.auth.id = user`

## 9) `app_versions`

Fields:

- `version` (text, unique)
- `build_date` (date)
- `min_supported_version` (text, optional)
- `release_notes` (editor, optional)
- `is_latest` (bool)

Rules:

- List/View: `@request.auth.id != ""`
- Create/Update/Delete: admin only

## Suggested indexes

- `probe_players`: (`game`, `player`) unique, (`game`, `seat_index`) unique
- `probe_secret_words`: (`game`, `player`) unique
- `probe_turns`: (`game`, `turn_index`) unique
- `probe_guesses`: (`game`), (`actor`), (`target_player`)
- `in_app_notifications`: (`user`, `is_read`), (`game`)
