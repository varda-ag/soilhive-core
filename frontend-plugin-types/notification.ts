export type PluginNotificationType = 'error' | 'warning' | 'success';

export interface PluginNotification {
  // Deduplicates within the calling plugin's own namespace; omitted = always shown.
  id?: string;
  title: string;
  message?: string;
  type: PluginNotificationType;
}

export interface PluginNotificationsResult {
  showNotification: (notification: PluginNotification) => void;
}
