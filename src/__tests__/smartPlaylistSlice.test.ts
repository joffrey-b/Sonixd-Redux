import smartPlaylistReducer, {
  addSmartPlaylist,
  updateSmartPlaylist,
  deleteSmartPlaylist,
  setLibrarySyncedAt,
} from '../redux/smartPlaylistSlice';
import type { SmartPlaylist } from '../types';

const makePlaylist = (overrides: Partial<SmartPlaylist> = {}): SmartPlaylist => ({
  id: 'test-id-1',
  name: 'Test Playlist',
  rules: [],
  sort: 'random',
  sortDirection: 'asc',
  limit: 25,
  ...overrides,
});

const getInitialState = () => smartPlaylistReducer(undefined, { type: '@@INIT' });

describe('smartPlaylistSlice reducers', () => {
  it('initial state has empty playlists array', () => {
    const state = getInitialState();
    // In test env, bridge.settings.get returns undefined, so defaults to []
    expect(Array.isArray(state.playlists)).toBe(true);
  });

  it('addSmartPlaylist appends a new playlist with generated id', () => {
    const state = smartPlaylistReducer(
      getInitialState(),
      addSmartPlaylist({
        name: 'New Playlist',
        rules: [],
        sort: 'random',
        sortDirection: 'asc',
        limit: 25,
      })
    );
    expect(state.playlists).toHaveLength(1);
    expect(state.playlists[0].name).toBe('New Playlist');
    expect(typeof state.playlists[0].id).toBe('string');
    expect(state.playlists[0].id.length).toBeGreaterThan(0);
  });

  it('addSmartPlaylist does NOT call settings.set() inside the reducer', () => {
    const mockSet = jest.fn();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.set = mockSet;

    smartPlaylistReducer(
      getInitialState(),
      addSmartPlaylist({ name: 'Test', rules: [], sort: 'random', sortDirection: 'asc', limit: 25 })
    );

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('updateSmartPlaylist replaces by id without affecting others', () => {
    let state = smartPlaylistReducer(
      getInitialState(),
      addSmartPlaylist({
        name: 'First',
        rules: [],
        sort: 'random',
        sortDirection: 'asc',
        limit: 25,
      })
    );
    const firstId = state.playlists[0].id;

    state = smartPlaylistReducer(
      state,
      addSmartPlaylist({
        name: 'Second',
        rules: [],
        sort: 'random',
        sortDirection: 'asc',
        limit: 25,
      })
    );

    const updated = makePlaylist({ id: firstId, name: 'Updated First' });
    state = smartPlaylistReducer(state, updateSmartPlaylist(updated));

    expect(state.playlists[0].name).toBe('Updated First');
    expect(state.playlists[1].name).toBe('Second');
  });

  it('updateSmartPlaylist is a no-op when id does not exist', () => {
    const initial = getInitialState();
    const state = smartPlaylistReducer(
      initial,
      updateSmartPlaylist(makePlaylist({ id: 'nonexistent', name: 'Ghost' }))
    );
    expect(state.playlists).toHaveLength(0);
  });

  it('deleteSmartPlaylist removes by id', () => {
    let state = smartPlaylistReducer(
      getInitialState(),
      addSmartPlaylist({ name: 'Keep', rules: [], sort: 'random', sortDirection: 'asc', limit: 25 })
    );
    state = smartPlaylistReducer(
      state,
      addSmartPlaylist({
        name: 'Delete Me',
        rules: [],
        sort: 'random',
        sortDirection: 'asc',
        limit: 25,
      })
    );

    const deleteId = state.playlists[1].id;
    state = smartPlaylistReducer(state, deleteSmartPlaylist(deleteId));

    expect(state.playlists).toHaveLength(1);
    expect(state.playlists[0].name).toBe('Keep');
  });

  it('deleteSmartPlaylist does NOT call settings.set() inside the reducer', () => {
    const state = smartPlaylistReducer(
      getInitialState(),
      addSmartPlaylist({ name: 'Test', rules: [], sort: 'random', sortDirection: 'asc', limit: 25 })
    );
    const id = state.playlists[0].id;

    const mockSet = jest.fn();
    (window as unknown as { bridge: Window['bridge'] }).bridge.settings.set = mockSet;

    smartPlaylistReducer(state, deleteSmartPlaylist(id));

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('setLibrarySyncedAt updates the timestamp', () => {
    const timestamp = '2026-06-15T12:00:00.000Z';
    const state = smartPlaylistReducer(getInitialState(), setLibrarySyncedAt(timestamp));
    expect(state.librarySyncedAt).toBe(timestamp);
  });

  it('initial librarySyncedAt is null when settings returns nothing', () => {
    const state = getInitialState();
    expect(state.librarySyncedAt).toBeNull();
  });
});
