import downloadProgressReducer, {
  startDownloadBatch,
  incrementDownloadProgress,
  finishDownloadBatch,
  selectDownloadProgress,
} from '../redux/downloadProgressSlice';

describe('download batch progress (Fix 3)', () => {
  it('starts a batch with the given total and zeroed progress', () => {
    const state = downloadProgressReducer(undefined, startDownloadBatch(12));
    expect(state).toEqual({ inProgress: true, completed: 0, total: 12 });
  });

  it('increments the completed count on each call', () => {
    let state = downloadProgressReducer(undefined, startDownloadBatch(3));
    state = downloadProgressReducer(state, incrementDownloadProgress());
    state = downloadProgressReducer(state, incrementDownloadProgress());
    expect(state).toEqual({ inProgress: true, completed: 2, total: 3 });
  });

  it('resets to idle when the batch finishes', () => {
    let state = downloadProgressReducer(undefined, startDownloadBatch(3));
    state = downloadProgressReducer(state, incrementDownloadProgress());
    state = downloadProgressReducer(state, finishDownloadBatch());
    expect(state).toEqual({ inProgress: false, completed: 0, total: 0 });
  });

  it('selectDownloadProgress reads the slice state', () => {
    const state = { downloadProgress: downloadProgressReducer(undefined, startDownloadBatch(5)) };
    expect(selectDownloadProgress(state)).toEqual({ inProgress: true, completed: 0, total: 5 });
  });
});
