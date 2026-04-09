import classnames from 'classnames';
import type { TabData } from 'types/components';

import styles from './Tabs.module.scss';

interface Props {
  className?: string;
  tabsData: TabData[];
  activeTab: string;
  onChange: (value: string) => void;
}

export function Tabs({ className, tabsData, activeTab, onChange }: Props) {
  return (
    <div data-testid="sh-ui-tabs" className={classnames(styles.Tabs, className)}>
      {tabsData.map(tab => (
        <button
          className={classnames(styles.Tab, {
            [styles.TabActive]: tab.value === activeTab,
          })}
          key={tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
