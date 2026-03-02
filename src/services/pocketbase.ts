import PocketBase from 'pocketbase';
import { settings } from '@/config/settings';

export const pb = new PocketBase(settings.pocketbaseUrl);

// Persist auth for reconnects; this allows resumable sessions in PWA mode.
pb.authStore.onChange(() => {
  // Hook available for analytics or audit logging if needed.
});

export const collections = {
  users: 'users',
  games: 'probe_games',
  players: 'probe_players',
  secretWords: 'probe_secret_words',
  turns: 'probe_turns',
  guesses: 'probe_guesses',
  activityDeck: 'probe_activity_cards',
  appVersions: 'app_versions',
  notifications: 'in_app_notifications'
} as const;
