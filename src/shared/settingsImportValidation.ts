export function shouldImportSetting(
  key: string,
  value: unknown,
  currentStore: Record<string, unknown>,
  denyList: ReadonlySet<string>
): boolean {
  if (denyList.has(key) || key === 'themesDefault') return false;
  const storedDefault = currentStore[key];
  if (storedDefault === undefined || typeof value !== typeof storedDefault) return false;
  return true;
}

export function validateImportedSettings(
  parsed: unknown,
  currentStore: Record<string, unknown>,
  denyList: ReadonlySet<string>
): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) return null;
  const result: Record<string, unknown> = {};
  Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
    if (shouldImportSetting(key, value, currentStore, denyList)) {
      result[key] = value;
    }
  });
  return result;
}
