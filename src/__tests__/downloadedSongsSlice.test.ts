import downloadedSongsReducer, {
  setDownloadedSongIds,
  addDownloadedSongId,
  removeDownloadedSongIds,
  isSongDownloaded,
  selectDownloadedSongIdSet,
} from '../redux/downloadedSongsSlice';

describe('download index (Fix 1)', () => {
  it('adds a songId on successful download', () => {
    let state = downloadedSongsReducer(undefined, setDownloadedSongIds(['existing1']));
    state = downloadedSongsReducer(state, addDownloadedSongId('freshlyDownloaded'));
    expect(state.songIds).toEqual(['existing1', 'freshlyDownloaded']);
  });

  it('does not add a duplicate id if it is already present', () => {
    let state = downloadedSongsReducer(undefined, setDownloadedSongIds(['existing1']));
    state = downloadedSongsReducer(state, addDownloadedSongId('existing1'));
    expect(state.songIds).toEqual(['existing1']);
  });

  it('removes a songId on explicit deletion', () => {
    let state = downloadedSongsReducer(undefined, setDownloadedSongIds(['a', 'b', 'c']));
    state = downloadedSongsReducer(state, removeDownloadedSongIds(['b']));
    expect(state.songIds).toEqual(['a', 'c']);
  });

  it('removes a songId when the resilience check finds the file missing (Fix 6)', () => {
    // Fix 6's resilience self-correction dispatches the same removal action --
    // no separate reducer path exists for "explicit" vs. "self-corrected"
    // removals, matching Phase 3's cache-eviction precedent.
    let state = downloadedSongsReducer(undefined, setDownloadedSongIds(['present', 'missing']));
    state = downloadedSongsReducer(state, removeDownloadedSongIds(['missing']));
    expect(state.songIds).toEqual(['present']);
  });

  it('removeDownloadedSongIds is a no-op for an empty array', () => {
    const initial = downloadedSongsReducer(undefined, setDownloadedSongIds(['a']));
    const state = downloadedSongsReducer(initial, removeDownloadedSongIds([]));
    expect(state).toBe(initial);
  });

  it('isSongDownloaded is a synchronous, in-memory lookup (no IPC per call)', () => {
    const set = new Set(['abc123']);
    expect(isSongDownloaded('abc123', set)).toBe(true);
    expect(isSongDownloaded('nonexistent', set)).toBe(false);
  });

  it('selectDownloadedSongIdSet builds a Set usable for O(1) lookups', () => {
    const state = {
      downloadedSongs: downloadedSongsReducer(undefined, setDownloadedSongIds(['a', 'b'])),
    };
    const set = selectDownloadedSongIdSet(state);
    expect(set).toBeInstanceOf(Set);
    expect(set.has('a')).toBe(true);
    expect(set.has('z')).toBe(false);
  });
});
