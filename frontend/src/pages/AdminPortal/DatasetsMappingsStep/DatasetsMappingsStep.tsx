import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Button, FormMessage } from 'components/UI';
import { useMappingsStep } from 'hooks/useMappingsStep';
import { MappingsBanner } from './MappingsBanner';
import { MappingsTable } from './MappingsTable';
import { MappingFieldsPane } from './MappingFieldsPane';
import { IngestionStepTitleRow } from 'components/AdminPortal/IngestionStepTitleRow/IngestionStepTitleRow';
import { INGESTION_DOCS_URL } from 'configuration/ingestion';

import styles from './DatasetsMappingsStep.module.scss';

const DOCS_URL = `${INGESTION_DOCS_URL}#field-mapping--match-your-data`;

export function DatasetsMappingsStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  const {
    datasetName,
    isImporting,
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
  } = useMappingsStep(id);

  if (isImporting) {
    return <MappingFieldsPane />;
  }

  return (
    <>
      <div className={styles.DatasetsMappingsStep}>
        <IngestionStepTitleRow
          className={styles.TitleRow}
          title={t('datasets.mappings.title')}
          datasetName={datasetName}
          docsLink={DOCS_URL}
        />
        <p className={styles.Subtitle}>{t('datasets.mappings.subtitle')}</p>

        <MappingsBanner mappedCount={mappedCount} unmappedCount={unmappedCount} />

        {(geometryMessage || depthConflictMessage) && (
          <div className={styles.Messages}>
            {geometryMessage && <FormMessage type={geometryMessage.type} message={geometryMessage.message} withBackground />}
            {depthConflictMessage && <FormMessage type={depthConflictMessage.type} message={depthConflictMessage.message} withBackground />}
          </div>
        )}

        <MappingsTable
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
