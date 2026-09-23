import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeLogoIconProps {
  size?: number; // Size in px (default 160)
}

export const ThreeLogoIcon: React.FC<ThreeLogoIconProps> = ({ size = 160 }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.z = 3.2;

    // 3. Renderer with transparent background
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // 100% transparent
    container.appendChild(renderer.domElement);

    // 4. Compact 3D TorusKnot / Crystal Geometry
    const knotGeo = new THREE.TorusKnotGeometry(0.7, 0.22, 100, 16);
    const knotMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7, // Vibrant Purple
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const knotMesh = new THREE.Mesh(knotGeo, knotMat);
    scene.add(knotMesh);

    // Inner glowing core
    const coreGeo = new THREE.IcosahedronGeometry(0.45, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1, // Indigo
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    // Orbital Particle Ring
    const particleCount = 120;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 1.35 + (Math.random() - 0.5) * 0.15;
      posArray[i * 3] = Math.cos(angle) * radius;
      posArray[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
      posArray[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.04,
      color: 0x38bdf8, // Cyan glow accent
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const particleRing = new THREE.Points(particleGeo, particleMat);
    scene.add(particleRing);

    // Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      mouseX = (x / rect.width) * 0.4;
      mouseY = (y / rect.height) * 0.4;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Smooth Rotation
      knotMesh.rotation.y += 0.012;
      knotMesh.rotation.x += 0.006;
      knotMesh.rotation.x += (mouseY - knotMesh.rotation.x) * 0.05;
      knotMesh.rotation.y += (mouseX - knotMesh.rotation.y) * 0.05;

      coreMesh.rotation.y -= 0.015;
      coreMesh.rotation.z += 0.01;

      particleRing.rotation.y += 0.008;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      knotGeo.dispose();
      knotMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center pointer-events-none select-none"
    />
  );
};

export default ThreeLogoIcon;
