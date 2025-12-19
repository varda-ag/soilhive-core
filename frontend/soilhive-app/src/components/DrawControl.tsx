/* eslint-disable */
import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import { useControl } from 'react-map-gl/maplibre';

import type { ControlPosition } from 'react-map-gl/maplibre';

// type DrawControlProps = ConstructorParameters<typeof TerradrawControlOptions>[0] & {
//   position?: ControlPosition;
//   // onCreate?: (evt: {features: object[]}) => void;
//   // onUpdate?: (evt: {features: object[]; action: string}) => void;
//   // onDelete?: (evt: {features: object[]}) => void;
// };

export default function DrawControl({ position = 'bottom-right', onFinish }: { position?: ControlPosition; onFinish: (feature: any) => {}}) {
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
      }),
    ({ map }) => {
      const drawInstance = drawControl.getTerraDrawInstance();
      drawInstance.on('ready', () => {
        drawInstance.setMode('polygon'); // TODO: NOT WORKING
      });
      drawInstance.on('finish', onDrawFinish);
    },
    ({ map }) => {
      const drawInstance = drawControl.getTerraDrawInstance();
      drawInstance?.off('finish', onDrawFinish);
    },
    {
      position,
    },
  );

  function onDrawFinish(event) {
    const drawInstance = drawControl.getTerraDrawInstance();
    const snapshot = drawInstance.getSnapshot();
    const feature = snapshot[0];
    onFinish(feature)
  }

  return null;
}

DrawControl.defaultProps = {
  onCreate: () => {},
  onUpdate: () => {},
  onDelete: () => {},
};
