import { TextInput } from 'components/UI';
import useAvailability from 'hooks/useAvailability';
import { useTranslation } from 'react-i18next';

import styles from './DatasetsFilters.module.scss';

export function DatasetsFilters() {
  const { t } = useTranslation('availability');
  const { searchValue, setSearchValue } = useAvailability();

  return (
    <div className={styles.DatasetsFilters}>
      <TextInput
        className={styles.Search}
        size="tiny"
        value={searchValue}
        placeholder={t('datasets_sidebar.search_by_name', 'Search by name')}
        onChange={setSearchValue}
      />
    </div>
  );
}
