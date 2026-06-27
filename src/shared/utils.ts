import _ from 'lodash';
import dayjs from 'dayjs';
import { arrayMoveMutable } from 'array-move';

import i18n from '../i18n/i18n';
import { nowPlaying, settings, recovery, osRelease } from '../components/shared/bridge';
import type { Song } from '../types';

interface ApiResponse {
  status?: string;
  error?: { message: string };
}

interface EntryWithId {
  uniqueId: string;
  rowIndex?: number;
  streamUrl?: string;
  title?: string;
}

// Pure string-based path joining. Node's `path` module compiles to a runtime
// require("path") in the renderer bundle (target: electron-renderer) -- this only
// works while nodeIntegration is true. Forward slashes are accepted by Node's fs
// APIs on every platform including Windows, so a plain join + slash-collapse is a
// safe drop-in for the two/three-segment joins this codebase actually performs
// (see C1 / nodeIntegration migration).
export const joinPath = (...segments: string[]): string =>
  segments
    .filter((segment) => segment.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');

export const getRootCachePath = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require is intentional: avoids bundling mockSettings in production
  const ms = process.env.NODE_ENV === 'test' ? require('./mockSettings').mockSettings : null;
  const baseCachePath = ms ? ms.cachePath : String(settings.get('cachePath'));
  const serverBase64 = ms ? ms.serverBase64 : String(settings.get('serverBase64'));

  return joinPath(baseCachePath, 'sonixd-redux-cache', serverBase64);
};

export const getImageCachePath = () => {
  return joinPath(getRootCachePath(), 'image', '/');
};

export const getSongCachePath = () => {
  return joinPath(getRootCachePath(), 'song', '/');
};

export const getRecoveryPath = () => {
  return joinPath(getRootCachePath(), '__recovery');
};

// Fire-and-forget, matching the original's `.catch(() => {})` — the bridge handler
// performs the existsSync-then-mkdirSync-then-writeFile sequence in main (the
// renderer can no longer reach `fs` directly, see C1 / nodeIntegration).
export const createRecoveryFile = (id: string | number, type: string, data: unknown) => {
  const filePath = joinPath(getRecoveryPath(), `${type}_${id}.json`);

  recovery.write(filePath, JSON.stringify(data, null, 4)).catch(() => {});
};

export const isFailedResponse = (res: unknown): boolean => {
  if (Array.isArray(res)) {
    return (res as ApiResponse[]).some((r) => r.status === 'failed');
  }
  return (res as ApiResponse)?.status === 'failed';
};

export const errorMessages = (res: unknown): string[] => {
  const errors: string[] = [];

  if (Array.isArray(res)) {
    (res as ApiResponse[]).forEach((response) => {
      if (response.status === 'failed') {
        errors.push(response.error?.message ?? 'Unknown error');
      }
    });
  } else {
    errors.push((res as ApiResponse)?.error?.message ?? 'Unknown error');
  }

  return errors;
};

export const shuffle = <T>(array: T[]): T[] => {
  const arr = [...array];
  let currentIndex = arr.length;
  let randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex !== 0) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    [arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]];
  }

  return arr;
};

// https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

export const formatSongDuration = (duration: number) => {
  const hours = Math.floor(duration / 60 / 60);
  const minutes = Math.floor((duration / 60) % 60);
  const seconds = String(Math.trunc(Number(duration % 60))).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  }

  if (Number.isNaN(minutes)) {
    return null;
  }

  return `${minutes}:${seconds}`;
};

export const formatDuration = (duration: number) => {
  const hours = Math.floor(duration / 60 / 60);
  const minutes = Math.floor((duration / 60) % 60);
  const seconds = String(Math.trunc(Number(duration % 60))).padStart(2, '0');

  if (hours > 0) {
    return `${hours} hr ${minutes} min ${seconds} sec`;
  }

  if (Number.isNaN(minutes)) {
    return null;
  }

  return `${minutes} min ${seconds} sec`;
};

export const formatDate = (date: string) => {
  return dayjs(date).format('MMM D YYYY');
};

export const formatDateTime = (date: string) => {
  return dayjs(date).format('MMM D YYYY H:mm');
};

