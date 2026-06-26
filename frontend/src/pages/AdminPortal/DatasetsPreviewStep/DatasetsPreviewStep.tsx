import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { MultiSelect } from 'primereact/multiselect';
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown';
import { Tooltip } from 'react-tooltip';

import TooltipIcon from 'assets/icons/small-info-icon.svg?react';
import { Button, Table, ToggleButton } from 'components/UI';
import type { TableHandle } from 'components/UI/Table/Table';
import { useIngestionStatus } from 'hooks/useIngestionStatus';
import { useDatasetPreview } from 'hooks/useDatasetPreviewStep';
import { DeleteCheckboxCell } from './DeleteCheckboxCell';
import { DataLoadingStartedPanel } from './DataLoadingStartedPanel';
import { PreviewStepSummary } from './PreviewStepSummary/PreviewStepSummary';
import { IngestionStepTitleRow } from 'components/AdminPortal/IngestionStepTitleRow/IngestionStepTitleRow';
import { INGESTION_DOCS_URL } from 'configuration/ingestion';

import styles from './DatasetsPreviewStep.module.scss';

const DOCS_URL = `${INGESTION_DOCS_URL}#data-preview`;

const initialVisibleColumns = ['min_depth', 'max_depth', 'sampling_date', 'horizon'];

