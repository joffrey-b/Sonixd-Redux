import configReducer, {
  setActive,
  setPageSort,
  appendPlaybackFilter,
  removePlaybackFilter,
  setPlaybackFilter,
  setPlaybackFilters,
  setFont,
  setSidebar,
  setWindow,
  setPlayer,
  setAudioDeviceId,
  setMpvAudioDeviceId,
  setPlayerBackend,
  setMpvPath,
  setMpvGapless,
  setMpvReplayGain,
  setColumnList,
  setRowHeight,
  setFontSize,
  setGridCardSize,
  setGridGapSize,
  setGridAlignment,
  setDiscord,
  setOBS,
  setHotkey,
  buildInitialState,
  replaceState,
} from '../redux/configSlice';
import type { ConfigPage } from '../redux/configSlice';
import { mockSettings } from '../shared/mockSettings';

const getState = (): ConfigPage => configReducer(undefined, { type: '@@INIT' });

describe('configSlice initialisation', () => {
  it('applies correct defaults when no persisted state exists', () => {
    const state = getState();
    expect(state.active.tab).toBe('playback');
    expect(state.sort.albumListPage).toBeUndefined();
  });

  it('uses persisted column settings from mockSettings', () => {
    const state = getState();
    // mockSettings has musicListColumns set
    expect(state.lookAndFeel.listView.music.columns.length).toBeGreaterThan(0);
    expect(state.lookAndFeel.listView.music.rowHeight).toBe(50);
  });

  it('defaults serverType to "subsonic"', () => {
    const state = getState();
    expect(state.serverType).toBe('subsonic');
  });

  it('defaults filters from mockSettings.playbackFilters', () => {
    const state = getState();
    // mockSettings has one playback filter
    expect(state.playback.filters.length).toBeGreaterThan(0);
    expect(state.playback.filters[0]).toHaveProperty('filter');
    expect(state.playback.filters[0]).toHaveProperty('enabled');
  });

  it('initialises discord from mockSettings', () => {
    const state = getState();
    expect(state.external.discord.enabled).toBe(true);
    expect(state.external.discord.clientId).toBe('923372440934055968');
  });

  it('initialises window settings from mockSettings', () => {
    const state = getState();
    expect(state.window.minimizeToTray).toBe(true);
    expect(state.window.exitToTray).toBe(true);
  });
});

