import React, { createContext, useState, useCallback, useRef, type ReactNode } from 'react';

type LeaveHandlers = {
  onConfirm: () => void;
  onCancel: () => void;
};

type IngestionFlowContextType = {
  hasChanges: boolean;
  markAsChanged: () => void;
  resetChanges: () => void;
  isLeaveModalVisible: boolean;
  requestLeave: (onConfirm: () => void, onCancel: () => void) => void;
  confirmLeave: () => void;
  cancelLeave: () => void;
};

export const IngestionFlowContext = createContext<IngestionFlowContextType | undefined>(undefined);

type IngestionFlowProviderProps = {
  children: ReactNode;
};

export const IngestionFlowProvider: React.FC<IngestionFlowProviderProps> = ({ children }) => {
  const [hasChanges, setHasChanges] = useState(false);
  const [isLeaveModalVisible, setIsLeaveModalVisible] = useState(false);
  const leaveHandlersRef = useRef<LeaveHandlers | null>(null);

  const markAsChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  const resetChanges = useCallback(() => {
    setHasChanges(false);
  }, []);

  const requestLeave = useCallback((onConfirm: () => void, onCancel: () => void) => {
    leaveHandlersRef.current = { onConfirm, onCancel };
    setIsLeaveModalVisible(true);
  }, []);

  const confirmLeave = useCallback(() => {
    leaveHandlersRef.current?.onConfirm();
    leaveHandlersRef.current = null;
    setHasChanges(false);
    setIsLeaveModalVisible(false);
  }, []);

  const cancelLeave = useCallback(() => {
    leaveHandlersRef.current?.onCancel();
    leaveHandlersRef.current = null;
    setIsLeaveModalVisible(false);
  }, []);

  return (
    <IngestionFlowContext.Provider
      value={{ hasChanges, markAsChanged, resetChanges, isLeaveModalVisible, requestLeave, confirmLeave, cancelLeave }}
    >
      {children}
    </IngestionFlowContext.Provider>
  );
};
