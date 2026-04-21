import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Button } from 'components/UI';
import { useMappingsStep } from 'hooks/useMappingsStep';
import { MappingsBanner } from './MappingsBanner';
import { MappingsTable } from './MappingsTable';
import styles from './DatasetsMappingsStep.module.scss';

export function DatasetsMappingsStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  const {
    columnMappings,
    conceptOptions,
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

  return (
    <>
      <div className={styles.DatasetsMappingsStep}>
        <h2 className={styles.PageTitle}>{t('datasets.mappings.title')}</h2>
        <p className={styles.Subtitle}>{t('datasets.mappings.subtitle')}</p>

        <MappingsBanner mappedCount={mappedCount} unmappedCount={unmappedCount} />

        <MappingsTable
          columnMappings={columnMappings}
          conceptOptions={conceptOptions}
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
        <Button type="secondary" onClick={handleSaveAndContinueLater} dataTestId="sh-mappings-save-later" isDisabled={mappedCount === 0}>
          {t('datasets.actions.save_and_continue_later')}
        </Button>
        <Button type="primary" onClick={handleContinue} dataTestId="sh-mappings-continue" isDisabled={mappedCount === 0}>
          {t('datasets.actions.continue')}
        </Button>
      </div>
    </>
  );
}
