import { renderHook } from '@testing-library/react';
import { useOnceDefined } from 'hooks/useOnceDefined';

describe('useOnceDefined', () => {
  it('should NOT call the callback if the value is initially undefined', () => {
    const callback = jest.fn();
    renderHook(({ val }) => useOnceDefined(val, callback), {
      initialProps: { val: undefined as string | undefined },
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should call the callback exactly once when the value becomes defined', () => {
    const callback = jest.fn();
    const { rerender } = renderHook(({ val }) => useOnceDefined(val, callback), {
      initialProps: { val: undefined as string | undefined },
    });

    // 1. Transition from undefined to a value
    rerender({ val: 'First Value' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('First Value');

    // 2. Change the value again (should be ignored)
    rerender({ val: 'Second Value' });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should trigger immediately if the initial value is already defined', () => {
    const callback = jest.fn();
    renderHook(() => useOnceDefined('Immediate', callback));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('Immediate');
  });

  it('should not re-trigger if the value returns to undefined and then becomes defined again', () => {
    const callback = jest.fn();
    const { rerender } = renderHook(({ val }) => useOnceDefined(val, callback), {
      initialProps: { val: 'Initial' as string | undefined },
    });

    expect(callback).toHaveBeenCalledTimes(1);

    rerender({ val: undefined });
    rerender({ val: 'New Value' });

    // Should still be 1 because the "once" condition was met initially
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
