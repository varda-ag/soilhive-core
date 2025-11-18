import { useId, useState } from "react";
import { modules } from "../utilities/moduleFederation";
import { useAuthContext } from "../auth/AuthContextProvider";
import {ThemeConfig} from './ThemeConfig'

function Admin() {
  const { isAuthenticated, isLoading, login, logout, user } = useAuthContext();
  
  const mapGeocoderInputId = useId();
  const [mapGeocoder, setMapGeocoder] = useState(localStorage.getItem('MAP_GEOCODER') ?? 'nominatim');
  

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
      <h2>Authenticated user: {user?.profile?.name}</h2>
      <button onClick={ () => logout() }>Logout</button>

      <h2>Maps:</h2>
      <div>
        <label htmlFor={mapGeocoderInputId}>Geocoder API</label>
        <select name="map-geocoder"
          id={mapGeocoderInputId} 
          defaultValue={mapGeocoder}
          onChange={
            event => {
              const selectedGeocoder = event.target.value;
              localStorage.setItem('MAP_GEOCODER', selectedGeocoder);
              setMapGeocoder(selectedGeocoder);
            } 
          }
        >
          <option value='nominatim'>Nominatim OpenStreetMap search engine</option>
          <option value='mapbox'>Mapbox Geocoding API (v6)</option>
        </select>
      </div>

      <ThemeConfig></ThemeConfig>
    </div>
  );
};

export default Admin;
