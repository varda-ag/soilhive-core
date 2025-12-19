import { FilteringSidebarHeader } from './FilteringSidebarHeader/FilteringSidebarHeader';
import { FilteringSidebarContent } from './FilteringSidebarContent/FilteringSidebarContent';
import { FilteringSidebarMobileContent } from './FilteringSidebarMobileContent/FilteringSidebarMobileContent';
import { PageSidebar } from 'components/UI';
import useDevice from 'hooks/useDevice';

import styles from './FilteringSidebar.module.scss';

interface Props {
  isOpened: boolean;
  onClose: () => void;
}

export function FilteringSidebar({ isOpened, onClose }: Props) {
  const { isDesktopLayout } = useDevice();

  return (
    <PageSidebar className={styles.FilteringSidebar} isOpened={isOpened} position="right">
      <div className={styles.Wrapper}>
        {isDesktopLayout && <FilteringSidebarHeader onClose={onClose} />}
        {isDesktopLayout && <FilteringSidebarContent />}
        {!isDesktopLayout && <FilteringSidebarMobileContent />}
      </div>
    </PageSidebar>
  );
}
