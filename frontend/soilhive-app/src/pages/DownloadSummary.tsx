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

function DownloadSummary() {
  const navigate = useNavigate();
  const { t } = useTranslation('download');

  const [searchParams] = useSearchParams();
  const comingFromPreview = searchParams.get('source') === 'preview';
  const selectionType = searchParams.get('selectionType') ?? undefined;
  const locationName = searchParams.get('locationName') ?? undefined;

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

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
          <div className={styles.MainContent}>MainContent</div>
          <div className={classNames(styles.Footer, { [styles.Expanded]: summaryExpanded })}>
            <div className={styles.TermsOfUse}>
              <Checkbox
                inputId="agree-to-terms-for-download"
                name="category"
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
