import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Nexus3DLogoProps {
  size?: number;
  interactive?: boolean;
}

export const Nexus3DLogo: React.FC<Nexus3DLogoProps> = ({ size = 120, interactive = true }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 3.2;

    // 3. WebGL Renderer (100% Transparent)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // Transparent
    container.appendChild(renderer.domElement);

    // 4. Lights optimized for Light Mode
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xff5722, 3, 10); // Vibrant Coral
    pointLight.position.set(2, 2, 2);
    scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0x27272a, 2, 10); // Dark Charcoal
    pointLight2.position.set(-2, -2, 2);
    scene.add(pointLight2);

    // 5. Light-Mode 3D Prism Group
    const logoGroup = new THREE.Group();

    // Outer Wireframe Crystal Octahedron (#27272A - Dark Charcoal for light mode contrast)
    const outerGeo = new THREE.OctahedronGeometry(0.85, 0);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x27272a,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    logoGroup.add(outerMesh);

    // Inner Solid Core Diamond (#FF5722 - Vibrant Coral)
    const innerGeo = new THREE.OctahedronGeometry(0.48, 0);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xff5722,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.95,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    logoGroup.add(innerMesh);

    // Subtle Slate Ring (#71717A)
    const ringGeo = new THREE.TorusGeometry(1.05, 0.018, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x71717a,
      transparent: true,
      opacity: 0.8,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3;
    logoGroup.add(ringMesh);

    scene.add(logoGroup);

    // Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      mouseX = (x / rect.width) * 0.4;
      mouseY = (y / rect.height) * 0.4;
    };

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      outerMesh.rotation.y += 0.009;
      outerMesh.rotation.x += 0.004;

      innerMesh.rotation.y -= 0.014;
      innerMesh.rotation.z += 0.007;

      ringMesh.rotation.z += 0.006;

      if (interactive) {
        logoGroup.rotation.x += (mouseY - logoGroup.rotation.x) * 0.05;
        logoGroup.rotation.y += (mouseX - logoGroup.rotation.y) * 0.05;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (interactive) window.removeEventListener('mousemove', handleMouseMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      outerGeo.dispose();
      outerMat.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [size, interactive]);

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center pointer-events-none select-none shrink-0 overflow-hidden"
    />
  );
};

export default Nexus3DLogo;
