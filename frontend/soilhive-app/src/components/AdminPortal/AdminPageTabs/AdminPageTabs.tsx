import classnames from 'classnames';
import type { TabData } from 'types/components';
import { Tabs } from 'components/UI';

import styles from './AdminPageTabs.module.scss';

interface Props {
  className?: string;
  tabsData: TabData[];
  activeTab: string;
  onChange: (value: string) => void;
  children?: React.ReactNode;
}

export function AdminPageTabs({ className, tabsData, activeTab, onChange, children }: Props) {
  return (
    <div data-testid="sh-adminpage-tabs" className={classnames(styles.AdminPageTabs, className)}>
      <Tabs tabsData={tabsData} activeTab={activeTab} onChange={onChange} />
      <div className={styles.Actions}>{children}</div>
    </div>
  );
}