describe('configSlice reducers', () => {
  it('setPageSort updates the sort config for the given page', () => {
    const state = configReducer(
      getState(),
      setPageSort({ page: 'albumListPage', sort: { sortColumn: 'year', sortType: 'asc' } })
    );
    expect(state.sort.albumListPage).toEqual({ sortColumn: 'year', sortType: 'asc' });
  });

  it('appendPlaybackFilter adds a new filter', () => {
    const initial = getState();
    const state = configReducer(
      initial,
      appendPlaybackFilter({ filter: 'my-filter', enabled: true })
    );
    expect(state.playback.filters.find((f) => f.filter === 'my-filter')).toBeDefined();
  });

  it('appendPlaybackFilter does not add duplicate filter', () => {
    const initial = getState();
    const existingFilter = initial.playback.filters[0].filter;
    const state = configReducer(
      initial,
      appendPlaybackFilter({ filter: existingFilter, enabled: false })
    );
    const count = state.playback.filters.filter((f) => f.filter === existingFilter).length;
    expect(count).toBe(1);
  });

  it('removePlaybackFilter removes a filter by name', () => {
    const initial = getState();
    const existingFilter = initial.playback.filters[0].filter;
    const state = configReducer(initial, removePlaybackFilter({ filterName: existingFilter }));
    expect(state.playback.filters.find((f) => f.filter === existingFilter)).toBeUndefined();
  });

  it('setPlaybackFilters replaces the entire filter array', () => {
    const state = configReducer(
      getState(),
      setPlaybackFilters([{ filter: 'only-this', enabled: true }])
    );
    expect(state.playback.filters).toHaveLength(1);
    expect(state.playback.filters[0].filter).toBe('only-this');
  });

  it('setFont updates the font', () => {
    const state = configReducer(getState(), setFont('Roboto'));
    expect(state.lookAndFeel.font).toBe('Roboto');
  });

  it('setSidebar merges partial sidebar updates', () => {
    const state = configReducer(getState(), setSidebar({ expand: true, width: '300px' }));
    expect(state.lookAndFeel.sidebar.expand).toBe(true);
    expect(state.lookAndFeel.sidebar.width).toBe('300px');
  });

  it('setWindow merges partial window updates', () => {
    const state = configReducer(getState(), setWindow({ allowDevConsole: true }));
    expect(state.window.allowDevConsole).toBe(true);
  });

  it('setPlayer merges partial player updates', () => {
    const state = configReducer(getState(), setPlayer({ systemNotifications: true }));
    expect(state.player.systemNotifications).toBe(true);
  });

  it('setActive updates the active tab', () => {
    const state = configReducer(
      getState(),
      setActive({ tab: 'lookAndFeel', columnSelectorTab: '' })
    );
    expect(state.active.tab).toBe('lookAndFeel');
  });

  it('setPlaybackFilter replaces a filter in place by name', () => {
    const initial = getState();
    const filterName = initial.playback.filters[0].filter;
    const state = configReducer(
      initial,
      setPlaybackFilter({ filterName, newFilter: { filter: filterName, enabled: false } })
    );
    const updated = state.playback.filters.find((f) => f.filter === filterName);
    expect(updated?.enabled).toBe(false);
  });

  it('setAudioDeviceId sets the web audio device', () => {
    const state = configReducer(getState(), setAudioDeviceId('device-123'));
    expect(state.playback.audioDeviceId).toBe('device-123');
  });

  it('setMpvAudioDeviceId sets the MPV audio device', () => {
    const state = configReducer(getState(), setMpvAudioDeviceId('mpv-device-456'));
    expect(state.playback.mpvAudioDeviceId).toBe('mpv-device-456');
  });

  it('setPlayerBackend switches between web and mpv', () => {
    const state = configReducer(getState(), setPlayerBackend('mpv'));
    expect(state.playback.playerBackend).toBe('mpv');

    const state2 = configReducer(state, setPlayerBackend('web'));
    expect(state2.playback.playerBackend).toBe('web');
  });

  it('setMpvPath updates the mpv executable path', () => {
    const state = configReducer(getState(), setMpvPath('/usr/local/bin/mpv'));
    expect(state.playback.mpvPath).toBe('/usr/local/bin/mpv');
  });

  it('setMpvGapless updates the gapless setting', () => {
    const state = configReducer(getState(), setMpvGapless('weak'));
    expect(state.playback.mpvGapless).toBe('weak');
  });

  it('setMpvReplayGain updates the replay gain mode', () => {
    const state = configReducer(getState(), setMpvReplayGain('track'));
    expect(state.playback.mpvReplayGain).toBe('track');
  });

  it('setColumnList replaces column entries for a list type', () => {
    const newCols = [
      {
        id: 'custom-col',
        dataKey: 'title',
        alignment: 'left',
        flexGrow: 1,
        label: 'Title',
        resizable: true,
      },
    ];
    const state = configReducer(getState(), setColumnList({ listType: 'music', entries: newCols }));
    expect(state.lookAndFeel.listView.music.columns).toEqual(newCols);
  });

  it('setRowHeight updates row height for a list type', () => {
    const state = configReducer(getState(), setRowHeight({ listType: 'music', height: 80 }));
    expect(state.lookAndFeel.listView.music.rowHeight).toBe(80);
  });

  it('setFontSize updates font size for a list type', () => {
    const state = configReducer(getState(), setFontSize({ listType: 'album', size: 14 }));
    expect(state.lookAndFeel.listView.album.fontSize).toBe(14);
  });

  it('setGridCardSize updates card size', () => {
    const state = configReducer(getState(), setGridCardSize({ size: 200 }));
    expect(state.lookAndFeel.gridView.cardSize).toBe(200);
  });

  it('setGridGapSize updates gap size', () => {
    const state = configReducer(getState(), setGridGapSize({ size: 16 }));
    expect(state.lookAndFeel.gridView.gapSize).toBe(16);
  });

  it('setGridAlignment updates grid alignment', () => {
    const state = configReducer(getState(), setGridAlignment({ alignment: 'center' }));
    expect(state.lookAndFeel.gridView.alignment).toBe('center');
  });

  it('setDiscord updates the discord config', () => {
    const discord = { enabled: true, clientId: 'new-id', showAlbumArt: true };
    const state = configReducer(getState(), setDiscord(discord));
    expect(state.external.discord).toEqual(discord);
  });

  it('setOBS updates the OBS config', () => {
    const obs = {
      enabled: true,
      url: 'http://obs:4455',
      type: 'local' as const,
      path: '/tmp/obs.txt',
      pollingInterval: 1000,
    };
    const state = configReducer(getState(), setOBS(obs));
    expect(state.external.obs.url).toBe('http://obs:4455');
  });

  it('setHotkey updates a hotkey binding', () => {
    const state = configReducer(
      getState(),
      setHotkey({ action: 'playPause', key: 'MediaPlayPause' })
    );
    expect(state.hotkeys.playPause).toBe('MediaPlayPause');
  });
});

describe('buildInitialState / replaceState (import-settings refresh)', () => {
  if (!mockSettings.sidebar) throw new Error('mockSettings.sidebar must be defined for this suite');
  const mockSidebar = mockSettings.sidebar;
  const originalSidebarSelected = mockSidebar.selected;
  const originalAllowDevConsole = (mockSettings as Record<string, unknown>).allowDevConsole;

  afterEach(() => {
    mockSidebar.selected = originalSidebarSelected;
    (mockSettings as Record<string, unknown>).allowDevConsole = originalAllowDevConsole;
  });

  it('buildInitialState reflects settings changed after module load, not a frozen snapshot', () => {
    mockSidebar.selected = ['dashboard', 'podcasts'];
    expect(buildInitialState().lookAndFeel.sidebar.selected).toEqual(['dashboard', 'podcasts']);

    mockSidebar.selected = ['dashboard', 'songs', 'albums'];
    expect(buildInitialState().lookAndFeel.sidebar.selected).toEqual([
      'dashboard',
      'songs',
      'albums',
    ]);
  });

  it('replaceState wholesale-replaces the slice with a freshly-built state', () => {
    (mockSettings as Record<string, unknown>).allowDevConsole = true;
    mockSidebar.selected = ['dashboard', 'podcasts'];

    // Start from a state that's already diverged (different active tab) to
    // prove this is a real replace, not a partial merge.
    const staleState = configReducer(
      getState(),
      setActive({ tab: 'window', columnSelectorTab: 'album' })
    );

    const refreshed = configReducer(staleState, replaceState(buildInitialState()));
    expect(refreshed.window.allowDevConsole).toBe(true);
    expect(refreshed.lookAndFeel.sidebar.selected).toEqual(['dashboard', 'podcasts']);
  });
});
