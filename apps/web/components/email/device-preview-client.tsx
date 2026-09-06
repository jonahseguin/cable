'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { RefreshCwIcon, LayoutIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';

// Define device sizes as a typed constant
const DEVICE_SIZES = {
  mobile: 375,
  tablet: 768,
  desktop: 100, // percentage
} as const;

// Define device type
type DeviceType = keyof typeof DEVICE_SIZES;

interface DevicePreviewClientProps {
  children: React.ReactNode;
}

export default function DevicePreviewClient({
  children,
}: DevicePreviewClientProps): React.ReactElement {
  // State for selected device preview with proper typing
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>('desktop');
  const [containerWidth, setContainerWidth] = useState<string | number>('100%');
  const pathname = usePathname();

  // Set container width based on selected device
  useEffect(() => {
    setContainerWidth(selectedDevice === 'desktop' ? '100%' : `${DEVICE_SIZES[selectedDevice]}px`);
  }, [selectedDevice]);

  return (
    <>
      {/* Status and functionality explanation */}
      <div className="border-border/50 bg-card/50 mb-5 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm backdrop-blur-sm">
        <div className="text-muted-foreground/80 flex items-center gap-2">
          <div className="flex items-center">
            <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
            <span>Live Preview</span>
          </div>
          <span className="text-border">|</span>
          <span>
            <code className="bg-muted/50 rounded px-1 py-0.5 text-[10px]">{pathname}</code>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="border-border bg-background flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs shadow-sm">
            <RefreshCwIcon size={10} className="text-muted-foreground" />
            <span>Auto-refresh</span>
          </div>
        </div>
      </div>

      {/* Device preview controls */}
      <div className="mb-4 flex flex-col">
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <LayoutIcon size={12} />
            <span>Device Preview</span>
          </div>

          {/* Device selector buttons */}
          <div className="border-border/40 flex items-center gap-1 rounded-md border p-0.5 shadow-sm">
            <button
              onClick={() => setSelectedDevice('mobile')}
              className={`flex size-7 items-center justify-center rounded ${
                selectedDevice === 'mobile'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground/70 hover:bg-muted'
              }`}
              title="Mobile view (375px)"
              aria-label="Mobile view"
            >
              <SmartphoneIcon size={14} />
            </button>
            <button
              onClick={() => setSelectedDevice('desktop')}
              className={`flex size-7 items-center justify-center rounded ${
                selectedDevice === 'desktop'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground/70 hover:bg-muted'
              }`}
              title="Desktop view (full width)"
              aria-label="Desktop view"
            >
              <MonitorIcon size={14} />
            </button>
          </div>
        </div>

        {/* Width indicator */}
        <div className="border-border/30 mt-2 border-t pt-2">
          <div className="flex justify-center">
            <div className="text-muted-foreground/50 text-[10px]">
              {selectedDevice === 'desktop'
                ? 'Full width'
                : `${DEVICE_SIZES[selectedDevice]}px width`}
            </div>
          </div>
        </div>
      </div>

      {/* Content with depth effect and responsive width */}
      <div className="flex justify-center">
        <div
          className="border-border/40 bg-background relative box-content rounded-lg border p-4 shadow-sm transition-all duration-300 ease-in-out"
          style={{ width: containerWidth, maxWidth: '100%' }}
        >
          {/* Email shadow effects for depth */}
          <div
            className="absolute -bottom-1 left-2 right-2 h-2 rounded-b-lg bg-black/5"
            aria-hidden="true"
          ></div>
          <div
            className="absolute -bottom-0.5 left-1 right-1 h-1 rounded-b-lg bg-black/5"
            aria-hidden="true"
          ></div>
          {children}
        </div>
      </div>
    </>
  );
}