export const convertByteToMegabyte = (kb: number) => {
  return (kb * 0.000001).toFixed(1);
};

// https://www.geeksforgeeks.org/check-if-array-elements-are-consecutive/
const getMin = (arr: number[], n: number) => {
  let min = arr[0];
  for (let i = 1; i < n; i += 1) {
    if (arr[i] < min) min = arr[i];
  }
  return min;
};

const getMax = (arr: number[], n: number) => {
  let max = arr[0];
  for (let i = 1; i < n; i += 1) {
    if (arr[i] > max) max = arr[i];
  }
  return max;
};

export const areConsecutive = (arr: number[], n: number) => {
  if (n < 1) return false;

  /* 1) Get the minimum element in array */
  const min = getMin(arr, n);

  /* 2) Get the maximum element in array */
  const max = getMax(arr, n);

  /* 3) max - min + 1 is equal to n,  then only check all elements */
  if (max - min + 1 === n) {
    /* Create a temp array to hold visited flag of all elements.
               Note that, calloc is used here so that all values are initialized
               as false */
    const visited = new Array(n);
    for (let i = 0; i < n; i += 1) {
      visited[i] = false;
    }
    let i;
    for (i = 0; i < n; i += 1) {
      /* If we see an element again, then return false */
      if (visited[arr[i] - min] !== false) {
        return false;
      }
      /* If visited first time, then mark the element as visited */
      visited[arr[i] - min] = true;
    }
    /* If all elements occur once, then return true */
    return true;
  }
  return false; // if (max - min  + 1 != n)
};

// https://www.geeksforgeeks.org/find-all-ranges-of-consecutive-numbers-from-array/
export const consecutiveRanges = (a: number[]) => {
  let length = 1;
  const list: number[][] = [];

  // If the array is empty,
  // return the list
  if (a.length === 0) {
    return list;
  }

  // Traverse the array from first position
  for (let i = 1; i <= a.length; i += 1) {
    // Check the difference between the
    // current and the previous elements
    // If the difference doesn't equal to 1
    // just increment the length variable.
    if (i === a.length || a[i] - a[i - 1] !== 1) {
      // If the range contains
      // only one element.
      // add it into the list.
      if (length === 1) {
        // list.push(a[i - length].toString());
      } else {
        // Build the range between the first
        // element of the range and the
        // current previous element as the
        // last range.
        const range = [];
        for (let j = Number(a[i - length]); j <= a[i - 1]; j += 1) {
          range.push(j);
        }
        list.push(range);

        // list.push(a[i - length] + a[i - 1]);
      }

      // After finding the first range
      // initialize the length by 1 to
      // build the next range.
      length = 1;
    } else {
      length += 1;
    }
  }

  return list;
};

export const sliceRangeByUniqueId = <T extends { uniqueId?: string }>(
  data: T[],
  startUniqueId: string,
  endUniqueId: string
): T[] => {
  const beginningIndex = data.findIndex((e) => e.uniqueId === startUniqueId);
  const endingIndex = data.findIndex((e) => e.uniqueId === endUniqueId);

  // Handle both selection directions
  const newSlice =
    beginningIndex < endingIndex
      ? data.slice(beginningIndex, endingIndex + 1)
      : data.slice(endingIndex, beginningIndex + 1);

  return newSlice;
};

export const moveSelectedUp = <T extends { uniqueId?: string }>(
  entryData: T[],
  selectedEntries: { uniqueId?: string }[]
): T[] => {
  // Ascending index is needed to move the indexes in order
  const selectedIndices = selectedEntries.map((selected) => {
    return entryData.findIndex((item) => item.uniqueId === selected.uniqueId);
  });

  const selectedIndexesAsc = selectedIndices.sort((a: number, b: number) => a - b);
  const cr = consecutiveRanges(selectedIndexesAsc);

  // Handle case when index hits 0
  if (
    !(
      selectedIndexesAsc.includes(0) &&
      areConsecutive(selectedIndexesAsc, selectedIndexesAsc.length)
    )
  ) {
    selectedIndexesAsc.map((index: number) => {
      if (cr[0]?.includes(0)) {
        if (!cr[0]?.includes(index) && index !== 0) {
          return arrayMoveMutable(entryData, index, index - 1);
        }
      } else if (index !== 0) {
        return arrayMoveMutable(entryData, index, index - 1);
      }

      return undefined;
    });
  }

  return entryData;
};

