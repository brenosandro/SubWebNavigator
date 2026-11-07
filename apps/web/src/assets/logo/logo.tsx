import { Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import type { DatatomsLogoProps } from './logo-webgl';

// O logo animado usa three.js (~530 KB). Como ele aparece no AppLayout, na
// Sidebar e no LoadingScreen, importá-lo estaticamente colocava a biblioteca
// inteira no caminho crítico de TODA a aplicação — inclusive da tela de
// carregamento. Carregando sob demanda, o three.js só é baixado depois que a
// aplicação já está na tela, e o desenho estático abaixo segura o lugar.
const DatatomsLogoWebgl = lazy(() => import('./logo-webgl'));

/** Marca estática, sem WebGL: mesmo enquadramento do logo animado. */
function DatatomsLogoStatic({ size = 28, className, color }: DatatomsLogoProps) {
  const px = `${size}px`;
  const stroke = typeof color === 'string' ? color : 'currentColor';

  return (
    <div
      className={cn('relative inline-flex items-center justify-center overflow-hidden', className)}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width={size} height={size} fill="none">
        <ellipse
          cx="16"
          cy="16"
          rx="14"
          ry="5.5"
          stroke={stroke}
          strokeOpacity="0.55"
          strokeWidth="1.25"
          transform="rotate(-24 16 16)"
        />
        <circle cx="16" cy="16" r="3.25" fill={stroke} />
      </svg>
    </div>
  );
}

export function DatatomsLogo(props: DatatomsLogoProps) {
  return (
    <Suspense fallback={<DatatomsLogoStatic {...props} />}>
      <DatatomsLogoWebgl {...props} />
    </Suspense>
  );
}

export default DatatomsLogo;
