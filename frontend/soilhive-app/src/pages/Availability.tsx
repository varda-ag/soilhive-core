import { useState } from 'react';
import { bboxPolygon } from '@turf/turf';

import SoilhiveMap from 'components/Map/SoilhiveMap';
import DatasetsIcon from 'assets/icons/paste-icon.svg?react';
import FiltersIcon from 'assets/icons/filter2-icon.svg?react';
import { Button } from 'components/UI';
import { DatasetsSidebar } from 'components/DatasetsSidebar/DatasetsSidebar';
import { FilteringSidebar } from 'components/FilteringSidebar/FilteringSidebar';
import { FiltersCounter } from 'components/FilteringSidebar/FiltersCounter/FiltersCounter';
import {
  AVAILABILITY_MOBILE_TABS,
  AvailabilityMobileNavigation,
  DEFAULT_AVAILABILITY_MOBILE_TAB,
} from 'components/AvailabilityMobileNavigation/AvailabilityMobileNavigation';
import useDevice from 'hooks/useDevice';
import useAvailability from 'hooks/useAvailability';
import type { SoilhiveMapSelectionChangeEvent } from 'components/Map/SoilhiveMapSelectionChangeEvent';

import styles from './Availability.module.scss';
import { useTranslation } from 'react-i18next';
import { getMapStyles } from '../utilities/map';

function Availability() {
  const [isDatasetsOpened, setIsDatasetsOpened] = useState<boolean>(true);
  const [isFiltersOpened, setIsFiltersOpened] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<string>(DEFAULT_AVAILABILITY_MOBILE_TAB);
  const { isDesktopLayout } = useDevice();

  const { boundingBox, setGeometryFilter, setSelectionType, setLocationName, setBoundingBox } = useAvailability();
  const { t } = useTranslation('availability');

  const handleMapSelectionChange = ({ bounds, geometries, selectionType, locationName }: SoilhiveMapSelectionChangeEvent) => {
    const geoms = geometries ?? [bboxPolygon(bounds).geometry];
    setGeometryFilter(geoms);
    setBoundingBox(bounds);
    setSelectionType(selectionType);
    setLocationName(locationName);

    if (isDesktopLayout && geometries) {
      setIsFiltersOpened(true);
    }
  };

  return (
    <div className={styles.Availability}>
      <div className={styles.Content}>
        <FilteringSidebar
          isOpened={isDesktopLayout ? isFiltersOpened : activeMobileTab === AVAILABILITY_MOBILE_TABS.FILTERS}
          onClose={() => setIsFiltersOpened(false)}
        />
        <SoilhiveMap
          initialViewBoundingBox={boundingBox}
          showGeocoder={true}
          showH3Cells={true}
          onSelectionChange={handleMapSelectionChange}
          geocoder={localStorage.getItem('MAP_GEOCODER') ?? ('nominatim' as any)}
          mapStyles={getMapStyles()}
        />
        <DatasetsSidebar
          isOpened={isDesktopLayout ? isDatasetsOpened : activeMobileTab === AVAILABILITY_MOBILE_TABS.DATASETS}
          onClose={() => setIsDatasetsOpened(false)}
        />
      </div>

      {isDesktopLayout && !isFiltersOpened && (
        <Button className={styles.FiltersButton} type="custom" onClick={() => setIsFiltersOpened(true)}>
          <FiltersIcon /> Filters <FiltersCounter />
        </Button>
      )}

      {isDesktopLayout && !isDatasetsOpened && (
        <Button className={styles.DatasetsButton} type="custom" onClick={() => setIsDatasetsOpened(true)}>
          <DatasetsIcon /> {t('availability_mobile_navigation.datasets')}
        </Button>
      )}

      {!isDesktopLayout && <AvailabilityMobileNavigation active={activeMobileTab} onChange={setActiveMobileTab} />}
    </div>
  );
}

export default Availability;
