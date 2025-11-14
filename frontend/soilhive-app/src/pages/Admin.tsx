import { modules } from "../utilities/moduleFederation";
import { useAuthContext } from "../auth/AuthContextProvider";

function Admin() {

  const { isAuthenticated, isLoading, login, logout, token } = useAuthContext();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
    <div>
      <h2>Access denied. Please log in.</h2>
      <button onClick={ () => login() }>Login</button>
    </div>)
  }

  return (
    <div className="admin-page">
      <h1>Administration</h1>
      <p>This is the administration page</p>
      <h2>Installed modules</h2>
      <ol>
        { modules.map(({name, type, description}) => {
          return (
            <li key={name}>
              <h3>{name}</h3>
              <p>Type: {type}</p>
              <p>{description}</p>
            </li>
          );
        }) }
      </ol>
      <h2>Authenticated user: {token?.profile?.name}</h2>
      <button onClick={ () => logout() }>Logout</button>
    </div>
  );
};

export default Admin;
