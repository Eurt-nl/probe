import { settings } from '@/config/settings';

export interface VersionInfo {
  version: string;
  buildDate: string;
  minSupportedVersion?: string;
}

export const appVersion = __APP_VERSION__;

export async function fetchLatestVersion(): Promise<VersionInfo | null> {
  try {
    const response = await fetch(settings.versionFeedPath, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as VersionInfo;
  } catch {
    return null;
  }
}
