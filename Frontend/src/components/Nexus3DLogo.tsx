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

    // 2. Camera (balanced framing so logo and rings never clip)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 3.2;

    // 3. WebGL Renderer (Transparent, Anti-aliased)
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // 4. Studio Lighting (Luminous Cream & Warm Gold)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0xfff8ee, 5.0, 15);
    pointLight1.position.set(2.2, 2.5, 2.5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xe1dcc9, 3.8, 12);
    pointLight2.position.set(-2.0, -2.0, 1.8);
    scene.add(pointLight2);

    // 5. Crystalline Logo Group
    const logoGroup = new THREE.Group();

    // Geometry Definitions (scaled for neat padding and zero clipping)
    const outerGeo = new THREE.OctahedronGeometry(0.72, 0);
    const innerGeo = new THREE.OctahedronGeometry(0.42, 0);

    // Outer Crystalline Cage - Glowing Warm Cream Linen Wireframe
    const outerWireMat = new THREE.MeshBasicMaterial({
      color: 0xe1dcc9,
      wireframe: true,
      transparent: true,
      opacity: 0.92,
    });
    const outerWireMesh = new THREE.Mesh(outerGeo, outerWireMat);
    logoGroup.add(outerWireMesh);

    // Outer Glass Facets (Translucent Smoky Slate)
    const outerFacetMat = new THREE.MeshStandardMaterial({
      color: 0x44444e,
      roughness: 0.1,
      metalness: 0.6,
      transparent: true,
      opacity: 0.28,
    });
    const outerFacetMesh = new THREE.Mesh(outerGeo, outerFacetMat);
    logoGroup.add(outerFacetMesh);

    // Glowing Vertex Star Points at every corner
    const pointsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
    });
    const pointsMesh = new THREE.Points(outerGeo, pointsMat);
    logoGroup.add(pointsMesh);

    // Inner Glowing Core Diamond (Warm Gold & Cream Emissive Crystal)
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe1dcc9,
      emissiveIntensity: 0.95,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.95,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    logoGroup.add(innerMesh);

    // Orbital Gyro Ring 1 (#E1DCC9 Warm Cream)
    const ring1Geo = new THREE.TorusGeometry(0.92, 0.022, 16, 64);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0xe1dcc9,
      transparent: true,
      opacity: 0.9,
    });
    const ring1Mesh = new THREE.Mesh(ring1Geo, ring1Mat);
    ring1Mesh.rotation.x = Math.PI / 3.2;
    logoGroup.add(ring1Mesh);

    // Orbital Gyro Ring 2 (Counter-tilted Cream Slate Ring)
    const ring2Geo = new THREE.TorusGeometry(1.02, 0.016, 16, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xd4cdb5,
      transparent: true,
      opacity: 0.65,
    });
    const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2Mesh.rotation.x = -Math.PI / 3.8;
    ring2Mesh.rotation.y = Math.PI / 5;
    logoGroup.add(ring2Mesh);

    scene.add(logoGroup);

    // Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      mouseX = (x / rect.width) * 0.45;
      mouseY = (y / rect.height) * 0.45;
    };

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Smooth multi-axis crystalline rotation
      outerWireMesh.rotation.y += 0.009;
      outerWireMesh.rotation.x += 0.005;

      outerFacetMesh.rotation.y = outerWireMesh.rotation.y;
      outerFacetMesh.rotation.x = outerWireMesh.rotation.x;

      pointsMesh.rotation.y = outerWireMesh.rotation.y;
      pointsMesh.rotation.x = outerWireMesh.rotation.x;

      // Inner diamond counter-rotation with gentle pulse
      innerMesh.rotation.y -= 0.014;
      innerMesh.rotation.z += 0.008;

      // Counter-rotating orbital rings
      ring1Mesh.rotation.z += 0.007;
      ring2Mesh.rotation.z -= 0.005;

      if (interactive) {
        logoGroup.rotation.x += (mouseY - logoGroup.rotation.x) * 0.06;
        logoGroup.rotation.y += (mouseX - logoGroup.rotation.y) * 0.06;
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
      innerGeo.dispose();
      outerWireMat.dispose();
      outerFacetMat.dispose();
      pointsMat.dispose();
      innerMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
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
