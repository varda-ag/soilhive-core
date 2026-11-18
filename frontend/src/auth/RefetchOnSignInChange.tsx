import { useRefetchOnSignInChange } from 'hooks/useRefetchOnSignInChange';

// Keeps the query cache in step with the signed-in user. Renders nothing.
export function RefetchOnSignInChange() {
  useRefetchOnSignInChange();
  return null;
}
