import {Outlet } from 'react-router';

import Header from 'components/Header/Header';

function MainLayout() {
  return (
    <>
      <Header></Header>
      <div className="content">
        <Outlet />
      </div>
    </>
  );
};

export default MainLayout;
