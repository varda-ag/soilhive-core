import classnames from 'classnames';
import { DatasetsSidebarHeader } from './DatasetsSidebarHeader/DatasetsSidebarHeader';
import { DatasetsSidebarSummary } from './DatasetsSidebarSummary/DatasetsSidebarSummary';
import { DatasetsList } from './DatasetsList/DatasetsList';
import { Button } from 'components/UI';

import styles from './DatasetsSidebar.module.scss';

interface Props {
  isOpened: boolean;
  onClose: () => void;
}

export function DatasetsSidebar({ isOpened, onClose }: Props) {
  return (
    <div className={classnames(styles.DatasetsSidebar, { [styles.Opened]: isOpened })}>
      <div className={styles.Wrapper}>
        <DatasetsSidebarHeader onClose={onClose} />
        <DatasetsSidebarSummary />
        <DatasetsList />
        <div className={styles.Action}>
          <Button className={styles.Button} isDisabled={true}>
            Download data
          </Button>
        </div>
      </div>
    </div>
  );
}
