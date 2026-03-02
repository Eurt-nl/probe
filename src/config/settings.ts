export interface AppSettings {
  pocketbaseUrl: string;
  ntfyBaseUrl: string;
  ntfyTopicPrefix: string;
  versionFeedPath: string;
}

// Keep all external endpoint configuration in one file so deploys can override it easily.
export const settings: AppSettings = {
  pocketbaseUrl: import.meta.env.VITE_POCKETBASE_URL ?? 'https://pb.9621da15.cloud',
  ntfyBaseUrl: import.meta.env.VITE_NTFY_BASE_URL ?? 'https://ntfy.sh',
  ntfyTopicPrefix: import.meta.env.VITE_NTFY_TOPIC_PREFIX ?? 'probe-game',
  versionFeedPath: import.meta.env.VITE_VERSION_FEED_PATH ?? '/version.json'
};
