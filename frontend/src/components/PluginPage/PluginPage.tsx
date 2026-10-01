import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../../auth/AuthContextProvider';
import { usePluginContext } from 'hooks/usePluginContext';
import { SignInPrompt } from 'components/SignInPrompt/SignInPrompt';
import type { SinglePagePlugin } from 'types/plugins';

// Reads PluginContext at render time, inside the route tree, instead of the router baking in a
// snapshot captured when `router` was built. `usePluginContext()`'s return value changes identity
// whenever the auth `user` does (sign-in/out, token renewal); if that identity fed the `router`
// useMemo in Routes.tsx, react-router's `RouterProvider` would be handed a brand-new router instance
// on every such change. RouterProvider
// only resyncs its internal state on a router *identity* change, so swapping instances mid-flight —
// most visibly during the cascade of state updates right after the initial loading gate opens —
// leaves route elements (like this one, which renders its own nested <Routes>) briefly rendered
// against a router whose context hasn't caught up, throwing "useRoutes() may be used only in the
// context of a <Router> component".
// The sign-in gate lives here for the same reason: filtering routes by sign-in state would swap the
// router on every sign-in/out.
export function PluginPage({ name, requiresAuth, Page }: Pick<SinglePagePlugin, 'name' | 'requiresAuth' | 'Page'>) {
  const { t } = useTranslation('common');
  const { isAuthenticated } = useAuthContext();
  const pluginContext = usePluginContext();
  if (requiresAuth && !isAuthenticated) return <SignInPrompt title={t('auth.sign_in_prompt.title', { name })} />;
  return <Page context={pluginContext} />;
}
