import { cacheDir, settings } from './bridge';
import type { Settings } from './setDefaultSettings';

export const evictCacheIfNeeded = async (
  dirPath: string,
  limitKey: 'songCacheSizeLimit' | 'imageCacheSizeLimit'
): Promise<void> => {
  const limitBytes = Number(settings.get(limitKey as keyof Settings));
  if (!limitBytes || limitBytes <= 0) return;
  await cacheDir.evictIfNeeded(dirPath, limitBytes);
};
