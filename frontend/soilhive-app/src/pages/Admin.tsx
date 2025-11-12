import { modules } from "../utilities/moduleFederation";
import { useAuthContext } from "../auth/AuthContextProvider";

function Admin() {

  const authContext = useAuthContext()

  return (
    <div className="admin-page">
      <h1>Administration</h1>
      <p>This is the administration page</p>
      <h2>Installed modules</h2>
      <ol>
        { modules.map(({shortName, name, type, description}) => {
          return (
            <li key={shortName}>
              <h3>{name}</h3>
              <p>Type: {type}</p>
              <p>Short name: {shortName}</p>
              <p>{description}</p>
            </li>
          );
        }) }
      </ol>
      <h2>Authorization</h2>
      <h3>Loged in user: {authContext.user?.profile?.name}</h3>
      {(
        authContext.isAuthenticated ? 
          <button onClick={() => authContext.logout()}>Logout</button>
          :
          <button onClick={() => authContext.login()}>Login</button>
      )}
    </div>
  );
};

export default Admin;
