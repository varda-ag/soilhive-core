import { FilteringSidebarHeader } from './FilteringSidebarHeader/FilteringSidebarHeader';
import { FilteringSidebarContent } from './FilteringSidebarContent/FilteringSidebarContent';
import { FilteringSidebarMobileContent } from './FilteringSidebarMobileContent/FilteringSidebarMobileContent';
import { PageSidebar, FormMessage } from 'components/UI';
import useDevice from 'hooks/useDevice';
import { useTranslation } from 'react-i18next';
import useDataScopeFilters from 'hooks/useDataScopeFilters';
import useSoilPropertiesFilters from 'hooks/useSoilPropertiesFilters';
import { useRasterFilters } from 'hooks/useRasterFilters';

import styles from './FilteringSidebar.module.scss';
interface Props {
  isOpened: boolean;
  onClose: () => void;
}

export function FilteringSidebar({ isOpened, onClose }: Props) {
  const { t } = useTranslation('availability');
  const { isDesktopLayout } = useDevice();
  const { isLoading, hasUnavailableScopeSelected } = useDataScopeFilters();
  const { hasUnavailablePropertySelected } = useSoilPropertiesFilters();
  const { hasUnavailableRasterSelected } = useRasterFilters();

  return (
    <PageSidebar className={styles.FilteringSidebar} isOpened={isOpened} position="right">
      <div className={styles.Wrapper}>
        {isDesktopLayout && <FilteringSidebarHeader onClose={onClose} />}
        {!isLoading && (hasUnavailableScopeSelected || hasUnavailablePropertySelected || hasUnavailableRasterSelected) && (
          <div data-testid="sh-unavailable-filter-message" className={styles.WarningMessage}>
            <FormMessage message={t('filtering_sidebar.unavailable_notice')} type="warning" withBackground={true} />
          </div>
        )}
        {isDesktopLayout && <FilteringSidebarContent />}
        {!isDesktopLayout && <FilteringSidebarMobileContent />}
      </div>
    </PageSidebar>
  );
}
