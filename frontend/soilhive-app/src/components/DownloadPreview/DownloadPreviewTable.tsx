import { PrimeReactProvider } from 'primereact/api';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import styles from './DownloadPreviewTable.module.scss';

function DownloadPreviewTable() {
  const products: any[] = [
    { code: 'code1', name: 'Name 1', category: 'Category 1', quantity: 1 },
    { code: 'code2', name: 'Name 2', category: 'Category 2', quantity: 2 },
    { code: 'code3', name: 'Name 3', category: 'Category 3', quantity: 3 },
    { code: 'code4', name: 'Name 4', category: 'Category 4', quantity: 4 },
  ];

  return (
    <div className={styles.DownloadPreviewTable}>
      <div className={styles.SectionTitle}>Tabular preview</div>
      <div className={styles.Content}>
        <PrimeReactProvider>
          {/* <DataTable value={products} tableStyle={{ minWidth: '50rem' }}> */}
          <DataTable value={products}>
            <Column field="code" header="Code"></Column>
            <Column field="name" header="Name"></Column>
            <Column field="category" header="Category"></Column>
            <Column field="quantity" header="Quantity"></Column>
            <Column field="quantity" header="Other column"></Column>
            <Column field="quantity" header="Other column 2"></Column>
          </DataTable>
        </PrimeReactProvider>
      </div>
      <div className={styles.Footer}>
        This is just a preview of the soil data we have filtered by area and the filters you selected, to see all the data available,
        download it.
      </div>
    </div>
  );
}

export default DownloadPreviewTable;
