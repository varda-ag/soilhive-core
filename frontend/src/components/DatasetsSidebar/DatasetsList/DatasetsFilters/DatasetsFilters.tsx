import { useEffect, useRef } from 'react';
import { TextInput } from 'components/UI';
import useAvailability from 'hooks/useAvailability';
import { useDebounce } from 'hooks/useDebounce';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS } from 'configuration/analytics';
import { trackEvent } from 'utilities/analytics';

import styles from './DatasetsFilters.module.scss';

// Sent once the text stops changing for this long, as the earlier SoilHive platform sent its keyword search
const SEARCH_TRACKING_DELAY_MS = 1000;
const MIN_TRACKED_SEARCH_LENGTH = 2;

export function DatasetsFilters() {
  const { t } = useTranslation('availability');
  const { searchValue, setSearchValue, datasets } = useAvailability();
  const { value: settledSearchValue } = useDebounce(searchValue, SEARCH_TRACKING_DELAY_MS);
  // Not the text a sign-in brought back (docs/adr/0075): only what the visitor typed here
  const hasTyped = useRef(false);

  useEffect(() => {
    const text = settledSearchValue.trim();
    if (!hasTyped.current || text.length < MIN_TRACKED_SEARCH_LENGTH) return;
    trackEvent(ANALYTICS_EVENTS.DATASET_NAME_SEARCH, { dataset_name_search_text: text, result_count: datasets.length });
    // datasets is read when the text settles, not watched: a list refetched later is no new search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledSearchValue]);

  const onChange = (value: string) => {
    hasTyped.current = true;
    setSearchValue(value);
  };

  return (
    <div className={styles.DatasetsFilters}>
      <TextInput
        className={styles.Search}
        size="tiny"
        value={searchValue}
        placeholder={t('datasets_sidebar.search_by_name')}
        onChange={onChange}
      />
    </div>
  );
}
