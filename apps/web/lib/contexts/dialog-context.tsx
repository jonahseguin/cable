import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  ComponentType,
  useMemo,
} from 'react';
import { Dialog, DialogContent } from '@sock8/ui/components/dialog';

interface DialogOptions {
  onClose?: () => void;
  className?: string;
  maxWidth?: string;
}

interface DialogContextProps {
  isOpen: boolean;
  openDialog: <T extends object>(
    Component: ComponentType<T>,
    props: T,
    options?: DialogOptions,
  ) => void;
  closeDialog: () => void;
}

interface DialogProviderState {
  isOpen: boolean;
  component: ReactNode | null;
  options: DialogOptions;
}

const DialogContext = createContext<DialogContextProps | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogProviderState>({
    isOpen: false,
    component: null,
    options: {},
  });

  const openDialog = <T extends object>(
    Component: ComponentType<T>,
    props: T,
    options: DialogOptions = {},
  ) => {
    setState({
      isOpen: true,
      component: <Component {...props} />,
      options,
    });
  };

  const closeDialog = () => {
    if (state.options.onClose) {
      state.options.onClose();
    }
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  const dialogContentStyle = state.options.maxWidth
    ? { style: { maxWidth: state.options.maxWidth } }
    : {};

  return (
    <DialogContext.Provider value={{ isOpen: state.isOpen, openDialog, closeDialog }}>
      {children}
      <Dialog open={state.isOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className={state.options.className} {...dialogContentStyle}>
          {state.component}
        </DialogContent>
      </Dialog>
    </DialogContext.Provider>
  );
}

export const useDialog = () => {
  const context = useMemo(() => useContext(DialogContext), []);
  if (context === undefined) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};
