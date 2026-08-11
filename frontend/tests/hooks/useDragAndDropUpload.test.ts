import { act, renderHook, waitFor } from '@testing-library/react';
import { useDragAndDropUpload } from 'hooks/useDragAndDropUpload';
import { parseGeoJSONFile } from 'utilities/parseGeoJSONFile';
import type { Polygon } from 'geojson';

jest.mock('utilities/parseGeoJSONFile', () => ({
  parseGeoJSONFile: jest.fn(),
}));

const mockParseGeoJSONFile = parseGeoJSONFile as jest.Mock;

function dragEvent(files: File[] = []): React.DragEvent<HTMLElement> {
  return {
    preventDefault: jest.fn(),
    dataTransfer: { files },
  } as unknown as React.DragEvent<HTMLElement>;
}

describe('useDragAndDropUpload', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('sets isDragOver on the first dragEnter and keeps it true across nested enters, clearing only once dragLeave brings the counter back to 0', () => {
    const { result } = renderHook(() => useDragAndDropUpload({ onUpload: jest.fn() }));

    act(() => result.current.onDragEnter(dragEvent()));
    expect(result.current.isDragOver).toBe(true);

    // A child element's own enter/leave churn — shouldn't flip isDragOver off prematurely.
    act(() => result.current.onDragEnter(dragEvent()));
    act(() => result.current.onDragLeave(dragEvent()));
    expect(result.current.isDragOver).toBe(true);

    act(() => result.current.onDragLeave(dragEvent()));
    expect(result.current.isDragOver).toBe(false);
  });

  it('does nothing on drop when no file was dropped', () => {
    const onUpload = jest.fn();
    const { result } = renderHook(() => useDragAndDropUpload({ onUpload }));

    act(() => result.current.onDrop(dragEvent([])));

    expect(mockParseGeoJSONFile).not.toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('parses the dropped file and forwards the polygon to onUpload, clearing isDragOver', async () => {
    const polygon: Polygon = { type: 'Polygon', coordinates: [[[0, 0]]] };
    mockParseGeoJSONFile.mockResolvedValue({ polygon });
    const onUpload = jest.fn();
    const file = new File(['{}'], 'shape.geojson');
    const { result } = renderHook(() => useDragAndDropUpload({ onUpload }));

    act(() => result.current.onDragEnter(dragEvent()));
    expect(result.current.isDragOver).toBe(true);

    act(() => result.current.onDrop(dragEvent([file])));

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(polygon));
    expect(mockParseGeoJSONFile).toHaveBeenCalledWith(file);
    expect(result.current.isDragOver).toBe(false);
  });

  it('reports a parse error via onError instead of calling onUpload', async () => {
    const error = { id: 'invalid-polygon' as const, message: 'Uploaded file does not contain any valid Polygon or MultiPolygon' };
    mockParseGeoJSONFile.mockResolvedValue({ error });
    const onUpload = jest.fn();
    const onError = jest.fn();
    const file = new File(['{}'], 'shape.geojson');
    const { result } = renderHook(() => useDragAndDropUpload({ onUpload, onError }));

    act(() => result.current.onDrop(dragEvent([file])));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(onUpload).not.toHaveBeenCalled();
  });
});
