import { useContext } from 'react';

import { AvailabilityContext } from '../contexts/AvailabilityContext';
import Availability from './Availability';
import DownloadPreview from './DownloadPreview';

function Homepage() {
  const availabilityContext = useContext(AvailabilityContext);

  if (!availabilityContext) {
    throw new Error('AvailabilityContext must be used within AvailabilityProvider');
  }

  const { preview } = availabilityContext;

  return preview ? <DownloadPreview /> : <Availability />;
}

export default Homepage;
