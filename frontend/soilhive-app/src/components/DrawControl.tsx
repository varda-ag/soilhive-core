import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw'
import {useControl} from 'react-map-gl/maplibre';

import type {ControlPosition} from 'react-map-gl/maplibre';

// type DrawControlProps = ConstructorParameters<typeof TerradrawControlOptions>[0] & {
//   position?: ControlPosition;
//   // onCreate?: (evt: {features: object[]}) => void;
//   // onUpdate?: (evt: {features: object[]; action: string}) => void;
//   // onDelete?: (evt: {features: object[]}) => void;
// };

export default function DrawControl({position = 'bottom-right'}: {position?: ControlPosition;}) {
  function onFinish(event) {
    console.log('On finish event', arguments);
  }

  const drawControl = useControl<MaplibreTerradrawControl>(
    () => new MaplibreTerradrawControl({
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
        'select',
        'delete-selection',
        'delete',
        // 'download'
      ],
      open: true,
    }),
    ({map}) => {
      const drawInstance = drawControl.getTerraDrawInstance();
      // drawInstance.on('select', onEvent);
      drawInstance.on('finish', () => {
        const snapshot = drawInstance.getSnapshot();
        console.log('Features', snapshot);
      });
      // drawInstance.on('select', onEvent);
      // onAddEvent.map.on('select', onEvent);
      // map.on('draw.update', props.onUpdate);
      // map.on('draw.delete', props.onDelete);
    },
    ({map}) => {
      const drawInstance = drawControl.getTerraDrawInstance();
      drawInstance.off('finish', onFinish);
      // map.off('draw.create', props.onCreate);
      // map.off('draw.update', props.onUpdate);
      // map.off('draw.delete', props.onDelete);
    },
    {
      position
    }
  );

  return null;
}

DrawControl.defaultProps = {
  onCreate: () => {},
  onUpdate: () => {},
  onDelete: () => {}
};