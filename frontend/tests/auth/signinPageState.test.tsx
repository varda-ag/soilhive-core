import React from 'react';
import { renderHook } from '@testing-library/react';
import { getPageState, peekRestoredPageState, setRestoredPageState, useRestoredPageState } from '../../src/auth/signinPageState';

describe('getPageState', () => {
  it("returns the sign-in state's page state", () => {
    expect(getPageState({ returnTo: '/', pageState: { availabilityMap: { locationName: 'Nakuru' } } })).toEqual({
      availabilityMap: { locationName: 'Nakuru' },
    });
  });

  it.each([
    ['no state', undefined],
    ['a non-object state', 'state'],
    ['no page state', { returnTo: '/' }],
    ['a non-object page state', { returnTo: '/', pageState: 'map' }],
    ['an array page state', { returnTo: '/', pageState: ['map'] }],
  ])('returns nothing for %s', (_label, state) => {
    expect(getPageState(state)).toBeUndefined();
  });
});

describe('useRestoredPageState', () => {
  afterEach(() => setRestoredPageState(undefined));

  it('reads its part once, then forgets it so a later mount starts afresh', () => {
    setRestoredPageState({ availabilityMap: { locationName: 'Nakuru' }, availability: { searchValue: 'soil' } });

    const first = renderHook(() => useRestoredPageState<{ locationName: string }>('availabilityMap'));
    expect(first.result.current).toEqual({ locationName: 'Nakuru' });
    // Another part stays for its own reader
    expect(peekRestoredPageState('availability')).toEqual({ searchValue: 'soil' });

    first.unmount();
    expect(renderHook(() => useRestoredPageState('availabilityMap')).result.current).toBeUndefined();
  });

  it('keeps its part under StrictMode, which runs state initialisers and effects twice', () => {
    setRestoredPageState({ availabilityMap: { locationName: 'Nakuru' } });

    const { result } = renderHook(() => useRestoredPageState<{ locationName: string }>('availabilityMap'), {
      wrapper: React.StrictMode,
    });

    expect(result.current).toEqual({ locationName: 'Nakuru' });
  });

  it('ignores a part that is not an object', () => {
    setRestoredPageState({ availabilityMap: 'Nakuru' });

    expect(renderHook(() => useRestoredPageState('availabilityMap')).result.current).toBeUndefined();
  });
});
