import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button, FormMessage } from 'components/UI';
import { useRasterMappingStep } from 'hooks/useRasterMappingStep';
import { MappingsBanner } from './MappingsBanner';
import { RasterMappingsTable } from './RasterMappingsTable';
import { MappingFieldsPane } from './MappingFieldsPane';
import { IngestionStepTitleRow } from 'components/AdminPortal/IngestionStepTitleRow/IngestionStepTitleRow';
import { INGESTION_DOCS_URL } from 'configuration/ingestion';
import { DataLoadingStartedPanel } from 'pages/AdminPortal/DatasetsPreviewStep/DataLoadingStartedPanel';
import { ADMIN_PATHS } from 'configuration/admin';

import styles from './RasterMappingsStep.module.scss';

const DOCS_URL = `${INGESTION_DOCS_URL}#field-mapping--match-your-data`;

interface Props {
  id?: string;
}

export function RasterMappingsStep({ id }: Props) {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();

  const {
    datasetName,
    isImporting,
    showLoadingPanel,
    geometryMessage,
    depthConflictMessage,
    isSaveEnabled,
    isContinueEnabled,
    columnMappings,
    conceptOptionsByColumn,
    unitOptionsByConcept,
    detailOptions,
    mappedCount,
    unmappedCount,
    expandedRows,
    toggleRow,
    handleConceptChange,
    handleUnitChange,
    handleDetailChange,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
  } = useRasterMappingStep(id);

  if (showLoadingPanel) {
    return <DataLoadingStartedPanel onContinue={() => navigate(ADMIN_PATHS.DATASETS)} />;
  }

  if (isImporting) {
    return <MappingFieldsPane />;
  }

  return (
    <>
      <div className={styles.RasterMappingsStep}>
        <IngestionStepTitleRow
          className={styles.TitleRow}
          title={t('datasets.mappings.title_raster')}
          datasetName={datasetName}
          docsLink={DOCS_URL}
        />
        <p className={styles.Subtitle}>{t('datasets.mappings.subtitle_raster')}</p>

        <MappingsBanner mappedCount={mappedCount} unmappedCount={unmappedCount} isRaster={true} />

        {(geometryMessage || depthConflictMessage) && (
          <div className={styles.Messages}>
            {geometryMessage && <FormMessage type={geometryMessage.type} message={geometryMessage.message} withBackground />}
            {depthConflictMessage && <FormMessage type={depthConflictMessage.type} message={depthConflictMessage.message} withBackground />}
          </div>
        )}

        <RasterMappingsTable
          columnMappings={columnMappings}
          conceptOptionsByColumn={conceptOptionsByColumn}
          unitOptionsByConcept={unitOptionsByConcept}
          detailOptions={detailOptions}
          expandedRows={expandedRows}
          onToggleRow={toggleRow}
          onConceptChange={handleConceptChange}
          onUnitChange={handleUnitChange}
          onDetailChange={handleDetailChange}
        />
      </div>

      <div className={styles.Actions}>
        <Button type="secondary" onClick={handlePrevious} dataTestId="sh-mappings-previous">
          {t('datasets.actions.previous')}
        </Button>
        <div className={styles.ActionsSpacer} />
        <Button type="secondary" onClick={handleSaveAndContinueLater} dataTestId="sh-mappings-save-later" isDisabled={!isSaveEnabled}>
          {t('datasets.actions.save_and_continue_later')}
        </Button>
        <Button type="primary" onClick={handleContinue} dataTestId="sh-mappings-continue" isDisabled={!isContinueEnabled}>
          {t('datasets.actions.continue')}
        </Button>
      </div>
    </>
  );
}
