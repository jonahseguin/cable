'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function TypeSafetyScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    particles: THREE.Points;
    animationId: number | null;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Scene
    const scene = new THREE.Scene();

    // Camera - use orthographic for a flatter look
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 50;

    // Renderer with transparency
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);

    // Create particles
    const particleCount = 1000;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const speeds = new Float32Array(particleCount);
    const typeIndices = new Float32Array(particleCount);

    // Define type colors
    const typeColors = [
      new THREE.Color(0x00a67d), // phthalo green - string
      new THREE.Color(0x66cfb5), // lighter green - number
      new THREE.Color(0x00d4ff), // blue - boolean
      new THREE.Color(0xffcc00), // yellow - object
      new THREE.Color(0xff66aa), // pink - function
    ];

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      // Position particles in a flowing stream pattern
      const x = (Math.random() - 0.5) * width * 0.8;
      const y = (Math.random() - 0.5) * height * 0.8;
      const z = (Math.random() - 0.5) * 50;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Assign random type to each particle
      const typeIndex = Math.floor(Math.random() * typeColors.length);
      typeIndices[i] = typeIndex;

      // Set color based on type
      const color = typeColors[typeIndex]!;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // Vary particle sizes
      sizes[i] = Math.random() * 3 + 1;

      // Vary particle speeds
      speeds[i] = Math.random() * 0.2 + 0.05;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom shader material for better-looking particles
    const particleMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        
        void main() {
          // Create a soft, glowing particle
          float distance = length(gl_PointCoord - vec2(0.5, 0.5));
          if (distance > 0.5) discard;
          
          float alpha = 1.0 - smoothstep(0.3, 0.5, distance);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Add type labels that float in the scene
    const typeLabels = [
      { text: 'string', color: typeColors[0] },
      { text: 'number', color: typeColors[1] },
      { text: 'boolean', color: typeColors[2] },
      { text: 'object', color: typeColors[3] },
      { text: 'function', color: typeColors[4] },
    ];

    const createTypeLabel = (text: string, color: THREE.Color, position: THREE.Vector3) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = 256;
      canvas.height = 128;

      context.fillStyle = 'rgba(0, 0, 0, 0)';
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.font = 'bold 32px monospace';
      context.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
      context.textAlign = 'center';
      context.fillText(text, canvas.width / 2, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
      });

      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.scale.set(20, 10, 1);

      scene.add(sprite);
      return sprite;
    };

    // Create floating type labels at random positions
    const sprites: THREE.Sprite[] = [];
    typeLabels.forEach((label, i) => {
      const x = (Math.random() - 0.5) * width * 0.6;
      const y = (Math.random() - 0.5) * height * 0.6;
      const z = Math.random() * 10;

      const sprite = createTypeLabel(label.text, label.color!, new THREE.Vector3(x, y, z));

      if (sprite) {
        sprite.userData = {
          originalY: y,
          speed: Math.random() * 0.01 + 0.005,
          amplitude: Math.random() * 5 + 3,
        };
        sprites.push(sprite);
      }
    });

    // Animation
    let animationId: number | null = null;
    let time = 0;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      time += 0.01;

      // Update particle positions - create a flowing effect
      const positions = particleGeometry.attributes.position!.array as Float32Array;

      for (let i = 0; i < particleCount; i++) {
        // Flow particles from right to left with some variation
        positions[i * 3]! -= speeds[i]!;

        // Add some vertical movement based on sine wave
        positions[i * 3 + 1]! += Math.sin(time + i * 0.1) * 0.05;

        // Reset particles that go off-screen
        if (positions[i * 3]! < -width / 2) {
          positions[i * 3] = width / 2;
          positions[i * 3 + 1] = (Math.random() - 0.5) * height * 0.8;
        }
      }

      particleGeometry.attributes.position!.needsUpdate = true;

      // Animate the type labels
      sprites.forEach((sprite) => {
        const { originalY, speed, amplitude } = sprite.userData;
        sprite.position.y = originalY + Math.sin(time * speed * 10) * amplitude;
        sprite.rotation.z = Math.sin(time * speed * 5) * 0.1;
      });

      // Rotate the entire particle system slightly
      particles.rotation.z = Math.sin(time * 0.1) * 0.05;

      renderer.render(scene, camera);
    };

    animate();

    // Store references
    sceneRef.current = {
      scene,
      camera,
      renderer,
      particles,
      animationId,
    };

    // Handle resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }

      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }

      window.removeEventListener('resize', handleResize);

      // Dispose resources
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          if (object.geometry) object.geometry.dispose();

          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
    };
  }, []);

  return (
    <motion.div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    />
  );
}
