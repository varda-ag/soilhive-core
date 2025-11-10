import { Link, Outlet } from 'react-router';
import { singlePages } from '../utilities/moduleFederation';

function MainLayout() {
  return (
    <>
      <div className="menu">
        <ul>
          <li><Link to="/">Home</Link></li>
          {singlePages.map(({route, name}) => 
            <li key={route}><Link to={`/${route}`}>{name}</Link></li>
          )}
          <li><Link to="/admin">Admin</Link></li>
          <li>Counter: {123} <button>Increment</button></li>
        </ul>
      </div>
      <div className="content">
        <Outlet />
      </div>
    </>
  );
};

export default MainLayout;
