import { Link, Outlet } from 'react-router';

function MainLayout() {
  return (
    <>
      <div className="menu">
        <ul>
          <li><Link to="/">Home</Link></li>
          <li><Link to="/comparavailability">Comparavailability</Link></li>
          <li><Link to="/donation">Donation</Link></li>
          <li><Link to="/admin">Admin</Link></li>
        </ul>
      </div>
      <div className="content">
        <Outlet />
      </div>
    </>
  );
};

export default MainLayout;
