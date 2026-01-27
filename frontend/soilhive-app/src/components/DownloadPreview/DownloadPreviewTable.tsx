import { PrimeReactProvider } from 'primereact/api';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { MultiSelect } from 'primereact/multiselect';
import styles from './DownloadPreviewTable.module.scss';
import { Button } from 'components/UI';
import NewspaperIcon from 'assets/icons/newspaper-icon.svg?react';
import MapPinIcon from 'assets/icons/small-map-icon.svg?react';
import { useState } from 'react';

const mockProducts: any[] = [];
for (let i = 1; i <= 60; i++) {
  const product = {
    date: `date-${i}`,
    depth: `depth-${i}`,
    valueUnit: `value/unit-${i}`,
    horizon: `horizon-${i}`,
    tecnique: `technique-${i}`,
    license: `license-${i}`,
    code: `code-${i}`,
    name: `name-${i}`,
    category: `category-${i}`,
    quantity: `quantity-${i}`,
    otherColumn1: `other-first-${i}`,
    otherColumn2: `other-second-${i}`,
  };
  mockProducts.push(product);
}

const mockColumns = [
  { name: 'Date', value: 'date' },
  { name: 'Depth (cm)', value: 'depth' },
  { name: 'Value / Unit', value: 'valueUnit' },
  { name: 'Horizon', value: 'horizon' },
  { name: 'Tecnique', value: 'tecnique' },
  { name: 'License', value: 'license' },
  { name: 'Code', value: 'code' },
  { name: 'Name', value: 'name' },
  { name: 'Category', value: 'category' },
  { name: 'Quantity', value: 'quantity' },
  { name: 'Other column', value: 'otherColumn1' },
  { name: 'Other column 2', value: 'otherColumn2' },
];

function DownloadPreviewTable() {
  const products: any[] = mockProducts;
  const columns: any[] = mockColumns;
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'date',
    'depth',
    'valueUnit',
    'horizon',
    'tecnique',
    'license',
    'code',
    'name',
    'category',
    'quantity',
  ]);

  const dateCell = (rowData: any) => {
    return (
      <Button type="tertiary">
        <MapPinIcon />
        {rowData.date}
      </Button>
    );
  };

  return (
    <div className={styles.DownloadPreviewTable}>
      <div className={styles.SectionTitle}>Tabular preview</div>
      <div className={styles.Content}>
        <div className={styles.TableControls}>
          <MultiSelect
            className={styles.MultiSelect}
            panelClassName={styles.MultiSelectPanel}
            itemClassName={styles.MultiSelectItem}
            value={visibleColumns}
            options={columns}
            onChange={e => setVisibleColumns(e.value)}
            optionLabel="name"
            optionValue="value"
            placeholder="Select columns to show"
          />
          <Button type="tertiary" className={styles.MetadataButton}>
            <NewspaperIcon />
            Metadata
          </Button>
        </div>
        <div className={styles.TableContainer}>
          <PrimeReactProvider>
            <DataTable
              value={products}
              paginator
              rows={20}
              resizableColumns
              columnResizeMode="expand"
              reorderableColumns
              removableSort
              scrollable
              scrollHeight="flex"
            >
              {columns
                .filter(({ value }) => visibleColumns.includes(value))
                .map(({ name, value }) => {
                  const options = {
                    field: value,
                    header: name,
                    ...(value === 'date'
                      ? {
                          bodyClassName: styles.DateCell,
                          body: dateCell,
                          headerClassName: styles.DateHeader,
                        }
                      : {}),
                  };
                  return <Column key={value} sortable {...options}></Column>;
                })}
            </DataTable>
          </PrimeReactProvider>
        </div>
      </div>
      <div className={styles.Footer}>
        This is just a preview of the soil data we have filtered by area and the filters you selected, to see all the data available,
        download it.
      </div>
    </div>
  );
}

export default DownloadPreviewTable;
