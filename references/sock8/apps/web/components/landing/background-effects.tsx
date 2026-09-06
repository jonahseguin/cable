'use client';

import { useIsMobile } from '../../hooks/use-is-mobile';
import { FlickeringGrid } from './flickering-grid';

export default function BackgroundEffects() {
  const isMobile = useIsMobile();

  return (
    <>
      {/* Gradient background */}
      <div
        className="pointer-events-auto absolute inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 128, 96, 0.2) 100%), radial-gradient(circle at 80% 70%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 70%, rgba(0, 128, 96, 0.2) 100%)',
        }}
      />

      {/* Interactive Grid Background - skewed */}
      {/* <div className="pointer-events-auto absolute inset-0 z-0 h-full w-full -skew-y-6 transform opacity-40">
        <GridPattern />
      </div> */}

      {/* Flickering Grid Background */}
      <div className="pointer-events-auto absolute inset-0 z-0 h-full w-full opacity-40">
        <FlickeringGrid
          squareSize={8}
          gridGap={8}
          color="#123524"
          maxOpacity={0.8}
          flickerChance={0.1}
          disabled={isMobile}
        />
      </div>

      {/* Glow effect */}
      <div className="bg-phthalo-green/20 absolute left-1/2 top-1/4 z-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full blur-[120px]" />
    </>
  );
}
