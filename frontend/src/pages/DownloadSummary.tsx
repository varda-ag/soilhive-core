import { useState } from 'react';
import useDevice from 'hooks/useDevice';
import { Button } from 'components/UI';
import styles from './DownloadSummary.module.scss';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import { useNavigate, useSearchParams } from 'react-router';
import { Checkbox } from 'primereact/checkbox';
import { useDownloadSummary, type DownloadSummaryDataset } from 'hooks/useDownloadSummary';
import DownloadDataSummary from 'components/DownloadDataSummary/DownloadDataSummary';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import CloudDownload from 'assets/images/cloud-download.svg?react';
import CheckIcon from 'assets/icons/small-check-mark-icon.svg?react';
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown';
import { PrimeReactProvider } from 'primereact/api';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import useDownloads from 'hooks/useDownloads';
import { useOnceDefined } from 'hooks/useOnceDefined';
import Skeleton from 'react-loading-skeleton';
import { GISDataType } from '../types/backend';

// console.debug(numberFormatter.format(1234567));
// Output: "1.234.567"
const numberFormatter = new Intl.NumberFormat('de-DE');

export type FormatOption = { id: string; name: string; formats: string[] };

export const VECTOR_FORMAT_OPTIONS: FormatOption[] = [
  { id: 'csv', name: 'CSV', formats: ['csv'] },
  { id: 'gpkg', name: 'Geopackage', formats: ['gpkg'] },
  { id: 'geojson', name: 'GeoJSON', formats: ['geojson'] },
  { id: 'shp', name: 'Shapefile', formats: ['shp'] },
  { id: 'xlsx', name: 'XLSX', formats: ['xlsx'] },
];

export const RASTER_FORMAT_OPTIONS: FormatOption[] = [
  { id: 'tiff', name: 'Geotiff', formats: ['tiff'] },
  { id: 'gpkg', name: 'Geopackage', formats: ['gpkg'] },
];

export const MIXED_FORMAT_OPTIONS: FormatOption[] = [
  { id: 'csv+tiff', name: 'CSV + Geotiff', formats: ['csv', 'tiff'] },
  { id: 'gpkg', name: 'Geopackage', formats: ['gpkg'] },
  { id: 'geojson+tiff', name: 'GeoJSON + Geotiff', formats: ['geojson', 'tiff'] },
  { id: 'shp+tiff', name: 'Shapefile + Geotiff', formats: ['shp', 'tiff'] },
  { id: 'xlsx+tiff', name: 'XLSX + Geotiff', formats: ['xlsx', 'tiff'] },
];

