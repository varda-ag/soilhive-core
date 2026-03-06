import { useId, useState } from 'react';
import { modules } from '../utilities/moduleFederation';
import { useAuthContext } from '../auth/AuthContextProvider';
import { ThemeConfig } from '../components/ThemeConfig/ThemeConfig';
import { Dropdown } from 'components/UI';
import { useTranslation } from 'react-i18next';

function Admin() {
  const { isAuthenticated, isLoading, user } = useAuthContext();
  const { t } = useTranslation('common');

  const mapGeocoderInputId = useId();
  const [mapGeocoder, setMapGeocoder] = useState(localStorage.getItem('MAP_GEOCODER') ?? 'nominatim');

  const geocoderAPIOptions = [
    {
      name: t('admin_page.geocoder_options.nominatim'),
      code: 'nominatim',
    },
    {
      name: t('admin_page.geocoder_options.mapbox'),
      code: 'mapbox',
    },
  ];

  if (isLoading) {
    return <div>{t('loading')}</div>;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <h2>{t('admin_page.access_denied')}</h2>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>{t('admin_page.title')}</h1>
      <p>{t('admin_page.description')}</p>

      <h2>{t('admin_page.installed_modules')}</h2>
      <ol>
        {modules.map(({ name, type, description }) => {
          return (
            <li key={name}>
              <h3>{name}</h3>
              <p>
                {t('admin_page.type')}: {type}
              </p>
              <p>{description}</p>
            </li>
          );
        })}
      </ol>
      <h2>
        {t('admin_page.authenticated_user')}: {user?.profile?.name}
      </h2>

      <h2>{t('admin_page.maps')}</h2>
      <div>
        <label htmlFor={mapGeocoderInputId}>{t('admin_page.geocoder_api', { provider: mapGeocoder })}</label>
        <br />
        <Dropdown
          name="map-geocoder"
          options={geocoderAPIOptions}
          value={mapGeocoder}
          onChange={option => {
            const selectedGeocoder = option as string;
            localStorage.setItem('MAP_GEOCODER', selectedGeocoder);
            setMapGeocoder(selectedGeocoder);
          }}
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
}

export default Admin;
