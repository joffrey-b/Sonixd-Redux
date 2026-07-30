import { onRequestSuccess, emitRequestSuccess } from '../shared/connectivityEvents';

describe('connectivityEvents (Fix 3)', () => {
  it('a listener that throws does not prevent other listeners from running', () => {
    const throwing = jest.fn(() => {
      throw new Error('listener blew up');
    });
    const other = jest.fn();

    const unsubThrowing = onRequestSuccess(throwing);
    const unsubOther = onRequestSuccess(other);

    emitRequestSuccess();

    expect(throwing).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);

    unsubThrowing();
    unsubOther();
  });

  it('a listener that throws does not propagate back to the caller of emitRequestSuccess', () => {
    const throwing = jest.fn(() => {
      throw new Error('listener blew up');
    });
    const unsub = onRequestSuccess(throwing);

    expect(() => emitRequestSuccess()).not.toThrow();

    unsub();
  });

  it('unsubscribing stops a listener from being called on future emits', () => {
    const listener = jest.fn();
    const unsub = onRequestSuccess(listener);

    emitRequestSuccess();
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    emitRequestSuccess();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
