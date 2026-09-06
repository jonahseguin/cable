'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { use[removed]Store } from './store';

interface [removed]ProviderProps {
  children: React.ReactNode;
  __endpoint?: string;
  __wsUrl?: string;
  __headers?: Record<string, string>;
}

export const [removed]Provider = ({ children, __endpoint = '/api/channels/' }: [removed]ProviderProps) => {
  const initialize = use[removed]Store((state) => state.initialize);
  const disconnect = use[removed]Store((state) => state.disconnect);

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