function DownloadSummary() {
  const navigate = useNavigate();
  const { t } = useTranslation('download');
  const { isMobileLayout } = useDevice();
  const { startDownload, setIsOpened } = useDownloads();

  const [searchParams] = useSearchParams();
  const comingFromDataExplorer = searchParams.get('source') === 'explore';
  const selectionType = searchParams.get('selectionType') ?? undefined;
  const locationName = searchParams.get('locationName') ?? undefined;
  const filterId = searchParams.get('filterId') ?? null;
  const datasetsParam = searchParams.get('datasets') ?? undefined;
  const datasetsIds = datasetsParam ? datasetsParam.split(',') : [];

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<DownloadSummaryDataset[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');
  const [showUpdatedMessage, setShowUpdatedMessage] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  const onFormatDropdownChange = (e: DropdownChangeEvent) => {
    setSelectedFormat(e.value);
    if (e.value !== selectedFormat) {
      setShowUpdatedMessage(true);
    }
  };

  const onDownloadButtonClick = () => {
    if (filterId) {
      startDownload({ filter_id: filterId, dataset_ids: selectedDatasets.map(dataset => dataset.id), formats: [selectedFormat] });
      setIsOpened(true);
      navigate('/');
    }
  };

  const licensesCell = ({ licenses }: DownloadSummaryDataset) => {
    return (
      <>
        {licenses.map(({ id, name, url }, index) => (
          <span key={id}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {name}
            </a>
            {index < licenses.length - 1 && <>, </>}
          </span>
        ))}
      </>
    );
  };

  const dataCountCell = ({ dataType, layerCount }: DownloadSummaryDataset) => {
    const formattedCount = numberFormatter.format(layerCount);
    return (
      <>
        {formattedCount} {dataType === GISDataType.RASTER ? t('download_summary.raster_layers') : t('download_summary.data_points')}
      </>
    );
  };

  const loaderCell = () => <Skeleton count={1} height={12} width="100%" />;
  const { datasets, geometryFeature, datasetsSummary, soilProperties, depthRange, isLoading } = useDownloadSummary({
    filterId,
    datasetsIds,
  });

  // Select all datasets the first time they are loaded
  useOnceDefined(datasets, newDatasets => {
    setSelectedDatasets(newDatasets);
  });

  return (
    <div className={styles.DownloadSummary}>
      <div className={styles.Header}>
        <div className={styles.Titles}>
          <span className={styles.Title}>{t('download_summary.page_title')}</span>
          <span className={styles.SubTitle}>{t('download_summary.page_subtitle')}</span>
        </div>
        <div className={styles.Buttons}>
          <Button
            dataTestId="download-preview-back-button"
            className={styles.BackButton}
            type="secondary"
            onClick={() => {
              navigate(-1);
            }}
          >
            <ArrowLeftIcon />
            {comingFromDataExplorer ? t('download_summary.back_to_data_explorer') : t('download_summary.back_to_map')}
          </Button>
        </div>
      </div>
      <div className={styles.Content}>
        <div className={styles.Sidebar}>
          <DownloadDataSummary
            responsive={false}
            selectionType={selectionType}
            geometryFeature={geometryFeature}
            locationName={locationName}
            dataPoints={datasetsSummary.dataPoints}
            rasterLayers={datasetsSummary.layers}
            depthRange={depthRange}
            soilProperties={soilProperties}
            expanded={summaryExpanded}
            onExpandClicked={newExpanded => setSummaryExpanded(newExpanded)}
          />
        </div>
        <div className={styles.Main}>
          <div className={styles.MainContent}>
            <div className={styles.MainContentHeader}>
              <CloudDownload />
            </div>
            <div className={styles.FormatPicker}>
              <div className={styles.FormatPickerHeader}>
                <DownloadIcon />
                <div>{t('download_summary.download_format')}</div>
              </div>
              <div className={styles.FormatPickerContent}>
                <Dropdown
                  className={styles.FormatPickerDropdown}
                  panelClassName={styles.FormatPickerDropdownPanel}
                  value={selectedFormat}
                  options={VECTOR_FORMAT_OPTIONS}
                  onChange={onFormatDropdownChange}
                  optionValue="id"
                  optionLabel="name"
                />
                {showUpdatedMessage && (
                  <div className={styles.FormatPickerUpdatedMessage}>
                    <CheckIcon /> {t('download_summary.download_format_updated')}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.TableContainer}>
              <PrimeReactProvider>
                <DataTable
                  disabled={isLoading}
                  value={datasets}
                  selectionMode="checkbox"
                  selection={selectedDatasets}
                  onSelectionChange={e => {
                    setSelectedDatasets(e.value);
                  }}
                  dataKey="id"
                  scrollable
                  scrollHeight="flex"
                  emptyMessage={t('download_summary.loading')}
                >
                  <Column selectionMode="multiple"></Column>
                  <Column field="name" header={t('download_summary.dataset_column_header')}></Column>
                  <Column
                    field="licenses"
                    header={t('download_summary.licenses_column_header')}
                    body={isLoading ? loaderCell : licensesCell}
                  ></Column>
                  <Column
                    field="layerCount"
                    header={t('download_summary.amount_of_data_column_header')}
                    body={isLoading ? loaderCell : dataCountCell}
                  ></Column>
                </DataTable>
              </PrimeReactProvider>
            </div>
          </div>
          <div className={classNames(styles.Footer, { [styles.Expanded]: summaryExpanded })}>
            <div className={styles.TermsOfUse}>
              <Checkbox
                inputId="agree-to-terms-for-download"
                name="agree-to-terms-for-download"
                checked={termsAgreed}
                onChange={e => {
                  setTermsAgreed(e.checked ?? false);
                }}
              />
              <label htmlFor="agree-to-terms-for-download">
                {t('download_summary.terms_label_prefix')}{' '}
                <a href="https://soilhive.ag" target="_blank" rel="noreferrer">
                  {t('download_summary.terms_link')}
                </a>
              </label>
            </div>
            <Button
              size="medium"
              type="primary"
              className={styles.DownloadButton}
              isDisabled={isMobileLayout || isLoading || !termsAgreed || selectedDatasets.length === 0}
              onClick={onDownloadButtonClick}
            >
              <DownloadIcon />
              {t('download_summary.download_button')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DownloadSummary;
