import { useContext } from 'react';

import { AvailabilityMapContext } from '../contexts/AvailabilityMapContext';

const useAvailabilityMap = () => {
  const context = useContext(AvailabilityMapContext);

  if (context === undefined) {
    throw new Error('useAvailabilityMap must be used within an AvailabilityMapProvider');
  }

  return context;
};

export default useAvailabilityMap;
