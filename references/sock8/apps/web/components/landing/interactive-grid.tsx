'use client';

import { useEffect, useRef } from 'react';

export function InteractiveGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match window size
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Grid properties
    const gridSize = 30;
    const dotSize = 1;
    const maxDistance = 150;
    const mouseInfluenceRadius = 200;
    const mouseStrength = 0.15;

    // Mouse position
    let mouseX = 0;
    let mouseY = 0;

    // Track mouse position
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Create grid points
    const points: { x: number; y: number; originX: number; originY: number }[] = [];
    const createGrid = () => {
      points.length = 0;
      const numCols = Math.ceil(window.innerWidth / gridSize) + 1;
      const numRows = Math.ceil(window.innerHeight / gridSize) + 1;

      for (let i = 0; i < numCols; i++) {
        for (let j = 0; j < numRows; j++) {
          const x = i * gridSize;
          const y = j * gridSize;
          points.push({ x, y, originX: x, originY: y });
        }
      }
    };

    createGrid();

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update points based on mouse position
      for (const point of points) {
        const dx = mouseX - point.originX;
        const dy = mouseY - point.originY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < mouseInfluenceRadius) {
          const influence = (1 - distance / mouseInfluenceRadius) * mouseStrength;
          point.x = point.originX - dx * influence;
          point.y = point.originY - dy * influence;
        } else {
          // Return to original position
          point.x += (point.originX - point.x) * 0.1;
          point.y += (point.originY - point.y) * 0.1;
        }
      }

      // Draw grid lines
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 128, 96, 0.15)'; // Phthalo green with low opacity

      for (const point of points) {
        for (const otherPoint of points) {
          const dx = point.x - otherPoint.x;
          const dy = point.y - otherPoint.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < maxDistance && distance > 0) {
            ctx.globalAlpha = 1 - distance / maxDistance;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(otherPoint.x, otherPoint.y);
            ctx.stroke();
          }
        }
      }

      // Draw grid points
      ctx.fillStyle = 'rgba(0, 128, 96, 0.5)'; // Phthalo green with medium opacity
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-auto h-full w-full"
      style={{ display: 'block' }}
    />
  );
}
