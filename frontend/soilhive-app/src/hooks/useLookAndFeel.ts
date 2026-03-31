import { useContext } from 'react';

import { LookAndFeelContext } from '../contexts/LookAndFeelContext';

const useLookAndFeel = () => {
  const ctx = useContext(LookAndFeelContext);

  if (ctx === undefined) {
    throw new Error('useLookAndFeel must be used within a LookAndFeelContext');
  }

  return ctx;
};

export default useLookAndFeel;
