import { renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useMapInfoCardsHook } from 'hooks/useMapInfoCardsHook';
import useRemotes from 'hooks/useRemotes';
import { usePluginContext } from 'hooks/usePluginContext';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import { PluginType, type MapInfoCardEntry, type MapInfoCardPlugin } from '../../src/types/plugins';
import type { MapSelection } from '../../src/contexts/AvailabilityMapContext';

jest.mock('react-router', () => ({ useNavigate: jest.fn() }));
jest.mock('hooks/useRemotes', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/usePluginContext', () => ({ usePluginContext: jest.fn() }));
jest.mock('hooks/useDataFilterQuery', () => ({ useDataFilterQuery: jest.fn() }));

const useRemotesMock = useRemotes as jest.Mock;
const useDataFilterQueryMock = useDataFilterQuery as jest.Mock;
const navigate = jest.fn();

const Page = () => null;
const card: MapInfoCardPlugin = { pluginId: 'soilhive-dashboards-page', name: 'Dashboards', type: PluginType.MAP_INFO_CARD, Page };
const entry: MapInfoCardEntry = { card, route: 'dashboards' };
const baseContext = { metadataUrl: jest.fn() };

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};
const selection: MapSelection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: polygon, properties: {} } as GeoJSON.GeoJSON],
};
const emptySelection: MapSelection = { type: 'FeatureCollection', features: [] };

describe('useMapInfoCardsHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    (usePluginContext as jest.Mock).mockReturnValue(baseContext);
    useRemotesMock.mockReturnValue({ mapInfoCards: [entry] });
    useDataFilterQueryMock.mockReturnValue({ filterId: 'filter-1' });
  });

  it('gives each card the plugin context, the selection filter id and its Page', () => {
    const { result } = renderHook(() => useMapInfoCardsHook(selection));

    expect(result.current.cards).toEqual([
      {
        key: 'soilhive-dashboards-page',
        Page,
        context: { ...baseContext, mapSelectionFilterId: 'filter-1', navigateToOwnPage: expect.any(Function) },
      },
    ]);
    expect(useDataFilterQueryMock).toHaveBeenCalledWith({ geometries: [polygon], parameters: {} }, true);
  });

  it('navigates to a path under the plugin route', () => {
    const { result } = renderHook(() => useMapInfoCardsHook(selection));

    result.current.cards[0].context.navigateToOwnPage?.('new?filterId=filter-1');

    expect(navigate).toHaveBeenCalledWith('/dashboards/new?filterId=filter-1');
  });

  it('refuses a path outside the plugin route', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useMapInfoCardsHook(selection));

    result.current.cards[0].context.navigateToOwnPage?.('../admin');

    expect(navigate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not save a filter when there are no cards', () => {
    useRemotesMock.mockReturnValue({ mapInfoCards: [] });

    const { result } = renderHook(() => useMapInfoCardsHook(selection));

    expect(result.current.cards).toEqual([]);
    expect(useDataFilterQueryMock).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('does not save a filter when nothing is selected', () => {
    renderHook(() => useMapInfoCardsHook(emptySelection));

    expect(useDataFilterQueryMock).toHaveBeenCalledWith({ geometries: [], parameters: {} }, false);
  });
});
