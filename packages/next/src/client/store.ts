'use client';

import { create } from 'zustand';
import { Sock8ConnectionManager, ConnectionState, type ConnectionConfig } from '@sock8/sdk/client';

interface Sock8StoreState {
  manager: Sock8ConnectionManager | null;
  connectionState: ConnectionState;
  initialize: (config: ConnectionConfig) => void;
  disconnect: () => void;
}

export const useSock8Store = create<Sock8StoreState>((set, get) => ({
  manager: null,
  connectionState: ConnectionState.DISCONNECTED,

  initialize: (config) => {
    // Clean up previous instance if exists
    get().disconnect();

    console.log('Initializing Sock8 connection...');
    const manager = new Sock8ConnectionManager(config);

    set({ manager });

    manager.onStateChange((state) => {
      const prev = get().connectionState;
      console.log('Sock8 connection state changed:', state);
      if (
        (prev == ConnectionState.CONNECTED && state == ConnectionState.DISCONNECTED) ||
        (prev == ConnectionState.ERROR && state == ConnectionState.DISCONNECTED)
      ) {
        console.log('Reconnecting Sock8 connection...');
        manager
          .connect()
          .then(() => {
            console.log('Sock8 connection reestablished.');
          })
          .catch((error) => {
            console.error('Sock8 connection failed:', error);
          });
        return;
      }

      set({ connectionState: state });
    });

    manager
      .connect()
      .then(() => {
        // State will be updated via the listener
        console.log('Sock8 connection established.');
      })
      .catch((error) => {
        console.error('Sock8 connection failed:', error);
        // State should update to ERROR via listener
        // Clean up manager instance on initial connection failure
        get().disconnect();
      });
  },

  disconnect: () => {
    const { manager } = get();
    if (manager && manager.state !== ConnectionState.DISCONNECTED) {
      console.log('Disconnecting Sock8 manager...');
      manager.disconnect();
      manager.onStateChange(null);
    }
  },
}));
