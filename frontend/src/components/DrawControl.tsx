/* eslint-disable */
import { forwardRef, useImperativeHandle } from 'react';
import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import { useControl } from 'react-map-gl/maplibre';
import { TerraDrawPolygonMode } from 'terra-draw';

import type { ControlPosition } from 'react-map-gl/maplibre';

export type DrawControlRef = {
  reset: () => void;
};

const DrawControl = forwardRef<
  DrawControlRef,
  {
    position?: ControlPosition;
    onFinish: (feature: any) => void;
  }
>(function DrawControl({ position = 'bottom-right', onFinish }, ref) {
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
          // Omit the default self-intersection validation so concave
          // polygons (e.g. drawing around a coastline) can be drawn.
          polygon: new TerraDrawPolygonMode({ editable: true }),
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
