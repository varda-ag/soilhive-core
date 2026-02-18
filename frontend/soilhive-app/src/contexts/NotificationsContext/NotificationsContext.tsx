import React, { createContext, useState, type ReactNode, useCallback, useMemo, useRef, useEffect } from 'react';
import { Notification } from 'components/UI';
import type { NotificationType } from 'types/components';

import styles from './NotificationsContext.module.scss';

type NotificationObject = {
  id: string;
  title: string;
  message?: string;
  type?: NotificationType;
};

type NotificationsContextType = {
  notifications: NotificationObject[];
  showNotification: (notification: NotificationObject) => void;
  removeNotification: (id: string) => void;
};

export const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

type NotificationProviderProps = {
  children: ReactNode;
};

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 3;

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [visible, setVisible] = useState<NotificationObject[]>([]);
  const [queue, setQueue] = useState<NotificationObject[]>([]);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current[id];
    if (t) {
      clearTimeout(t);
      delete timersRef.current[id];
    }
  }, []);

  const removeNotification = useCallback(
    (id: string) => {
      clearTimer(id);

      setVisible(prev => prev.filter(n => n.id !== id));
      setQueue(prev => prev.filter(n => n.id !== id));
    },
    [clearTimer],
  );

  const scheduleAutoDismiss = useCallback(
    (id: string) => {
      clearTimer(id);

      timersRef.current[id] = setTimeout(() => {
        removeNotification(id);
      }, AUTO_DISMISS_MS);
    },
    [clearTimer, removeNotification],
  );

  const showNotification = useCallback(
    (notification: NotificationObject) => {
      setVisible(prevVisible => {
        const alreadyExists = prevVisible.some(n => n.id === notification.id);

        if (alreadyExists) return prevVisible;

        if (prevVisible.length < MAX_VISIBLE) {
          scheduleAutoDismiss(notification.id);
          return [notification, ...prevVisible];
        }

        setQueue(prevQueue => {
          if (prevQueue.some(n => n.id === notification.id)) return prevQueue;
          return [notification, ...prevQueue];
        });

        return prevVisible;
      });
    },
    [scheduleAutoDismiss],
  );

  useEffect(() => {
    return () => {
      for (const id of Object.keys(timersRef.current)) {
        clearTimeout(timersRef.current[id]);
      }
      timersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (visible.length >= MAX_VISIBLE) return;
    if (queue.length === 0) return;

    const slots = MAX_VISIBLE - visible.length;
    const toPromote = queue.slice(-slots);
    const remainingQueue = queue.slice(0, -slots);

    setQueue(remainingQueue);

    setVisible(prev => {
      const updated = [...toPromote.reverse(), ...prev];
      updated.forEach(n => scheduleAutoDismiss(n.id));
      return updated;
    });
  }, [visible.length, queue, scheduleAutoDismiss]);

  const value = useMemo(
    () => ({ notifications: visible, showNotification, removeNotification }),
    [visible, showNotification, removeNotification],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {!!visible.length && (
        <div className={styles.NotificationsWrapper}>
          {visible.map(({ id, ...config }) => (
            <div key={id} className={styles.NotificationBarWrapper}>
              <Notification {...config} onClose={() => removeNotification(id)} />
            </div>
          ))}
        </div>
      )}
    </NotificationsContext.Provider>
  );
};
