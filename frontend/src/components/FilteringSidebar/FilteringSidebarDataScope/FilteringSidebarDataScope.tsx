import { TimeFilter } from './TimeFilter/TimeFilter';
import { Accordion, MultiselectButtons, SelectionPills } from 'components/UI';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import useDataScopeFilters from 'hooks/useDataScopeFilters';
import { useTranslation } from 'react-i18next';

import styles from './FilteringSidebarDataScope.module.scss';

export function FilteringSidebarDataScope() {
  const { t } = useTranslation('availability');
  const {
    isLoading,
    datasetFrontendFilters,
    typeFilterOptions,
    typeFilterPills,
    accessFilterOptions,
    accessFilterPills,
    timeFilterPills,
    typeFilterPillRemove,
    accessFilterPillRemove,
    handleTimeFilterChange,
    setFrontendFilters,
  } = useDataScopeFilters();

  return (
    <div className={styles.FilteringSidebarDataScope}>
      <Accordion
        title={t('filtering_sidebar_content.data_type', 'Data type')}
        type="secondary"
        pillsSlot={typeFilterPills.length ? <SelectionPills selections={typeFilterPills} onRemove={typeFilterPillRemove} /> : null}
      >
        {isLoading ? (
          <span data-testid="skeleton-container-data-type">
            <Skeleton count={1} height={26} />
          </span>
        ) : (
          <div className={styles.AccordionContent}>
            <MultiselectButtons
              items={typeFilterOptions}
              selected={datasetFrontendFilters.type}
              onChange={selected => setFrontendFilters(selected, 'type')}
            />
          </div>
        )}
      </Accordion>
      <Accordion
        title={t('filtering_sidebar_content.time', 'Time')}
        type="secondary"
        pillsSlot={timeFilterPills ? <SelectionPills selections={timeFilterPills} onRemove={() => handleTimeFilterChange({})} /> : null}
      >
        {isLoading ? (
          <span data-testid="skeleton-container-time">
            <Skeleton count={1} height={110} />
          </span>
        ) : (
          !timeFilterPills && <TimeFilter />
        )}
      </Accordion>
      <Accordion
        title={t('filtering_sidebar_content.data_access', 'Data access')}
        type="secondary"
        pillsSlot={accessFilterPills.length ? <SelectionPills selections={accessFilterPills} onRemove={accessFilterPillRemove} /> : null}
      >
        <div className={styles.AccordionContent}>
          <MultiselectButtons
            items={accessFilterOptions}
            selected={datasetFrontendFilters.visibility}
            onChange={selected => setFrontendFilters(selected, 'visibility')}
          />
        </div>
      </Accordion>
    </div>
  );
}
