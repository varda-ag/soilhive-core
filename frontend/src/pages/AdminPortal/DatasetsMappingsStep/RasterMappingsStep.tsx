import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { TextInput } from 'components/UI';
import { useRasterMappingStep } from 'hooks/useRasterMappingStep';
import { MappingsStep } from './MappingsStep';
import { MappingsTable } from './MappingsTable';
import { MappingRow } from './MappingRow';
import { RasterMappingRowDetails } from './RasterMappingRowDetails';
import { MappingFieldsPane } from './MappingFieldsPane';
import { INGESTION_DOCS_URL } from 'configuration/ingestion';
import { DataLoadingStartedPanel } from 'pages/AdminPortal/DatasetsPreviewStep/DataLoadingStartedPanel';
import { ADMIN_PATHS } from 'configuration/admin';
import styles from './MappingRow.module.scss';

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

  const columnMappingByName = Object.fromEntries(columnMappings.map(m => [m.columnName, m]));

  return (
    <MappingsStep
      datasetName={datasetName}
      title={t('datasets.mappings.title_raster')}
      subtitle={t('datasets.mappings.subtitle_raster')}
      docsLink={DOCS_URL}
      isRaster={true}
      mappedCount={mappedCount}
      unmappedCount={unmappedCount}
      isContinueEnabled={isContinueEnabled}
      onPrevious={handlePrevious}
      onSaveAndContinueLater={handleSaveAndContinueLater}
      onContinue={handleContinue}
    >
      <MappingsTable
        dataTestId="sh-raster-mappings-table"
        headerCells={[
          t('datasets.mappings.table.detected_layers'),
          t('datasets.mappings.table.map_to'),
          t('datasets.mappings.table.original_unit'),
          t('datasets.mappings.table.min_max_depth'),
        ]}
        columnMappings={columnMappings}
        renderRow={columnName => {
          const mapping = columnMappingByName[columnName];
          const unitOptions = mapping.conceptId ? (unitOptionsByConcept[mapping.conceptId] ?? []) : [];
          const isDetailsEnabled = mapping.conceptId !== null;
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
              extraCell={
                <div className={styles.DepthCell}>
                  <TextInput
                    className={styles.DepthInput}
                    size="small"
                    type="number"
                    placeholder={t('datasets.mappings.row.depth_from_placeholder')}
                    value={mapping.minDepth ?? ''}
                    onChange={value => handleMinDepthChange(columnName, value)}
                  />
                  <TextInput
                    className={styles.DepthInput}
                    size="small"
                    type="number"
                    placeholder={t('datasets.mappings.row.depth_to_placeholder')}
                    value={mapping.maxDepth ?? ''}
                    onChange={value => handleMaxDepthChange(columnName, value)}
                  />
                </div>
              }
              detailsContent={
                <RasterMappingRowDetails
                  columnName={columnName}
                  details={mapping.details}
                  detailOptions={detailOptions}
                  referencePeriodStart={mapping.referencePeriodStart}
                  referencePeriodStop={mapping.referencePeriodStop}
                  layerDescription={mapping.layerDescription}
                  additionalResources={mapping.additionalResources}
                  onDetailChange={handleDetailChange}
                  onReferencePeriodStartChange={handleReferencePeriodStartChange}
                  onReferencePeriodStopChange={handleReferencePeriodStopChange}
                  onLayerDescriptionChange={handleLayerDescriptionChange}
                  onAdditionalResourcesChange={handleAdditionalResourcesChange}
                />
              }
            />
          );
        }}
      />
    </MappingsStep>
  );
}
