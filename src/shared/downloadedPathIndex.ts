// Module-level singleton: songId -> downloaded file path (ADR Section 8).
// Mirrors useLibraryCache.ts's songMap precedent -- a fast, synchronous,
// in-memory lookup for the manifest's full path per song, kept separate from
// the lightweight downloadedSongsSlice (which only mirrors the id set, for
// Redux/cross-window reactivity -- see Lesson #9). Zero imports of its own
// (mirrors connectivityEvents.ts's minimal-pub-sub precedent), so it's safe
// to import from anywhere -- including the playback hot path in Player.tsx/
// MpvPlayer.tsx -- with no transitive-dependency risk at all.
let pathById = new Map<string, string>();

export const setDownloadedPathIndex = (entries: Record<string, string>): void => {
  pathById = new Map(Object.entries(entries));
};

export const setDownloadedPathEntry = (songId: string, path: string): void => {
  pathById.set(songId, path);
};

export const removeDownloadedPathEntries = (songIds: string[]): void => {
  songIds.forEach((id) => pathById.delete(id));
};

export const getDownloadedPath = (songId: string): string | undefined => pathById.get(songId);
