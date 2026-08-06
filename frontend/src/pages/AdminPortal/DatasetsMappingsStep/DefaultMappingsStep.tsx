import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMappingsStep, METADATA_FIELD_CODES } from 'hooks/useMappingsStep';
import { MappingsStep } from './MappingsStep';
import { MappingsTable } from './MappingsTable';
import { MappingRow } from './MappingRow';
import { DefaultMappingRowDetails } from './DefaultMappingRowDetails';
import { MappingFieldsPane } from './MappingFieldsPane';
import { INGESTION_DOCS_URL } from 'configuration/ingestion';
import { DataLoadingStartedPanel } from 'pages/AdminPortal/DatasetsPreviewStep/DataLoadingStartedPanel';
import { ADMIN_PATHS } from 'configuration/admin';

const DOCS_URL = `${INGESTION_DOCS_URL}#field-mapping--match-your-data`;

interface Props {
  id?: string;
}

export function DefaultMappingsStep({ id }: Props) {
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
  } = useMappingsStep(id);

  if (showLoadingPanel) {
    return <DataLoadingStartedPanel onContinue={() => navigate(ADMIN_PATHS.DATASETS)} />;
  }

  if (isImporting) {
    return <MappingFieldsPane />;
  }

  const columnMappingByName = Object.fromEntries(columnMappings.map(m => [m.columnName, m]));

  return (
    <MappingsStep
      datasetName={datasetName}
      title={t('datasets.mappings.title')}
      subtitle={t('datasets.mappings.subtitle')}
      docsLink={DOCS_URL}
      isRaster={false}
      mappedCount={mappedCount}
      unmappedCount={unmappedCount}
      messages={[geometryMessage, depthConflictMessage]}
      isSaveEnabled={isSaveEnabled}
      isContinueEnabled={isContinueEnabled}
      onPrevious={handlePrevious}
      onSaveAndContinueLater={handleSaveAndContinueLater}
      onContinue={handleContinue}
    >
      <MappingsTable
        dataTestId="sh-mappings-table"
        headerCells={[
          t('datasets.mappings.table.detected_columns'),
          t('datasets.mappings.table.map_to'),
          t('datasets.mappings.table.original_unit'),
        ]}
        columnMappings={columnMappings}
        renderRow={columnName => {
          const mapping = columnMappingByName[columnName];
          const unitOptions = mapping.conceptId ? (unitOptionsByConcept[mapping.conceptId] ?? []) : [];
          // Details panel only applies to soil properties, not structural fields
          const isDetailsEnabled = mapping.conceptId !== null && !METADATA_FIELD_CODES.has(mapping.conceptId);
          return (
            <MappingRow
              key={columnName}
              columnName={columnName}
              isMapped={mapping.conceptId !== null}
              conceptOptions={conceptOptionsByColumn[columnName] ?? []}
              unitOptions={unitOptions}
              conceptValue={mapping.conceptId}
              unitValue={mapping.unitId}
              isExpanded={expandedRows.has(columnName)}
              isUnitEnabled={mapping.conceptId !== null && unitOptions.length > 0}
              isDetailsEnabled={isDetailsEnabled}
              isGeometryDetectedField={mapping.isGeometryDetectedField}
              onToggle={toggleRow}
              onConceptChange={handleConceptChange}
              onUnitChange={handleUnitChange}
              detailsContent={
                <DefaultMappingRowDetails
                  columnName={columnName}
                  details={mapping.details}
                  detailOptions={detailOptions}
                  onDetailChange={handleDetailChange}
                />
              }
            />
          );
        }}
      />
    </MappingsStep>
  );
}
