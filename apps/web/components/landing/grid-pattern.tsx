'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

export function GridPattern() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);

  // Create a grid of cells
  const gridSize = 20; // Number of cells in each row/column
  const cells = Array.from({ length: gridSize * gridSize }, (_, i) => i);

  return (
    <div
      ref={containerRef}
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        gridTemplateRows: `repeat(${gridSize}, 1fr)`,
      }}
    >
      {cells.map((cell) => (
        <motion.div
          key={cell}
          className={`
            border-phthalo-green/10 pointer-events-auto 
            border transition-all duration-300
            ease-in-out
            ${hoveredCell === cell ? 'bg-phthalo-green/20' : 'bg-transparent'}
            ${
              hoveredCell === cell - 1 ||
              hoveredCell === cell + 1 ||
              hoveredCell === cell - gridSize ||
              hoveredCell === cell + gridSize
                ? 'bg-phthalo-green/10'
                : ''
            }
            ${
              hoveredCell === cell - gridSize - 1 ||
              hoveredCell === cell - gridSize + 1 ||
              hoveredCell === cell + gridSize - 1 ||
              hoveredCell === cell + gridSize + 1
                ? 'bg-phthalo-green/5'
                : ''
            }
          `}
          onMouseEnter={() => setHoveredCell(cell)}
          onMouseLeave={() => setHoveredCell(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 1,
            delay: (cell / (gridSize * gridSize)) * 2, // Staggered appearance
          }}
          whileHover={{
            scale: [null, 1.1, 1.05],
            zIndex: 10,
            borderColor: 'rgba(0, 128, 96, 0.3)',
          }}
        />
      ))}
    </div>
  );
}
