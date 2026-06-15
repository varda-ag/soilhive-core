import { useEffect } from 'react';
import { useBlocker } from 'react-router';

import { ADMIN_PATHS } from '../configuration/admin';
import useIngestionFlow from 'hooks/useIngestionFlow';

export function IngestionFlowGuard() {
  const { hasChanges, requestLeave } = useIngestionFlow();

  const blocker = useBlocker(
    ({ nextLocation }) =>
      hasChanges && (!nextLocation.pathname.startsWith(ADMIN_PATHS.DATASETS) || nextLocation.pathname === ADMIN_PATHS.DATASETS),
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      requestLeave(
        () => blocker.proceed(),
        () => blocker.reset(),
      );
    }
  }, [blocker, requestLeave]);

  useEffect(() => {
    if (!hasChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  return null;
}
