import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

export type DatatomsLogoProps = {
  size?: number;
  className?: string;
  color?: string | number;
};

export function DatatomsLogoWebgl({ size = 28, className, color }: DatatomsLogoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const targetProgress = useRef(0);
  const currentProgress = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark =
      typeof window !== 'undefined' &&
      document.documentElement.classList.contains('dark');

    // 1. Configuração Básica do Three.js
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 55;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. O Buraco Negro no Centro
    const bhRadius = 5;
    const bhGeometry = new THREE.SphereGeometry(bhRadius, 64, 64);
    const originalBhPositions = bhGeometry.attributes.position.clone();

    const bhMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x000000,
      depthWrite: true
    });
    const blackHole = new THREE.Mesh(bhGeometry, bhMaterial);
    scene.add(blackHole);

    // 3. Sistema de Partículas (Esfera de poeira estelar)
    const particleCount = 4000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const spherePositions = new Float32Array(particleCount * 3);
    const explodePositions = new Float32Array(particleCount * 3);

    const radius = 10;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      const phi = Math.acos(-1 + (2 * i) / particleCount);
      const theta = Math.sqrt(particleCount * Math.PI) * phi;
      
      spherePositions[i3] = radius * Math.cos(theta) * Math.sin(phi);
      spherePositions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      spherePositions[i3 + 2] = radius * Math.cos(phi);

      const u = Math.random();
      const v = Math.random();
      const thetaExp = u * 2.0 * Math.PI;
      const phiExp = Math.acos(2.0 * v - 1.0);
      
      const expRadius = THREE.MathUtils.lerp(radius + 3, radius + 11, Math.random());
      
      explodePositions[i3] = expRadius * Math.sin(phiExp) * Math.cos(thetaExp);
      explodePositions[i3 + 1] = expRadius * Math.sin(phiExp) * Math.sin(thetaExp);
      explodePositions[i3 + 2] = expRadius * Math.cos(phiExp);

      positions[i3] = spherePositions[i3];
      positions[i3 + 1] = spherePositions[i3 + 1];
      positions[i3 + 2] = spherePositions[i3 + 2];
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pointSize = 64;
    const canvas = document.createElement('canvas');
    canvas.width = pointSize;
    canvas.height = pointSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const gradient = ctx.createRadialGradient(
      pointSize / 2, pointSize / 2, 0,
      pointSize / 2, pointSize / 2, pointSize / 2
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, pointSize, pointSize);
    const pointTexture = new THREE.CanvasTexture(canvas);

    // Cor das partículas no 3D
    const materialColor = color || (isDark ? 0xffffff : 0x1e293b);
    const material = new THREE.PointsMaterial({
      size: 0.25,
      color: materialColor,
      transparent: true,
      opacity: 0.8,
      blending: THREE.NormalBlending,
      map: pointTexture,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 4. Anéis Orbitais (Aparência de Átomo)
    const ringsGroup = new THREE.Group();

    const ringRadius = 14;
    const ringThickness = 0.04;
    const ringGeometry = new THREE.TorusGeometry(ringRadius, ringThickness, 16, 100);
    
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: materialColor,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });

    const ring1 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring1.rotation.x = Math.PI / 2; 

    const ring2 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring2.rotation.x = Math.PI / 3;
    ring2.rotation.y = Math.PI / 3; 

    const ring3 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring3.rotation.x = Math.PI / 3;
    ring3.rotation.y = -Math.PI / 3; 

    ringsGroup.add(ring1, ring2, ring3);
    scene.add(ringsGroup);

    let animationFrameId: number;
    let time = 0;
    const vertex = new THREE.Vector3();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      time += 0.003;

      // Rotações
      particles.rotation.y = time;
      particles.rotation.z = time * 0.3;
      blackHole.rotation.y = time;

      // Rotação individual dos anéis
      ring1.rotation.z = time * 0.8;
      ring2.rotation.z = time * 0.8;
      ring3.rotation.z = time * 0.8;
      
      // Rotação do grupo de anéis
      ringsGroup.rotation.y = time * 0.2;
      ringsGroup.rotation.x = time * 0.1;

      // --- Deformação do Buraco Negro ---
      const bhPositions = bhGeometry.attributes.position;
      for (let i = 0; i < bhPositions.count; i++) {
        vertex.fromBufferAttribute(originalBhPositions, i);
        const normalizeVertex = vertex.clone().normalize();
        
        const freqX = normalizeVertex.x * 2.0 + time * 3.0;
        const freqY = normalizeVertex.y * 2.0 + time * 2.5;
        const freqZ = normalizeVertex.z * 2.0 + time * 2.0;
        
        const noise = Math.sin(freqX) * Math.cos(freqY) * Math.sin(freqZ);
        const displacement = noise * 0.5; 
        
        vertex.add(normalizeVertex.multiplyScalar(displacement));
        bhPositions.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      bhPositions.needsUpdate = true;

      // --- Expansão ---
      currentProgress.current += (targetProgress.current - currentProgress.current) * 0.08;

      const positionsAttribute = geometry.attributes.position;
      if (Math.abs(targetProgress.current - currentProgress.current) > 0.001) {
        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3;
          positionsAttribute.array[i3] = THREE.MathUtils.lerp(
            spherePositions[i3], 
            explodePositions[i3], 
            currentProgress.current
          );
          positionsAttribute.array[i3 + 1] = THREE.MathUtils.lerp(
            spherePositions[i3 + 1], 
            explodePositions[i3 + 1], 
            currentProgress.current
          );
          positionsAttribute.array[i3 + 2] = THREE.MathUtils.lerp(
            spherePositions[i3 + 2], 
            explodePositions[i3 + 2], 
            currentProgress.current
          );
        }
        positionsAttribute.needsUpdate = true;

        const ringScale = THREE.MathUtils.lerp(1, 1.15, currentProgress.current);
        ringsGroup.scale.set(ringScale, ringScale, ringScale);
      }

      renderer.render(scene, camera);
    };

    animate();

    // 6. Tratamento de Redimensionamento
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      pointTexture.dispose();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      bhGeometry.dispose();
      bhMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
    };
  }, []);

  const px = `${size}px`;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center overflow-hidden", className)}
      style={{ width: px, height: px }}
      onMouseEnter={() => {
        targetProgress.current = 1;
      }}
      onMouseLeave={() => {
        targetProgress.current = 0;
      }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
      />
    </div>
  );
}

export default DatatomsLogoWebgl;