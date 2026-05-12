import { useContext } from 'react';

import { AvailabilityContext } from '../contexts/AvailabilityContext';

const useAvailability = () => {
  const context = useContext(AvailabilityContext);

  if (context === undefined) {
    throw new Error('useAvailability must be used within a AvailabilityContext');
  }

  return context;
};

export default useAvailability;
