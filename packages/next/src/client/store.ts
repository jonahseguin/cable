'use client';

import { create } from 'zustand';
import { [removed]ConnectionManager, ConnectionState, type ConnectionConfig } from '@[removed]/sdk/client';

interface [removed]StoreState {
  manager: [removed]ConnectionManager | null;
  connectionState: ConnectionState;
  initialize: (config: ConnectionConfig) => void;
  disconnect: () => void;
}

export const use[removed]Store = create<[removed]StoreState>((set, get) => ({
  manager: null,
  connectionState: ConnectionState.DISCONNECTED,

  initialize: (config) => {
    // Clean up previous instance if exists
    get().disconnect();

    console.log('Initializing [removed] connection...');
    const manager = new [removed]ConnectionManager(config);

    set({ manager });

    manager.onStateChange((state) => {
      const prev = get().connectionState;
      console.log('[removed] connection state changed:', state);
      if (
        (prev == ConnectionState.CONNECTED && state == ConnectionState.DISCONNECTED) ||
        (prev == ConnectionState.ERROR && state == ConnectionState.DISCONNECTED)
      ) {
        console.log('Reconnecting [removed] connection...');
        manager
          .connect()
          .then(() => {
            console.log('[removed] connection reestablished.');
          })
          .catch((error) => {
            console.error('[removed] connection failed:', error);
          });
        return;
      }

      set({ connectionState: state });
    });

    manager
      .connect()
      .then(() => {
        // State will be updated via the listener
        console.log('[removed] connection established.');
      })
      .catch((error) => {
        console.error('[removed] connection failed:', error);
        // State should update to ERROR via listener
        // Clean up manager instance on initial connection failure
        get().disconnect();
      });
  },

  disconnect: () => {
    const { manager } = get();
    if (manager && manager.state !== ConnectionState.DISCONNECTED) {
      console.log('Disconnecting [removed] manager...');
      manager.disconnect();
      manager.onStateChange(null);
    }
  },
}));
