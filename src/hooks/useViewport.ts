import { useEffect, useState } from 'react';

export type Viewport = 'desktop' | 'tablet' | 'mobile';

/** Escritorio desde 1024px, tablet de 768 a 1023px, móvil por debajo de 768px. */
export const viewportFor = (w: number): Viewport => (w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'mobile');

export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>(() => viewportFor(typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setV(viewportFor(window.innerWidth));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

export const isTouchDevice = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
