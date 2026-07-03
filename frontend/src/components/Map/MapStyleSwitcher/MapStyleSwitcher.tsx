import { type Dispatch } from 'react';
import type { MapStyles } from 'types/components';

import { MapStyleSwitcherDesktop } from './MapStyleSwitcherDesktop/MapStyleSwitcherDesktop';
import { MapStyleSwitcherMobile } from './MapStyleSwitcherMobile/MapStyleSwitcherMobile';
import useDevice from 'hooks/useDevice';

interface Props {
  mapStyles: MapStyles;
  currentValue: number;
  className?: string;
  onMapStyleChange: Dispatch<number>;
}
export function MapStyleSwitcher({ mapStyles, currentValue, className, onMapStyleChange }: Props) {
  const { isMobileLayout } = useDevice();
  const props = { mapStyles, currentValue, className, onMapStyleChange };

  return isMobileLayout ? <MapStyleSwitcherMobile {...props} /> : <MapStyleSwitcherDesktop {...props} />;
}
