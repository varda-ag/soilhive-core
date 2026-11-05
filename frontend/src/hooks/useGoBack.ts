import { useLocation, useNavigate, type To } from 'react-router';

/**
 * Goes back to the previous page of this app, or to `fallback` when this one has none behind it: a page
 * an OIDC sign-in brought the visitor back to has the identity provider behind it (docs/adr/0075), and a
 * link opened in a new tab has nothing.
 */
export function useGoBack(fallback: To): () => void {
  const navigate = useNavigate();
  // React Router keys every entry it creates. An entry it did not create, such as the one the sign-in
  // callback replaces, keeps the initial key.
  const { key } = useLocation();
  return () => {
    if (key === 'default') navigate(fallback);
    else navigate(-1);
  };
}
