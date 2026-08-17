import { useState, useRef, useCallback } from 'react';
import { bboxPolygon } from '@turf/turf';
import type { LngLat } from 'maplibre-gl';

import SoilhiveMap, { type SoilhiveMapRef } from 'components/Map/SoilhiveMap';
import { AreaInfoPopup, AreaInfoBar } from 'components/Map/AreaInfo';
import { UploadPolygonModal } from 'components/Map/UploadPolygonModal/UploadPolygonModal';
import { MapStyleSwitcher } from 'components/Map/MapStyleSwitcher/MapStyleSwitcher';
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
import useAvailability from 'hooks/useAvailability';
import useNotifications from 'hooks/useNotifications';
import useTheme from 'hooks/useTheme';
import { useDai } from 'hooks/useDai';
import { useDragAndDropUpload } from 'hooks/useDragAndDropUpload';
import type { SoilhiveMapSelectionChangeEvent } from 'components/Map/SoilhiveMapSelectionChangeEvent';

import styles from './Availability.module.scss';
import { useTranslation } from 'react-i18next';
import { getMapStyles } from '../utilities/map';

function Availability() {
  const [isDatasetsOpened, setIsDatasetsOpened] = useState<boolean>(true);
  const [isFiltersOpened, setIsFiltersOpened] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<string>(DEFAULT_AVAILABILITY_MOBILE_TAB);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [daiViewport, setDaiViewport] = useState<{ bbox: [number, number, number, number]; resolution: number } | null>(null);
  const [currentMapStyleIndex, setCurrentMapStyleIndex] = useState(0);
  const mapRef = useRef<SoilhiveMapRef>(null);
  const mapStyles = getMapStyles();

  const { isDesktopLayout } = useDevice();
  const { showNotification } = useNotifications();
  const { themeConfig } = useTheme();
  const { filterId, isLoadingPartialFilter } = useAvailability();

  // SoilhiveMap no longer reads AvailabilityMapContext itself — this page owns it and passes the
  // whole thing through as `selectionState`, plus pulls out the fields it needs for its own
  // composition (the DAI query and the info-card, both of which used to live inside SoilhiveMap).
  const availabilityMap = useAvailabilityMap();
  const {
    boundingBox,
    setGeometryFilter,
    setSelectionType,
    setLocationName,
    setBoundingBox,
    selectedPoint,
    setSelectedPoint,
    showDrawControl,
    selection,
    locationName,
    isDaiEnabled,
    setIsDaiEnabled,
    daiOpacity,
    setDaiOpacity,
  } = availabilityMap;

  const { t } = useTranslation('availability');

  const { dai, isLoading: isDaiLoading } = useDai(
    filterId,
    daiViewport?.bbox,
    daiViewport?.resolution,
    isDaiEnabled && !!filterId && !isLoadingPartialFilter && daiViewport !== null,
  );

  const isAreaInfoVisible = Boolean(selectedPoint) && !showDrawControl;

  const onAreaInfoClose = useCallback(() => {
    setSelectedPoint(null);
  }, [setSelectedPoint]);

  const handleMapSelectionChange = ({
    bounds,
    geometries,
    selectionType,
    locationName: newLocationName,
  }: SoilhiveMapSelectionChangeEvent) => {
    const geoms = geometries ?? [bboxPolygon(bounds).geometry];
    setGeometryFilter(geoms);
    setBoundingBox(bounds);
    setSelectionType(selectionType);
    setLocationName(newLocationName);

    if (isDesktopLayout && geometries) {
      setIsFiltersOpened(true);
    }
  };

  const { isDragOver, onDragEnter, onDragOver, onDragLeave, onDrop } = useDragAndDropUpload({
    onUpload: geometry => mapRef.current?.onUpload(geometry),
    onError: error => showNotification({ id: error.id, title: 'Upload failed', message: error.message }),
  });

  // UploadPolygonModal calls its own onClose after a successful upload — this just forwards the
  // geometry to the same SoilhiveMapRef.onUpload path drag-and-drop already uses.
  const onUploadFromModal = useCallback((geometry: Parameters<SoilhiveMapRef['onUpload']>[0]) => {
    mapRef.current?.onUpload(geometry);
  }, []);

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
          onUploadClick={() => setIsUploadModalOpen(true)}
          geocoder={localStorage.getItem('MAP_GEOCODER') ?? ('nominatim' as any)}
          mapStyles={mapStyles}
          currentMapStyleIndex={currentMapStyleIndex}
          selectionState={availabilityMap}
          dai={{
            data: dai,
            isLoading: isDaiLoading,
            isEnabled: isDaiEnabled,
            opacity: daiOpacity,
            showWidget: themeConfig.daiConfig?.isEnabled,
            isWidgetDefaultExpanded: themeConfig.daiConfig?.defaultValue,
            onToggle: () => setIsDaiEnabled(prevValue => !prevValue),
            onOpacityChange: setDaiOpacity,
            onViewportChange: setDaiViewport,
          }}
          footer={
            !isDesktopLayout && isAreaInfoVisible ? (
              <AreaInfoBar onClose={onAreaInfoClose} locationName={locationName} selection={selection} />
            ) : undefined
          }
        >
          {isDesktopLayout && isAreaInfoVisible && (
            <AreaInfoPopup
              selectedPoint={selectedPoint as LngLat}
              onClose={onAreaInfoClose}
              locationName={locationName}
              selection={selection}
            />
          )}
          {mapStyles.length > 1 && (
            <MapStyleSwitcher
              className="map-style-switcher"
              mapStyles={mapStyles}
              currentValue={currentMapStyleIndex}
              onMapStyleChange={setCurrentMapStyleIndex}
            />
          )}
        </SoilhiveMap>
        <UploadPolygonModal visible={isUploadModalOpen} onUpload={onUploadFromModal} onClose={() => setIsUploadModalOpen(false)} />
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
