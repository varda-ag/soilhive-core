import { render } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { MapSettings } from '../../../src/pages/AdminPortal/MapSettings/MapSettings';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/Map/GeocoderControl', () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

describe('MapSettings page', () => {
  it('matches snapshot', () => {
    (useTheme as jest.Mock).mockReturnValue({ themeConfig: { initialBbox: [0, 0, 1, 1] }, saveInitialBbox: jest.fn() });
    const { container } = render(<MapSettings />);
    expect(container).toMatchSnapshot();
  });
});
