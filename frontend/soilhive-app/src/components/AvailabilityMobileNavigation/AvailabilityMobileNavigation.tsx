import MapIcon from 'assets/icons/earth-icon.svg?react';
import FiltersIcon from 'assets/icons/filter2-icon.svg?react';
import DatasetsMobileIcon from 'assets/icons/newspaper-icon.svg?react';
import { MobileTabNavigation } from 'components/UI';
import type { MobileTabNavigationConfig } from 'types/components';

export const AVAILABILITY_MOBILE_TABS = {
  MAP: 'map',
  DATASETS: 'datasets',
  FILTERS: 'filters',
};

export const DEFAULT_AVAILABILITY_MOBILE_TAB = AVAILABILITY_MOBILE_TABS.MAP;

type Props = {
  active: string;
  onChange: (id: string) => void;
};

export function AvailabilityMobileNavigation({ active, onChange }: Props) {
  const config: MobileTabNavigationConfig[] = [
    {
      name: 'Map',
      id: AVAILABILITY_MOBILE_TABS.MAP,
      Icon: MapIcon,
    },
    {
      name: 'Filters',
      id: AVAILABILITY_MOBILE_TABS.FILTERS,
      Icon: FiltersIcon,
    },
    {
      name: 'Datasets',
      id: AVAILABILITY_MOBILE_TABS.DATASETS,
      Icon: DatasetsMobileIcon,
    },
  ];

  return <MobileTabNavigation config={config} active={active} onChange={onChange} />;
}