export const moveSelectedDown = <T extends { uniqueId?: string }>(
  entryData: T[],
  selectedEntries: { uniqueId?: string }[]
): T[] => {
  // Descending index is needed to move the indexes in order
  const selectedIndices = selectedEntries.map((selected) => {
    return entryData.findIndex((item) => item.uniqueId === selected.uniqueId);
  });

  const cr = consecutiveRanges(selectedIndices.sort((a, b) => a - b));
  const selectedIndexesDesc = selectedIndices.sort((a, b) => b - a);

  // Handle case when index hits the end
  if (
    !(
      selectedIndexesDesc.includes(entryData.length - 1) &&
      areConsecutive(selectedIndexesDesc, selectedIndexesDesc.length)
    )
  ) {
    selectedIndexesDesc.map((index) => {
      if (cr[0]?.includes(entryData.length - 1)) {
        if (!cr[0]?.includes(index) && index !== entryData.length - 1) {
          return arrayMoveMutable(entryData, index, index + 1);
        }
      } else if (index !== entryData.length - 1) {
        return arrayMoveMutable(entryData, index, index + 1);
      }

      return undefined;
    });
  }

  return entryData;
};

export const moveSelectedToTop = <T extends { uniqueId?: string }>(
  entryData: T[],
  selectedEntries: { uniqueId?: string }[]
): T[] => {
  const uniqueIds = _.map(selectedEntries, 'uniqueId');

  // Remove the selected entries from the queue
  const newList = entryData.filter((entry) => {
    return !uniqueIds.includes(entry.uniqueId);
  });

  // Get the updated entry rowIndexes since dragging an entry multiple times will change the existing selected rowIndex
  const updatedEntries = selectedEntries.map((entry) => {
    const findIndex = entryData.findIndex((item) => item.uniqueId === entry.uniqueId);
    return { ...entry, rowIndex: findIndex };
  });

  // Sort the entries by their rowIndex so that we can re-add them in the proper order
  const sortedEntries = updatedEntries.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sortedEntries is a heterogeneous Column array; typed spread requires `as any[]` due to generic variance
  newList.splice(0, 0, ...(sortedEntries as any[]));

  return newList;
};

export const moveSelectedToBottom = <T extends { uniqueId?: string }>(
  entryData: T[],
  selectedEntries: { uniqueId?: string }[]
): T[] => {
  const uniqueIds = _.map(selectedEntries, 'uniqueId');

  // Remove the selected entries from the queue
  const newList = entryData.filter((entry) => {
    return !uniqueIds.includes(entry.uniqueId);
  });

  // Get the updated entry rowIndexes since dragging an entry multiple times will change the existing selected rowIndex
  const updatedEntries = selectedEntries.map((entry) => {
    const findIndex = entryData.findIndex((item) => item.uniqueId === entry.uniqueId);
    return { ...entry, rowIndex: findIndex };
  });

  // Sort the entries by their rowIndex so that we can re-add them in the proper order
  const sortedEntries = updatedEntries.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sortedEntries is a heterogeneous Column array; typed spread requires `as any[]` due to generic variance
  newList.push(...(sortedEntries as any[]));

  return newList;
};

