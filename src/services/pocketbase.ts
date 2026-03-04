import PocketBase from 'pocketbase';
import { settings } from '@/config/settings';

export const pb = new PocketBase(settings.pocketbaseUrl);

// Persist auth for reconnects; this allows resumable sessions in PWA mode.
pb.authStore.onChange(() => {
  // Hook available for analytics or audit logging if needed.
});

export const collections = {
  users: 'probe_users',
  games: 'probe_games',
  players: 'probe_players',
  secretWords: 'probe_secret_words',
  turns: 'probe_turns',
  guesses: 'probe_guesses',
  chatMessages: 'probe_chat_messages',
  lobbyChatMessages: 'probe_lobby_chat_messages',
  lobbyPresence: 'probe_lobby_presence',
  activityDeck: 'probe_activity_cards',
  appVersions: 'probe_app_versions',
  notifications: 'probe_in_app_notifications'
} as const;
