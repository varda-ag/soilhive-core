import { Outlet } from 'react-router';
import { LookAndFeelProvider } from '../../../contexts/LookAndFeelContext';
import { LookAndFeelTabs } from 'components/AdminPortal/LookAndFeel/LookAndFeelTabs/LookAndFeelTabs';

import styles from './LookAndFeelLayout.module.scss';

export function LookAndFeelLayout() {
  return (
    <LookAndFeelProvider>
      <div className={styles.Layout}>
        <LookAndFeelTabs />
        <main className={styles.Content}>
          <Outlet />
        </main>
      </div>
    </LookAndFeelProvider>
  );
}