export const moveSelectedToIndex = <T extends { uniqueId?: string }>(
  entryData: T[],
  selectedEntries: { uniqueId?: string }[],
  moveBeforeId: string | number | undefined
): T[] => {
  if (!entryData || !selectedEntries) return entryData;
  const uniqueIds = _.map(selectedEntries, 'uniqueId');

  // Remove the selected entries from the queue
  const newList = entryData.filter((entry) => {
    return !uniqueIds.includes(entry.uniqueId);
  });

  // When dropped below the last row, append selected entries to end
  if (moveBeforeId === undefined) {
    const sortedEntries = selectedEntries
      .map((entry) => ({
        ...entry,
        rowIndex: entryData.findIndex((item) => item.uniqueId === entry.uniqueId),
      }))
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sortedEntries is a heterogeneous Column array; typed spread requires `as any[]` due to generic variance
    return [...newList, ...(sortedEntries as any[])] as T[];
  }

  // Used if dragging onto the first selected row. We'll need to calculate the number of selected rows above the first selected row
  // so we can subtract it from the spliceIndexPre value when moving it into the newList, which has all selected entries removed
  const spliceIndexPre = entryData.findIndex((entry) => entry.uniqueId === moveBeforeId);

  const queueAbovePre = entryData.slice(0, spliceIndexPre);
  const selectedAbovePre = queueAbovePre.filter((entry) => uniqueIds.includes(entry.uniqueId));

  // Used if dragging onto a non-selected row
  const spliceIndexPost = newList.findIndex((entry) => entry.uniqueId === moveBeforeId);

  // Used if dragging onto consecutive selected rows
  // If the moveBeforeId index is selected, then we find the first consecutive selected index to move to
  let firstConsecutiveSelectedDragIndex = -1;
  for (let i = spliceIndexPre - 1; i > 0; i -= 1) {
    if (uniqueIds.includes(entryData[i].uniqueId)) {
      firstConsecutiveSelectedDragIndex = i;
    } else {
      break;
    }
  }

  // If we get a negative index, don't move the entry.
  // This can happen if you try to drag and drop too fast
  if (spliceIndexPre < 0 && spliceIndexPost < 0) {
    return entryData;
  }

  // Find the slice index to add the selected entries to
  const spliceIndex =
    spliceIndexPost >= 0
      ? spliceIndexPost
      : firstConsecutiveSelectedDragIndex >= 0
        ? firstConsecutiveSelectedDragIndex
        : spliceIndexPre - selectedAbovePre.length;

  // Get the updated entry rowIndexes since dragging an entry multiple times will change the existing selected rowIndex
  const updatedEntries = selectedEntries.map((entry) => {
    const findIndex = entryData.findIndex((item) => item.uniqueId === entry.uniqueId);
    return { ...entry, rowIndex: findIndex };
  });

  // Sort the entries by their rowIndex so that we can re-add them in the proper order
  const sortedEntries = updatedEntries.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));

  // Splice the entries into the new queue array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sortedEntries is a heterogeneous Column array; typed spread requires `as any[]` due to generic variance
  newList.splice(spliceIndex, 0, ...(sortedEntries as any[]));

  // Finally, return the modified list
  return newList;
};

export const getUpdatedEntryRowIndex = (
  selectedEntries: EntryWithId[],
  entryData: EntryWithId[]
) => {
  const updatedEntries = selectedEntries.map((entry) => {
    const findIndex = entryData.findIndex((item) => item.uniqueId === entry.uniqueId);
    return { ...entry, rowIndex: findIndex };
  });

  // Sort the entries by their rowIndex so that we can re-add them in the proper order
  const sortedEntries = updatedEntries.sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));

  return sortedEntries;
};

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export function getCurrentEntryList(playQueue: {
  sortedEntry: Song[];
  shuffledEntry: Song[];
  entry: Song[];
  shuffle: boolean;
}): 'sortedEntry' | 'shuffledEntry' | 'entry';
export function getCurrentEntryList(playQueue: {
  sortedEntry: Song[];
  entry: Song[];
}): 'sortedEntry' | 'entry';
export function getCurrentEntryList(playQueue: { sortedEntry: Song[]; shuffle?: boolean }): string {
  if (playQueue.sortedEntry.length > 0) {
    return 'sortedEntry';
  }

  if (playQueue.shuffle) {
    return 'shuffledEntry';
  }

  return 'entry';
}

export const getTheme = <T extends { value: string }>(
  themes: T[],
  value: string
): T | undefined => {
  return themes.find((theme) => theme.value === value);
};

