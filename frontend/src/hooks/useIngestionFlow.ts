import { useContext } from 'react';

import { IngestionFlowContext } from '../contexts/IngestionFlowContext';

const useIngestionFlow = () => {
  const ctx = useContext(IngestionFlowContext);

  if (ctx === undefined) {
    throw new Error('useIngestionFlow must be used within an IngestionFlowProvider');
  }

  return ctx;
};

export default useIngestionFlow;
