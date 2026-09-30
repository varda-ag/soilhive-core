import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useRouteError } from 'react-router';

import PageTitle from 'components/PageTitle';
import { Button } from 'components/UI';

import styles from './PluginErrorPage.module.scss';

interface Props {
  name: string;
}

// Rendered as the `errorElement` of a plugin's route, so an error thrown while rendering a plugin
// replaces only that route's content: the host's header stays usable, and navigating anywhere else
// clears the error (react-router resets its route error boundary on every location change).
export default function PluginErrorPage({ name }: Props) {
  const { t } = useTranslation('common');
  const error = useRouteError();
  const navigate = useNavigate();

  // The route error boundary swallows the error, so log it to keep the stack visible in devtools.
  useEffect(() => {
    console.error(`Plugin "${name}" crashed while rendering`, error);
  }, [name, error]);

  return (
    <div className={styles.PluginErrorPage}>
      <PageTitle title={`SoilHive - ${name}`} />
      <h1 className={styles.Title}>{t('plugins.render_error.title')}</h1>
      <p className={styles.Message}>{t('plugins.render_error.message', { name })}</p>
      <Button type="primary" size="medium" onClick={() => navigate('/')} dataTestId="plugin-error-page-home-button">
        {t('plugins.render_error.back_home')}
      </Button>
    </div>
  );
}
