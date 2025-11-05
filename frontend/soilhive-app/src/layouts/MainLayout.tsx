import { Link, Outlet } from 'react-router';
import { singlePages, store } from '../utilities/moduleFederation';
// import { useCount } from "../store";

function MainLayout() {
  const [count, setCount] = store.useCount();
  return (
    <>
      <div className="menu">
        <ul>
          <li><Link to="/">Home</Link></li>
          {singlePages.map(({route, name}) => 
            <li key={route}><Link to={`/${route}`}>{name}</Link></li>
          )}
          <li><Link to="/donation">Donation</Link></li>
          <li><Link to="/admin">Admin</Link></li>
          <li>Counter: {count} <button onClick={() => setCount((cnt: any) => cnt + 1) }>Increment</button></li>
        </ul>
      </div>
      <div className="content">
        <Outlet />
      </div>
    </>
  );
};

export default MainLayout;
