import { useState } from 'react';
import { Button } from 'components/UI';
import styles from './DownloadSummary.module.scss';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import { useNavigate, useSearchParams } from 'react-router';
import { Checkbox } from 'primereact/checkbox';
import { useDownloadSummary } from 'hooks/useDownloadSummary';
import DownloadDataSummary from 'components/DownloadDataSummary/DownloadDataSummary';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import CloudDownload from 'assets/images/cloud-download.svg?react';
import CheckIcon from 'assets/icons/small-check-mark-icon.svg?react';
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown';
import { PrimeReactProvider } from 'primereact/api';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';

const availableFormats = [
  { id: 'csv', name: 'CSV' },
  { id: 'geopackage', name: 'Geopackage' },
  { id: 'geojson', name: 'GeoJSON' },
  { id: 'shapefile', name: 'Shapefile' },
  { id: 'xlsx', name: 'XLSX' },
];

interface Dataset {
  id: string;
  name: string;
  license: string;
  numberOfDataPoints: string;
}

const datasets: Dataset[] = [
  {
    id: 'dataset-1',
    name: 'CAROB',
    license: 'CC BY 4.0, CC BY-NC-SA-3.0',
    numberOfDataPoints: '95 data points',
  },
  {
    id: 'dataset-2',
    name: 'WoSIS',
    license: 'CC BY 4.0, CC BY-NC 3.0, US Public Domain, CC BY-NC 4.0, CC BY 3.0, OGL-UK-3.0, CC BY-SA 4.0, CC0 1.0 ',
    numberOfDataPoints: '1,024 data points',
  },
  {
    id: 'dataset-3',
    name: 'Global Soil Nematode DB',
    license: 'CC BY 4.0',
    numberOfDataPoints: '25 data points',
  },
  {
    id: 'dataset-4',
    name: 'CAROB',
    license: 'CC BY 4.0, CC BY-NC-SA-3.0',
    numberOfDataPoints: '95 data points',
  },
  {
    id: 'dataset-5',
    name: 'WoSIS',
    license: 'CC BY 4.0, CC BY-NC 3.0, US Public Domain, CC BY-NC 4.0, CC BY 3.0, OGL-UK-3.0, CC BY-SA 4.0, CC0 1.0 ',
    numberOfDataPoints: '1,024 data points',
  },
  {
    id: 'dataset-6',
    name: 'Global Soil Nematode DB',
    license: 'CC BY 4.0',
    numberOfDataPoints: '25 data points',
  },
];

function DownloadSummary() {
  const navigate = useNavigate();
  const { t } = useTranslation('download');

  const [searchParams] = useSearchParams();
  const comingFromPreview = searchParams.get('source') === 'preview';
  const selectionType = searchParams.get('selectionType') ?? undefined;
  const locationName = searchParams.get('locationName') ?? undefined;

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<Dataset[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');
  const [showUpdatedMessage, setShowUpdatedMessage] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  const onFormatDropdownChange = (e: DropdownChangeEvent) => {
    setSelectedFormat(e.value);
    if (e.value !== selectedFormat) {
      setShowUpdatedMessage(true);
    }
  };

  const licensesCell = ({ license }: Dataset) => {
    const licenses = license.split(',');
    return (
      <>
        {licenses.map((licenseName, index) => (
          <span key={index}>
            <a href="http://www.soilhive.ag" target="_blank" rel="noopener noreferrer">
              {licenseName.trim()}
            </a>
            {index < licenses.length - 1 && <>, </>}
          </span>
        ))}
      </>
    );
  };

  const { geometryFeature, datasetsSummary, soilProperties, depthRange } = useDownloadSummary({ filterId: searchParams.get('filterId') });

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
            {comingFromPreview ? t('download_summary.back_to_preview') : t('download_summary.back_to_map')}
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
              <div>These are the datasets included in the download</div>
            </div>
            <div className={styles.TableContainer}>
              <PrimeReactProvider>
                <DataTable
                  value={datasets}
                  selectionMode="checkbox"
                  selection={selectedDatasets}
                  onSelectionChange={e => {
                    setSelectedDatasets(e.value);
                  }}
                  dataKey="id"
                  scrollable
                  scrollHeight="flex"
                >
                  <Column selectionMode="multiple"></Column>
                  <Column field="name" header="Dataset/s"></Column>
                  <Column field="license" header="License/s" body={licensesCell}></Column>
                  <Column field="numberOfDataPoints" header="Amount of data ≈"></Column>
                </DataTable>
              </PrimeReactProvider>
            </div>
            <div className={styles.FormatPicker}>
              <div className={styles.FormatPickerHeader}>
                <DownloadIcon />
                <div>Download Format</div>
              </div>
              <div className={styles.FormatPickerContent}>
                <Dropdown
                  className={styles.FormatPickerDropdown}
                  panelClassName={styles.FormatPickerDropdownPanel}
                  value={selectedFormat}
                  options={availableFormats}
                  onChange={onFormatDropdownChange}
                  optionValue="id"
                  optionLabel="name"
                />
                {showUpdatedMessage && (
                  <div className={styles.FormatPickerUpdatedMessage}>
                    <CheckIcon /> Download format updated
                  </div>
                )}
              </div>
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
            <Button size="medium" type="primary" className={styles.DownloadButton} isDisabled={!termsAgreed}>
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
