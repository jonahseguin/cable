'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useSock8Store } from './store';

interface Sock8ProviderProps {
  children: React.ReactNode;
  __endpoint?: string;
  __wsUrl?: string;
  __headers?: Record<string, string>;
}

export const Sock8Provider = ({ children, __endpoint = '/api/channels/' }: Sock8ProviderProps) => {
  const initialize = useSock8Store((state) => state.initialize);
  const disconnect = useSock8Store((state) => state.disconnect);

  const didMountForReal = useRef(false);

  const config = useMemo(() => ({ endpoint: __endpoint }), [__endpoint]);

  useEffect(() => {
    initialize(config);

    const timer = setTimeout(() => {
      didMountForReal.current = true;
    }, 0); // next tick

    return () => {
      clearTimeout(timer);

      if (didMountForReal.current) {
        disconnect();
      }
    };
  }, [initialize, disconnect, config]);

  return <>{children}</>;
};
