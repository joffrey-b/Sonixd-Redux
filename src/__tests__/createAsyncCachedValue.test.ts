import { createAsyncCachedValue } from '../shared/createAsyncCachedValue';

describe('createAsyncCachedValue (Section 5 reuse fix)', () => {
  it('returns the sync fallback before the first async resolution completes, then the resolved value after', async () => {
    let resolveFetch: (() => void) | undefined;
    const fetcher = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = () => resolve('async-value');
        })
    );
    const cache = createAsyncCachedValue(fetcher, () => 'sync-fallback');

    expect(cache.get()).toBe('sync-fallback');
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFetch?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cache.get()).toBe('async-value');
  });

  it('only triggers one in-flight refresh even if get() is called many times before it resolves', async () => {
    let resolveFetch: (() => void) | undefined;
    const fetcher = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = () => resolve('value');
        })
    );
    const cache = createAsyncCachedValue(fetcher, () => 'fallback');

    cache.get();
    cache.get();
    cache.get();
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveFetch?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.get()).toBe('value');
  });

  it('clear() invalidates the cache, so the next get() falls back to sync and re-triggers a refresh', async () => {
    let callCount = 0;
    const fetcher = jest.fn(async () => {
      callCount += 1;
      return `value-${callCount}`;
    });
    const cache = createAsyncCachedValue(fetcher, () => 'fallback');

    cache.get();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.get()).toBe('value-1');

    cache.clear();
    expect(cache.get()).toBe('fallback');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.get()).toBe('value-2');
  });

  it('supports a composite object value resolved from one combined fetch', async () => {
    const fetcher = jest.fn(async () => ({ a: 'A', b: 'B' }));
    const cache = createAsyncCachedValue(fetcher, () => ({ a: '', b: '' }));

    cache.get();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cache.get()).toEqual({ a: 'A', b: 'B' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a rejected fetch does not wedge future refreshes', async () => {
    let attempt = 0;
    const fetcher = jest.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('boom');
      return 'recovered';
    });
    const cache = createAsyncCachedValue(fetcher, () => 'fallback');

    cache.get();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.get()).toBe('fallback');

    cache.get();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.get()).toBe('recovered');
  });
});
