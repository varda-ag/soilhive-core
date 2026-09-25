import { useContext } from 'react';

import { AvailabilityDataContext } from '../contexts/AvailabilityDataContext';

const useAvailabilityData = () => {
  const context = useContext(AvailabilityDataContext);

  if (context === undefined) {
    throw new Error('useAvailabilityData must be used within an AvailabilityDataProvider');
  }

  return context;
};

export default useAvailabilityData;
