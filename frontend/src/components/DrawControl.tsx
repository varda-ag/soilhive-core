/* eslint-disable */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import { useControl } from 'react-map-gl/maplibre';
import { TerraDrawPolygonMode, ValidateNotSelfIntersecting } from 'terra-draw';

import type { ControlPosition } from 'react-map-gl/maplibre';

export type DrawControlRef = {
  reset: () => void;
};

// No host-only import here (no hooks/, no contexts/): the soilhive-plugin CLI copies this file
// into a plugin's Map/_shared/ as it is, and a plugin can't resolve those. Telling the visitor
// why a polygon was refused is up to whoever renders this, through onSelfIntersectingPolygon.
const DrawControl = forwardRef<
  DrawControlRef,
  {
    position?: ControlPosition;
    onFinish: (feature: any) => void;
    /** Called when a finished polygon's outline crosses itself. The polygon is refused and drawing goes on. */
    onSelfIntersectingPolygon?: () => void;
  }
>(function DrawControl({ position = 'bottom-right', onFinish, onSelfIntersectingPolygon }, ref) {
  // The polygon mode's validation closure below is created once (see useControl's
  // create factory, which never re-runs), so it reads the callback through a ref
  // that stays up to date on every render instead of capturing a stale value.
  const onSelfIntersectingPolygonRef = useRef(onSelfIntersectingPolygon);
  onSelfIntersectingPolygonRef.current = onSelfIntersectingPolygon;

  const drawControl = useControl<MaplibreTerradrawControl>(
    () =>
      new MaplibreTerradrawControl({
        modes: [
          // 'render',
          // 'point',
          // 'marker',
          // 'linestring',
          'polygon',
          'rectangle',
          'circle',
          // 'freehand',
          // 'freehand-linestring',
          // 'angled-rectangle',
          // 'sensor',
          // 'sector',
          // 'select',
          // 'delete-selection',
          // 'delete',
          // 'download'
        ],
        open: true,
        modeOptions: {
          polygon: new TerraDrawPolygonMode({
            editable: true,
            // Only check for self-intersection once drawing finishes (concave
            // shapes are allowed; checking on every committed vertex, terra-draw's
            // default, would reject legitimate concave polygons - e.g. tracing a
            // coastline - whose in-progress edges cross before the shape is closed).
            // terra-draw silently keeps drawing on a failed finish validation with
            // no event, so we report the failure here directly.
            validation: (feature, context) => {
              if (context.updateType !== 'finish') return { valid: true };

              const result = ValidateNotSelfIntersecting(feature);
              if (!result.valid) {
                onSelfIntersectingPolygonRef.current?.();
              }
              return result;
            },
          }),
        },
      }),
    () => {
      const drawInstance = drawControl.getTerraDrawInstance();
      drawInstance.on('ready', () => {
        drawInstance.setMode('polygon'); // TODO: NOT WORKING
      });
      drawInstance.on('finish', onDrawFinish);
    },
    () => {
      const drawInstance = drawControl.getTerraDrawInstance();
      drawInstance?.off('finish', onDrawFinish);
    },
    {
      position,
    },
  );

  useImperativeHandle(ref, () => ({
    reset() {
      const drawInstance = drawControl.getTerraDrawInstance();
      const currentMode = drawInstance.getMode();
      drawInstance.clear();
      drawInstance.setMode(currentMode);
    },
  }));

  function onDrawFinish() {
    const drawInstance = drawControl.getTerraDrawInstance();
    const snapshot = drawInstance.getSnapshot();
    const feature = snapshot[0];
    onFinish(feature);
  }

  return null;
});

export default DrawControl;
