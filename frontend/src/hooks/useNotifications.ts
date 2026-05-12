import { useContext } from 'react';

import { NotificationsContext } from '../contexts/NotificationsContext';

const useNotifications = () => {
  const context = useContext(NotificationsContext);

  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationContext');
  }

  return context;
};

export default useNotifications;
