import { useContext } from 'react';

import { AvailabilityContext } from '../contexts/AvailabilityContext';
import Availability from './Availability';

function Homepage() {
  const availabilityContext = useContext(AvailabilityContext);

  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  return <Availability />;
}

export default Homepage;
