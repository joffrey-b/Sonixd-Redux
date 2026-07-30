import { mapWithConcurrency } from '../shared/mapWithConcurrency';

describe('mapWithConcurrency (Section 5 reuse fix)', () => {
  it('preserves input order in the results regardless of resolution order', async () => {
    const items = [30, 10, 20, 5, 15];
    const results = await mapWithConcurrency(items, 2, (ms) => {
      return new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms));
    });
    expect(results).toEqual(items);
  });

  it('never runs more than `concurrency` items at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 11 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('does not swallow errors itself -- a thrown item rejects the whole call, matching every existing call site', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 5, async (item) => {
        if (item === 2) throw new Error('boom');
        return item;
      })
    ).rejects.toThrow('boom');
  });

  it('supports per-item isolation when the caller catches inside its own fn (the established pattern)', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 5, async (item) => {
      try {
        if (item === 2) throw new Error('boom');
        return { success: true, item };
      } catch {
        return { success: false, item };
      }
    });
    expect(results).toEqual([
      { success: true, item: 1 },
      { success: false, item: 2 },
      { success: true, item: 3 },
    ]);
  });

  it('returns an empty array for an empty input without calling fn', async () => {
    const fn = jest.fn();
    const results = await mapWithConcurrency([], 5, fn);
    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});
