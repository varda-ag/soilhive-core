import { useContext } from 'react';

import { RemotesContext } from '../contexts/RemotesContext';

const useRemotes = () => {
  const remotes = useContext(RemotesContext);

  if (remotes === undefined) {
    throw new Error('useRemotes must be used within a RemotesProvider');
  }

  return remotes;
};

export default useRemotes;
