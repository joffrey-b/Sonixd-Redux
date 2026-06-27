import { nanoid } from 'nanoid';
import playQueueReducer, {
  setPlayQueue,
  sortPlayQueue,
  setCurrentIndex,
  setStar,
  setRate,
} from '../redux/playQueueSlice';
import type { PlayQueue } from '../redux/playQueueSlice';
import { Item, Song } from '../types';

function getInitialState(): PlayQueue {
  return playQueueReducer(undefined, { type: '@@INIT' });
}

const makeEntry = (overrides: Partial<Song> = {}): Song =>
  ({
    id: nanoid(),
    uniqueId: nanoid(),
    title: 'Song',
    album: 'Album',
    albumArtist: 'Artist',
    albumArtistId: '',
    artist: [],
    albumId: '',
    duration: 180,
    bitRate: 320,
    track: 1,
    year: 2000,
    genre: [],
    size: 0,
    contentType: 'audio/mpeg',
    suffix: 'mp3',
    isDir: false,
    path: '/music/song.mp3',
    playCount: 0,
    created: '',
    streamUrl: '',
    image: '',
    starred: false,
    userRating: 0,
    type: Item.Music,
    ...overrides,
  }) as Song;

const loadQueue = (songs: Song[]): PlayQueue =>
  playQueueReducer(getInitialState(), setPlayQueue({ entries: songs }));

// ─── sortPlayQueue — extended coverage ────────────────────────────────────────

describe('sortPlayQueue — additional sort targets', () => {
  it('sorts entries by album ascending', () => {
    const state = loadQueue([
      makeEntry({ title: 'X', album: 'Zebra' }),
      makeEntry({ title: 'Y', album: 'Apple' }),
      makeEntry({ title: 'Z', album: 'Mango' }),
    ]);
    const sorted = playQueueReducer(
      state,
      sortPlayQueue({ columnDataKey: 'album', sortType: 'asc' })
    );
    expect(sorted.sortedEntry.map((e) => e.album)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('sorts entries by album descending', () => {
    const state = loadQueue([
      makeEntry({ album: 'Apple' }),
      makeEntry({ album: 'Zebra' }),
      makeEntry({ album: 'Mango' }),
    ]);
    const sorted = playQueueReducer(
      state,
      sortPlayQueue({ columnDataKey: 'album', sortType: 'desc' })
    );
    expect(sorted.sortedEntry.map((e) => e.album)).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  it('sorts entries by albumArtist ascending', () => {
    const state = loadQueue([
      makeEntry({ albumArtist: 'Zeppelin' }),
      makeEntry({ albumArtist: 'Beatles' }),
      makeEntry({ albumArtist: 'Miles Davis' }),
    ]);
    const sorted = playQueueReducer(
      state,
      sortPlayQueue({ columnDataKey: 'albumArtist', sortType: 'asc' })
    );
    expect(sorted.sortedEntry.map((e) => e.albumArtist)).toEqual([
      'Beatles',
      'Miles Davis',
      'Zeppelin',
    ]);
  });

  it('sorts entries by title descending', () => {
    const state = loadQueue([
      makeEntry({ title: 'Alpha' }),
      makeEntry({ title: 'Zeta' }),
      makeEntry({ title: 'Beta' }),
    ]);
    const sorted = playQueueReducer(
      state,
      sortPlayQueue({ columnDataKey: 'title', sortType: 'desc' })
    );
    expect(sorted.sortedEntry.map((e) => e.title)).toEqual(['Zeta', 'Beta', 'Alpha']);
  });

  it('currentIndex is updated after sort to still point to the same song', () => {
    const target = makeEntry({ title: 'Middle' });
    const state = loadQueue([makeEntry({ title: 'Zebra' }), target, makeEntry({ title: 'Apple' })]);

    // Move current to the Middle song (index 1)
    const withCurrent = playQueueReducer(state, setCurrentIndex(target));
    expect(withCurrent.currentSongUniqueId).toBe(target.uniqueId);

    // Sort: [Apple, Middle, Zebra] — Middle should now be at index 1
    const sorted = playQueueReducer(
      withCurrent,
      sortPlayQueue({ columnDataKey: 'title', sortType: 'asc' })
    );
    expect(sorted.currentIndex).toBe(1);
    expect(sorted.sortedEntry[sorted.currentIndex].uniqueId).toBe(target.uniqueId);
  });
});

// ─── setStar / setRate — unknown id ───────────────────────────────────────────

describe('setStar and setRate with unknown id', () => {
  it('setStar for unknown id does not modify the queue', () => {
    const songs = [makeEntry({ title: 'Known' })];
    const state = loadQueue(songs);
    const after = playQueueReducer(state, setStar({ id: ['totally-unknown-id'], type: 'star' }));
    expect(after.entry[0].starred).toBeFalsy();
  });

  it('setRate for unknown id does not modify the queue', () => {
    const songs = [makeEntry()];
    const state = loadQueue(songs);
    const after = playQueueReducer(state, setRate({ id: ['totally-unknown-id'], rating: 5 }));
    expect(after.entry[0].userRating).toBeFalsy();
  });

  it('setStar with known id updates only the matching entry', () => {
    const a = makeEntry({ title: 'A' });
    const b = makeEntry({ title: 'B' });
    const state = loadQueue([a, b]);
    const after = playQueueReducer(state, setStar({ id: [a.id], type: 'star' }));
    expect(after.entry[0].starred).toBeTruthy();
    expect(after.entry[1].starred).toBeFalsy();
  });

  it('setRate with known id updates only the matching entry', () => {
    const a = makeEntry({ title: 'A' });
    const b = makeEntry({ title: 'B' });
    const state = loadQueue([a, b]);
    const after = playQueueReducer(state, setRate({ id: [a.id], rating: 4 }));
    expect(after.entry[0].userRating).toBe(4);
    expect(after.entry[1].userRating).toBeFalsy();
  });
});
