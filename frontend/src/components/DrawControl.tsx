/* eslint-disable */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import { useControl } from 'react-map-gl/maplibre';
import { useTranslation } from 'react-i18next';
import { TerraDrawPolygonMode, ValidateNotSelfIntersecting } from 'terra-draw';
import useNotifications from 'hooks/useNotifications';

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
  const { showNotification } = useNotifications();
  const { t } = useTranslation('common');

  // The polygon mode's validation closure below is created once (see useControl's
  // create factory, which never re-runs), so it reads showNotification through a
  // ref that stays up to date on every render instead of capturing a stale value.
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;

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
            // no event, so we surface the failure to the user here directly.
            validation: (feature, context) => {
              if (context.updateType !== 'finish') return { valid: true };

              const result = ValidateNotSelfIntersecting(feature);
              if (!result.valid) {
                showNotificationRef.current({
                  id: 'polygon-self-intersecting',
                  title: t('map.draw.self_intersecting_error.title'),
                  message: t('map.draw.self_intersecting_error.message'),
                  type: 'error',
                });
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