export function DatasetsPreviewStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();
  const { isLoading: isIngestionLoading, updateFurthestStep } = useIngestionStatus();

  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const mirrorScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapperDiv = tableWrapperRef.current;
    const mirror = mirrorScrollRef.current;
    if (!wrapperDiv || !mirror) return;

    const scrollEl = (wrapperDiv.querySelector('.p-datatable-wrapper') as HTMLElement) ?? wrapperDiv;
    const mirrorInner = mirror.firstElementChild as HTMLElement;

    const updateWidth = () => {
      mirrorInner.style.width = `${scrollEl.scrollWidth}px`;
    };
    updateWidth();

    const tableEl = wrapperDiv.querySelector('table');
    const ro = new ResizeObserver(updateWidth);
    ro.observe(tableEl ?? scrollEl);

    const toMirror = () => {
      mirror.scrollLeft = scrollEl.scrollLeft;
    };
    const toScrollEl = () => {
      scrollEl.scrollLeft = mirror.scrollLeft;
    };

    scrollEl.addEventListener('scroll', toMirror);
    mirror.addEventListener('scroll', toScrollEl);

    return () => {
      ro.disconnect();
      scrollEl.removeEventListener('scroll', toMirror);
      mirror.removeEventListener('scroll', toScrollEl);
    };
  }, []);

  const hasTracked = useRef(false);
  useEffect(() => {
    if (!hasTracked.current && id && !isIngestionLoading) {
      hasTracked.current = true;
      updateFurthestStep(id, 'preview');
    }
  }, [id, isIngestionLoading, updateFurthestStep]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const tableHandleRef = useRef<TableHandle>(null);
  const [showOriginalName, setShowOriginalName] = useState<boolean>(false);

  const {
    datasetName,
    datasetFileMappings,
    soilData,
    allSoilData,
    availableColumns,
    isLoading,
    onFileChange,
    selectedFile,
    loadMore,
    onSortChange,
    sortField,
    sortOrder,
    computedPropertyNames,
    unitsMapping,
    currentFileDeletions,
    toggleDeletion,
    showLoadingPanel,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
    navigateToDatasets,
  } = useDatasetPreview(id);

  const columnsTranslations = useMemo(
    (): Record<string, string> => ({
      lat: t('datasets.preview.columns.lat'),
      long: t('datasets.preview.columns.long'),
      min_depth: t('datasets.preview.columns.min_depth'),
      max_depth: t('datasets.preview.columns.max_depth'),
      sampling_date: t('datasets.preview.columns.sampling_date'),
      horizon: t('datasets.preview.columns.horizon'),
      delete: t('datasets.preview.columns.delete'),
      license: t('datasets.preview.columns.license'),
    }),
    [t],
  );

  const columnFilterOptions = useMemo(
    () => [
      ...availableColumns.map(columnKey => {
        return {
          name: columnsTranslations[columnKey] || computedPropertyNames?.[columnKey] || columnKey,
          value: columnKey,
        };
      }),
    ],
    [availableColumns, columnsTranslations, computedPropertyNames],
  );

  const tableColumns = useMemo(() => {
    const extraColumns = availableColumns.filter(col => !initialVisibleColumns.includes(col));
    const orderedKeys = [...initialVisibleColumns.filter(col => availableColumns.includes(col)), ...extraColumns];
    return orderedKeys.map(columnKey => {
      const name = columnsTranslations[columnKey] || computedPropertyNames?.[columnKey] || columnKey;
      return {
        name: (
          <>
            <p className={styles.ColumnName}>{name}</p>
            {showOriginalName && <p style={{ fontWeight: 'normal' }}>{columnKey}</p>}
            {!!unitsMapping[columnKey] && <p>({unitsMapping[columnKey]})</p>}
          </>
        ),
        value: columnKey,
        sortable: true,
        headerTooltip: name.length > 16 ? name : undefined,
        bodyTemplate: (row: Record<string, unknown>) => (row[columnKey] ?? '-') as ReactNode,
      };
    });
  }, [availableColumns, columnsTranslations, computedPropertyNames, showOriginalName, unitsMapping]);

  useEffect(() => {
    tableHandleRef.current?.resetColumnOrder();
    const el = tableHandleRef.current?.getElement();
    if (!el) return;
    const prIdAttr = Array.from(el.attributes).find(attr => attr.name.startsWith('pr_id'));
    if (!prIdAttr) return;
    document.querySelectorAll('style').forEach(style => {
      if (style.textContent?.includes(prIdAttr.name)) style.remove();
    });
  }, [visibleColumns]);

  const handleColumnsChange = useCallback((newCols: string[]) => {
    setVisibleColumns(newCols);
  }, []);

  const filteredTableColumns = useMemo(
    () => [
      ...tableColumns.filter(column => visibleColumns.includes(column.value)),
      {
        // name: t('datasets.preview.columns.delete'),
        name: (
          <div>
            <p
              className={styles.ColumnNameTooltip}
              data-tooltip-id="delete-tooltip"
              data-tooltip-content={t('datasets.preview.deletion_warning')}
            >
              {t('datasets.preview.columns.delete')}
              <TooltipIcon className={styles.Icon} />
              <Tooltip id="delete-tooltip" positionStrategy="fixed" place="left" />
            </p>
          </div>
        ),
        value: 'delete',
        reorderable: false,
        bodyTemplate: (row: { record_id: number }) => (
          <div className={styles.DeleteCell}>
            <DeleteCheckboxCell
              key={`${selectedFile}-${row.record_id}`}
              recordId={row.record_id}
              isInitiallyChecked={currentFileDeletions.has(row.record_id)}
              toggleDeletion={toggleDeletion}
            />
          </div>
        ),
      },
    ],
    [tableColumns, visibleColumns, t, currentFileDeletions, toggleDeletion, selectedFile],
  );

  useEffect(() => {
    if (availableColumns.length && !visibleColumns.length) {
      const propertyColumns = availableColumns.filter(column => column !== 'license' && !initialVisibleColumns.includes(column));
      const availableInitialColumns = initialVisibleColumns.filter(col => availableColumns.includes(col));
      setVisibleColumns([...availableInitialColumns, ...propertyColumns]);
    }
  }, [availableColumns, visibleColumns]);

  const filesOptions = useMemo(() => {
    return datasetFileMappings?.map(mapping => ({ name: mapping.fileID, id: mapping.fileID })) || [];
  }, [datasetFileMappings]);

  const handleFileChange = useCallback(
    (event: DropdownChangeEvent) => {
      onFileChange(event.value);
    },
    [onFileChange],
  );

  if (showLoadingPanel) {
    return <DataLoadingStartedPanel onContinue={navigateToDatasets} />;
  }

  return (
    <>
      <div className={styles.DatasetsPreviewStep}>
        <div className={styles.TextContent}>
          <IngestionStepTitleRow title={t('datasets.preview.title')} datasetName={datasetName} docsLink={DOCS_URL} />
          <p className={styles.Message}>{t('datasets.preview.message')}</p>
        </div>
        <div className={styles.FileSelection}>
          <Dropdown
            className={styles.FilesFilter}
            value={selectedFile}
            options={filesOptions}
            onChange={handleFileChange}
            optionValue="id"
            optionLabel="name"
            disabled={isLoading}
          />
          <PreviewStepSummary removedByUser={currentFileDeletions.size} />
        </div>
        <div className={styles.TableFilters}>
          <div className={styles.Left}>
            <ToggleButton checked={showOriginalName} onChange={() => setShowOriginalName(prevValue => !prevValue)} />
            {t('datasets.preview.show_original_name')}
          </div>

          <div className={styles.Right}>
            <MultiSelect
              className={styles.ColumnsFilter}
              value={visibleColumns}
              options={columnFilterOptions}
              onChange={e => handleColumnsChange(e.value)}
              optionLabel="name"
              optionValue="value"
              disabled={isLoading}
            />
          </div>
        </div>
        <div className={styles.TableWrapper} ref={tableWrapperRef}>
          <Table
            tableRef={tableHandleRef}
            value={allSoilData}
            columns={filteredTableColumns}
            columnClassName={styles.TableColumn}
            defaultSortField={sortField}
            defaultSortOrder={sortOrder}
            reorderableColumns={true}
            dataKey="cursor"
            emptyMessage={!allSoilData.length && (isLoading || !!soilData?.length) ? t('datasets.preview.loading') : ''}
            onScrollNearBottom={loadMore}
            onSort={onSortChange}
          />
          <div ref={mirrorScrollRef} className={styles.StickyScrollbar}>
            <div />
          </div>
        </div>
      </div>
      <div className={styles.Actions}>
        <Button type="secondary" onClick={handlePrevious} dataTestId="sh-preview-previous">
          {t('datasets.actions.previous')}
        </Button>
        <div className={styles.ActionsSpacer} />
        <Button type="secondary" onClick={handleSaveAndContinueLater} dataTestId="sh-preview-save-later">
          {t('datasets.actions.save_and_continue_later')}
        </Button>
        <Button type="primary" onClick={handleContinue} dataTestId="sh-preview-continue">
          {t('datasets.actions.continue')}
        </Button>
      </div>
    </>
  );
}
