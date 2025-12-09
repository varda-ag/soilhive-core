import { useId, useMemo, useState } from "react";
import { modules } from "../utilities/moduleFederation";
import { useAuthContext } from "../auth/AuthContextProvider";
import {ThemeConfig} from '../components/ThemeConfig/ThemeConfig'
import { Button, Dropdown } from "components/UI";

function Admin() {
  const { isAuthenticated, isLoading, login, logout, user } = useAuthContext();
  
  const mapGeocoderInputId = useId();
  const [mapGeocoder, setMapGeocoder] = useState(localStorage.getItem('MAP_GEOCODER') ?? 'nominatim');
  
  const geocoderAPIOptions = [
    {
      name: 'Nominatim OpenStreetMap search engine',
      code: 'nominatim',
    },
    {
      name: 'Mapbox Geocoding API (v6)',
      code: 'mapbox',
    }
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
    <div>
      <h2>Access denied. Please log in.</h2>
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


      <h2>Maps:</h2>
      <div>
        <label htmlFor={mapGeocoderInputId}>Geocoder API: {mapGeocoder}</label><br />
        <Dropdown
          name="map-geocoder"
          options={geocoderAPIOptions}
          value={mapGeocoder}
          onChange={
            (option) => {
              const selectedGeocoder = option;
              localStorage.setItem('MAP_GEOCODER', selectedGeocoder);
              setMapGeocoder(selectedGeocoder);
            } 
          }
        />
        {/* <select name="map-geocoder"
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
        </select> */}
      </div>

      <ThemeConfig></ThemeConfig>
    </div>
  );
};

export default Admin;
