import { useState, useRef, useCallback } from 'react';
import { bboxPolygon } from '@turf/turf';

import SoilhiveMap, { type SoilhiveMapRef } from 'components/Map/SoilhiveMap';
import DatasetsIcon from 'assets/icons/paste-icon.svg?react';
import FiltersIcon from 'assets/icons/filter2-icon.svg?react';
import UploadIcon from 'assets/icons/big-cloud-upload-icon.svg?react';
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
import useAvailabilityMap from 'hooks/useAvailabilityMap';
import useNotifications from 'hooks/useNotifications';
import type { SoilhiveMapSelectionChangeEvent } from 'components/Map/SoilhiveMapSelectionChangeEvent';
import { parseGeoJSONFile } from '../utilities/parseGeoJSONFile';

import styles from './Availability.module.scss';
import { useTranslation } from 'react-i18next';
import { getMapStyles } from '../utilities/map';

function Availability() {
  const [isDatasetsOpened, setIsDatasetsOpened] = useState<boolean>(true);
  const [isFiltersOpened, setIsFiltersOpened] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<string>(DEFAULT_AVAILABILITY_MOBILE_TAB);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const mapRef = useRef<SoilhiveMapRef>(null);

  const { isDesktopLayout } = useDevice();
  const { showNotification } = useNotifications();
  const { boundingBox, setGeometryFilter, setSelectionType, setLocationName, setBoundingBox } = useAvailabilityMap();
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

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const onDragLeave = useCallback((_event: React.DragEvent<HTMLDivElement>) => {
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      const result = await parseGeoJSONFile(file);
      if (result.error) {
        showNotification({ id: result.error.id, title: 'Upload failed', message: result.error.message });
        return;
      }

      mapRef.current?.onUpload(result.polygon);
    },
    [showNotification],
  );

  return (
    <div className={styles.Availability} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragOver && (
        <div className="soilhive-map-drop-overlay">
          <div className="soilhive-map-drop-overlay-content">
            <UploadIcon />
            <p className="soilhive-map-drop-overlay-message">{t('map.drop_file_message')}</p>
            <p className="soilhive-map-drop-overlay-caption">{t('map.drop_file_caption')}</p>
          </div>
        </div>
      )}
      <div className={styles.Content}>
        <FilteringSidebar
          isOpened={isDesktopLayout ? isFiltersOpened : activeMobileTab === AVAILABILITY_MOBILE_TABS.FILTERS}
          onClose={() => setIsFiltersOpened(false)}
        />
        <SoilhiveMap
          ref={mapRef}
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
