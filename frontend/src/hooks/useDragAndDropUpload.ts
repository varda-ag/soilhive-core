import { useCallback, useRef, useState } from 'react';
import type { Polygon, MultiPolygon } from 'geojson';
import { parseGeoJSONFile, type GeoJSONParseError } from '../utilities/parseGeoJSONFile';

export interface UseDragAndDropUploadOptions {
  onUpload: (geometry: Polygon | MultiPolygon) => void;
  onError?: (error: GeoJSONParseError) => void;
}

export interface DragAndDropUploadHandlers {
  isDragOver: boolean;
  onDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
}

/**
 * Drag-and-drop-upload wiring shared by the host's Availability page and any --with-map plugin
 * page that wants the same behavior — the nested-element enter/leave counter dance (drag events
 * fire repeatedly as the pointer crosses child element boundaries, not just the drop zone's own
 * edge) plus the parseGeoJSONFile -> onUpload glue, extracted so neither has to reimplement it.
 * See docs/frontend/plugin-development.md § "Uploading a polygon" for a plugin-side usage example.
 *
 * Deliberately decoupled from SoilhiveMapRef itself — takes a plain `onUpload` callback instead
 * of a ref, so it stays as dependency-light as parseGeoJSONFile. Spread the returned handlers onto
 * whatever DOM element should act as the drop zone; that's a page-owned decision (the host's drop
 * zone is its entire page, not just the map viewport) — not something this hook or SoilhiveMap
 * itself should assume. Likewise, `isDragOver` is exposed for the caller's own drop-zone overlay
 * (styling, copy, and error surfacing — e.g. the host's toast notifications vs. a plugin's own UI —
 * all differ per consumer).
 */
export function useDragAndDropUpload({ onUpload, onError }: UseDragAndDropUploadOptions): DragAndDropUploadHandlers {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const onDragEnter = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      void parseGeoJSONFile(file).then(result => {
        if (result.error) {
          onError?.(result.error);
          return;
        }
        onUpload(result.polygon);
      });
    },
    [onUpload, onError],
  );

  return { isDragOver, onDragEnter, onDragOver, onDragLeave, onDrop };
}
