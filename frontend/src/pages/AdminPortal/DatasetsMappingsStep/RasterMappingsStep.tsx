import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from 'components/UI';
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
    handleMinDepthChange,
    handleMaxDepthChange,
    handleDetailChange,
    handleReferencePeriodStartChange,
    handleReferencePeriodStopChange,
    handleLayerDescriptionChange,
    handleAdditionalResourcesChange,
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

        <RasterMappingsTable
          columnMappings={columnMappings}
          conceptOptionsByColumn={conceptOptionsByColumn}
          unitOptionsByConcept={unitOptionsByConcept}
          detailOptions={detailOptions}
          expandedRows={expandedRows}
          onToggleRow={toggleRow}
          onConceptChange={handleConceptChange}
          onUnitChange={handleUnitChange}
          onMinDepthChange={handleMinDepthChange}
          onMaxDepthChange={handleMaxDepthChange}
          onDetailChange={handleDetailChange}
          onReferencePeriodStartChange={handleReferencePeriodStartChange}
          onReferencePeriodStopChange={handleReferencePeriodStopChange}
          onLayerDescriptionChange={handleLayerDescriptionChange}
          onAdditionalResourcesChange={handleAdditionalResourcesChange}
        />
      </div>

      <div className={styles.Actions}>
        <Button type="secondary" onClick={handlePrevious} dataTestId="sh-mappings-previous">
          {t('datasets.actions.previous')}
        </Button>
        <div className={styles.ActionsSpacer} />
        <Button type="secondary" onClick={handleSaveAndContinueLater} dataTestId="sh-mappings-save-later">
          {t('datasets.actions.save_and_continue_later')}
        </Button>
        <Button type="primary" onClick={handleContinue} dataTestId="sh-mappings-continue" isDisabled={!isContinueEnabled}>
          {t('datasets.actions.continue')}
        </Button>
      </div>
    </>
  );
}