export const filterPlayQueue = <T extends EntryWithId>(
  filters: { enabled: boolean; filter: string }[],
  entries: T[]
) => {
  const enabledFilters = filters.filter((f) => f.enabled === true);
  const joinedFilterRegex = enabledFilters.map((f) => f.filter).join('|');

  // Remove invalid entries that may break the player (likely due to Airsonic including folders)
  const validEntries = entries.filter((song) => {
    return song.streamUrl;
  });

  if (joinedFilterRegex) {
    let filteredEntries = validEntries;
    try {
      const regex = new RegExp(joinedFilterRegex, 'i');
      filteredEntries = validEntries.filter((entry) => !regex.test(entry.title ?? ''));
    } catch {
      // Invalid regex pattern — skip filtering rather than crashing
    }

    return {
      entries: filteredEntries,
      count: { original: entries.length, filtered: validEntries.length },
    };
  }
  return {
    entries: validEntries,
    count: { original: entries.length, filtered: validEntries.length },
  };
};
export const getPlayedSongsNotification = (options: {
  original: number;
  filtered: number;
  type: 'play' | 'add';
}) => {
  if (options.type === 'play') {
    if (options.original === options.filtered) {
      return i18n.t('Playing {{count}} track', { count: options.original });
    }

    return i18n.t('Playing {{count}} track [{{i}} filtered]', {
      count: options.filtered,
      i: options.original - options.filtered,
    });
  }

  if (options.original === options.filtered) {
    return i18n.t('Added {{count}} track', { count: options.original });
  }

  return i18n.t('Added {{count}} track [{{i}} filtered]', {
    count: options.filtered,
    i: options.original - options.filtered,
  });
};

export const getUniqueRandomNumberArr = (count: number, maxRange: number) => {
  const arr = [];
  while (arr.length < count) {
    const r = Math.floor(Math.random() * maxRange);
    if (arr.indexOf(r) === -1) arr.push(r);
  }

  return arr;
};

export const getAlbumSize = (songs: { size: number }[]) => {
  return formatBytes(
    _.sumBy(songs, (o) => {
      return o.size;
    })
  );
};

export const decodeBase64Image = (dataString: string) => {
  const matches = dataString.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  const response: { type?: string; data?: Buffer } = {};

  if (!matches || matches.length !== 3) {
    return new Error('Invalid input string');
  }

  response.type = matches[1];
  response.data = Buffer.from(matches[2], 'base64');

  return response;
};

export const writeOBSFiles = (filePath: string, data: unknown) => {
  // Writes happen on the main process side now (see bridge.nowPlaying) — batched into
  // a single IPC message since this fires on a poll timer as fast as every 100ms.
  nowPlaying.write(filePath, data);
};

// From https://gist.github.com/andjosh/6764939#gistcomment-3564498
const easeInOutQuad = (
  currentTime: number,
  start: number,
  change: number,
  duration: number
): number => {
  let newCurrentTime = currentTime;
  newCurrentTime /= duration / 2;

  if (newCurrentTime < 1) {
    return (change / 2) * newCurrentTime * newCurrentTime + start;
  }

  newCurrentTime -= 1;
  return (-change / 2) * (newCurrentTime * (newCurrentTime - 2) - 1) + start;
};

// From https://gist.github.com/andjosh/6764939#gistcomment-3564498
export const smoothScroll = (
  duration: number,
  element: HTMLElement,
  to: number,
  property: 'scrollTop' | 'scrollLeft'
): void => {
  const start = element[property];
  const change = to - start;
  const startDate = new Date().getTime();

  const animateScroll = () => {
    const currentDate = new Date().getTime();
    const currentTime = currentDate - startDate;

    element[property] = easeInOutQuad(currentTime, start, change, duration);

    if (currentTime < duration) {
      requestAnimationFrame(animateScroll);
    } else {
      element[property] = to;
    }
  };
  animateScroll();
};

export const isWindows = () => {
  return process.platform === 'win32';
};

// `os.release()` compiles to a runtime `require("os")` in the renderer bundle
// (target: electron-renderer) -- only works while nodeIntegration is true. The
// bridge's `osRelease` is computed once in preload (always a real Node context)
// and exposed as a plain string (see C1 / nodeIntegration). This helper is only
// ever called from the renderer (PlayerConfig.tsx), never from main.
export const isWindows10 = () => {
  return osRelease().match(/^10\.*/g);
};

export const isMacOS = () => {
  return process.platform === 'darwin';
};

export const isLinux = () => {
  return process.platform === 'linux';
};
