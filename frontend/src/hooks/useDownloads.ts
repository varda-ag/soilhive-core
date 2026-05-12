import { useContext } from 'react';

import { DownloadsContext } from '../contexts/DownloadsContext';

const useDownloads = () => {
  const context = useContext(DownloadsContext);

  if (context === undefined) {
    throw new Error('useDownloads must be used within a DownloadsContext');
  }

  return context;
};

export default useDownloads;
