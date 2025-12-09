import {Outlet } from 'react-router';
import styles from './MainLayout.module.scss'

import Header from 'components/Header/Header';

function MainLayout() {
  return (
    <>
      <Header></Header>
      <div className={styles.content}>
        <Outlet />
      </div>
    </>
  );
};

export default MainLayout;
