import { Link, Outlet } from 'react-router';
import classnames from 'classnames'

import { singlePages } from '../utilities/moduleFederation';
import useTheme from '../hooks/useTheme';

import styles from './MainLayout.module.scss'

function MainLayout() {
  const {logo, theme} = useTheme();

  if (!theme) {
    return null;
  }
  
  return (
    <>
      <div className={classnames(styles.MenuWrapper, 'menu')}>
        {logo && <img src={logo} style={{width: '167px', height: '59px'}} />}
        <ul>
          <li><Link to="/">Home</Link></li>
          {singlePages.map(({route, name}) => 
            <li key={route}><Link to={`/${route}`}>{name}</Link></li>
          )}
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
