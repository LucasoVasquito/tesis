import React from 'react';
import { CropBox } from '../types';

interface CropProps {
  image: string;
  /** Recorte normalizado 0..1. Sin recorte: la imagen entera. */
  crop?: CropBox;
  /** Proporción de la imagen de origen (ancho / alto), para que el recorte no se deforme. */
  sourceRatio?: number;
  /** 'contain' respeta la proporción del recorte; 'cover' llena la caja. */
  fit?: 'contain' | 'cover';
  className?: string;
  style?: React.CSSProperties;
  alt: string;
}

/**
 * Recorte limpio de una referencia, sin marco. Dibuja la imagen de origen como fondo
 * escalado y desplazado: los fragmentos no duplican la imagen en el proyecto.
 */
export function Crop({ image, crop, sourceRatio, fit = 'contain', className, style, alt }: CropProps) {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  // Sin proporción conocida se asume imagen cuadrada (mejor que una caja sin alto).
  const ratio = (c.w * (sourceRatio && sourceRatio > 0 ? sourceRatio : 1)) / c.h;
  const pos = (start: number, size: number) => (size >= 1 ? 0 : (start / (1 - size)) * 100);
  const bg: React.CSSProperties = crop
    ? {
        backgroundImage: `url("${image}")`,
        backgroundSize: `${100 / c.w}% ${100 / c.h}%`,
        backgroundPosition: `${pos(c.x, c.w)}% ${pos(c.y, c.h)}%`,
        backgroundRepeat: 'no-repeat',
      }
    : { backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{ ...(fit === 'contain' && ratio ? { aspectRatio: String(ratio) } : {}), ...bg, ...style }}
    />
  );
}
