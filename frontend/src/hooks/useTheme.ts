import { useContext } from 'react';

import { ThemeContext } from '../contexts/ThemeContext';

const useTheme = () => {
  const theme = useContext(ThemeContext);

  if (theme === undefined) {
    throw new Error('useTheme must be used within a ThemeContext');
  }

  return theme;
};

export default useTheme;
