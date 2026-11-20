import { render } from '@testing-library/react';
import { ValidateNotSelfIntersecting } from 'terra-draw';
import DrawControl from 'components/DrawControl';

// useControl's create factory runs once, on the first render, like the real one
jest.mock('react-map-gl/maplibre', () => ({
  useControl: (create: () => unknown) => {
    const ref = jest.requireActual('react').useRef(null);
    if (ref.current === null) ref.current = create();
    return ref.current;
  },
}));

jest.mock('@watergis/maplibre-gl-terradraw', () => ({
  MaplibreTerradrawControl: jest.fn(),
}));

const mockPolygonModeOptions = jest.fn();
jest.mock('terra-draw', () => ({
  TerraDrawPolygonMode: jest.fn().mockImplementation(options => {
    mockPolygonModeOptions(options);
  }),
  ValidateNotSelfIntersecting: jest.fn(),
}));

const feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} };

function validatePolygon(updateType: 'finish' | 'commit' | 'provisional') {
  const { validation } = mockPolygonModeOptions.mock.lastCall[0];
  return validation(feature, { updateType });
}

describe('DrawControl', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('refuses a finished polygon whose outline crosses itself, and reports it', () => {
    (ValidateNotSelfIntersecting as jest.Mock).mockReturnValue({ valid: false, reason: 'self-intersecting' });
    const onSelfIntersectingPolygon = jest.fn();
    render(<DrawControl onFinish={jest.fn()} onSelfIntersectingPolygon={onSelfIntersectingPolygon} />);

    expect(validatePolygon('finish')).toEqual({ valid: false, reason: 'self-intersecting' });
    expect(onSelfIntersectingPolygon).toHaveBeenCalledTimes(1);
  });

  it('accepts a finished polygon whose outline does not cross itself, without reporting anything', () => {
    (ValidateNotSelfIntersecting as jest.Mock).mockReturnValue({ valid: true });
    const onSelfIntersectingPolygon = jest.fn();
    render(<DrawControl onFinish={jest.fn()} onSelfIntersectingPolygon={onSelfIntersectingPolygon} />);

    expect(validatePolygon('finish')).toEqual({ valid: true });
    expect(onSelfIntersectingPolygon).not.toHaveBeenCalled();
  });

  it('does not check a polygon still being drawn, so a concave shape can be finished', () => {
    const onSelfIntersectingPolygon = jest.fn();
    render(<DrawControl onFinish={jest.fn()} onSelfIntersectingPolygon={onSelfIntersectingPolygon} />);

    expect(validatePolygon('commit')).toEqual({ valid: true });
    expect(ValidateNotSelfIntersecting).not.toHaveBeenCalled();
    expect(onSelfIntersectingPolygon).not.toHaveBeenCalled();
  });

  it('reports through the latest callback, although the check itself is set up only once', () => {
    (ValidateNotSelfIntersecting as jest.Mock).mockReturnValue({ valid: false });
    const first = jest.fn();
    const latest = jest.fn();
    const { rerender } = render(<DrawControl onFinish={jest.fn()} onSelfIntersectingPolygon={first} />);
    rerender(<DrawControl onFinish={jest.fn()} onSelfIntersectingPolygon={latest} />);

    validatePolygon('finish');

    expect(mockPolygonModeOptions).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('still refuses the polygon when no callback was given', () => {
    (ValidateNotSelfIntersecting as jest.Mock).mockReturnValue({ valid: false });
    render(<DrawControl onFinish={jest.fn()} />);

    expect(validatePolygon('finish')).toEqual({ valid: false });
  });
});
