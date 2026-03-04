export interface AppSettings {
  pocketbaseUrl: string;
  realtimeEnabled: boolean;
  ntfyBaseUrl: string;
  ntfyTopicPrefix: string;
  versionFeedPath: string;
}

// Keep all external endpoint configuration in one file so deploys can override it easily.
export const settings: AppSettings = {
  pocketbaseUrl: import.meta.env.VITE_POCKETBASE_URL ?? 'https://pb.pitch-putt.live',
  realtimeEnabled: (import.meta.env.VITE_REALTIME_ENABLED ?? 'true').toLowerCase() === 'true',
  ntfyBaseUrl: import.meta.env.VITE_NTFY_BASE_URL ?? 'https://ntfy.sh',
  ntfyTopicPrefix: import.meta.env.VITE_NTFY_TOPIC_PREFIX ?? 'probe-game',
  versionFeedPath: import.meta.env.VITE_VERSION_FEED_PATH ?? '/version.json'
};
