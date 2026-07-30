import { createAsyncLock } from '../shared/asyncLock';

describe('createAsyncLock (Section 5 reuse fix)', () => {
  it('serializes calls -- the second does not start until the first resolves', async () => {
    const withLock = createAsyncLock();
    const order: string[] = [];

    const first = withLock(async () => {
      order.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('first-end');
    });
    const second = withLock(async () => {
      order.push('second-start');
      order.push('second-end');
    });

    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('a rejected call does not wedge the chain for what is queued after it', async () => {
    const withLock = createAsyncLock();

    await expect(
      withLock(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const result = await withLock(async () => 'still works');
    expect(result).toBe('still works');
  });

  it('two independent lock instances do not contend with each other', async () => {
    const lockA = createAsyncLock();
    const lockB = createAsyncLock();
    const order: string[] = [];

    const slowInA = lockA(async () => {
      order.push('a-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('a-end');
    });
    const fastInB = lockB(async () => {
      order.push('b');
    });

    await Promise.all([slowInA, fastInB]);
    // b runs and finishes while a is still in flight -- proving the two
    // locks are genuinely independent, not sharing one chain.
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a-end'));
  });
});
