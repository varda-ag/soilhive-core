import { Outlet } from 'react-router';
import Header from 'components/Header/Header';

import styles from './MainLayout.module.scss';

export function MainLayout() {
  return (
    <>
      <Header></Header>
      <div className={styles.content}>
        <Outlet />
      </div>
    </>
  );
}
