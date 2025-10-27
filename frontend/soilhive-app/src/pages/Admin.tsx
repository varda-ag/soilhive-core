import { modules } from "../utilities/moduleFederation";

function Admin() {
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
    </div>
  );
};

export default Admin;
