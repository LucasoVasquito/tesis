import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CropBox } from '../types';

interface CropProps {
  image: string;
  /** Recorte normalizado 0..1. Sin recorte: la imagen entera. */
  crop?: CropBox;
  /** Proporción de la imagen de origen (ancho / alto), para que el recorte no se deforme. Si falta, se mide. */
  sourceRatio?: number;
  /** 'inside' muestra el recorte entero dentro de la caja, sin cortar nada; 'contain' respeta la proporción del recorte; 'cover' llena la caja sin deformar. */
  fit?: 'contain' | 'cover' | 'inside';
  className?: string;
  style?: React.CSSProperties;
  alt: string;
}

/** Proporción real de cada imagen (se mide una vez). */
const ratios = new Map<string, number>();

function useSourceRatio(image: string, given?: number, needed = true) {
  const [ratio, setRatio] = useState(given && given > 0 ? given : ratios.get(image) ?? 0);
  useEffect(() => {
    if (given && given > 0) return setRatio(given);
    if (!needed) return;
    const known = ratios.get(image);
    if (known) return setRatio(known);
    let alive = true;
    const im = new Image();
    im.onload = () => {
      if (!im.naturalWidth || !im.naturalHeight) return;
      const v = im.naturalWidth / im.naturalHeight;
      ratios.set(image, v);
      if (alive) setRatio(v);
    };
    im.src = image;
    return () => {
      alive = false;
    };
  }, [image, given, needed]);
  return ratio;
}

/**
 * Recorte limpio de una referencia, sin marco. Dibuja la imagen de origen como fondo
 * escalado y desplazado: los fragmentos no duplican la imagen en el proyecto.
 * Nunca se estira ni se aplasta: con 'cover' el recorte llena la caja cortando lo que sobra, con 'contain' la caja toma su proporción.
 */
export function Crop({ image, crop, sourceRatio, fit = 'contain', className, style, alt }: CropProps) {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const ratio = useSourceRatio(image, sourceRatio, !!crop || fit === 'inside');
  const src = ratio > 0 ? ratio : 1;
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || fit === 'contain') return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [crop, fit]);

  const pos = (start: number, size: number) => (size >= 1 ? 0 : (start / (1 - size)) * 100);
  let bg: React.CSSProperties;
  if (fit === 'inside' && box.w > 0 && box.h > 0 && ratio > 0) {
    // Entero y centrado: una caja interior con la proporción exacta del fragmento, para que no se vea nada de lo que lo rodea.
    const s = Math.min(box.w / (c.w * ratio), box.h / c.h);
    const iw = c.w * ratio * s;
    const ih = c.h * s;
    return (
      <div ref={ref} role="img" aria-label={alt} className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
        <div style={{ width: iw, height: ih, backgroundImage: `url("${image}")`, backgroundSize: `${100 / c.w}% ${100 / c.h}%`, backgroundPosition: `${pos(c.x, c.w)}% ${pos(c.y, c.h)}%`, backgroundRepeat: 'no-repeat' }} />
      </div>
    );
  } else if (!crop) {
    bg = { backgroundImage: `url("${image}")`, backgroundSize: fit === 'inside' ? 'contain' : 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
  } else if (fit === 'cover' && box.w > 0 && box.h > 0 && ratio > 0) {
    // La imagen de origen se escala lo justo para que el recorte cubra la caja, centrado, sin deformarse.
    const s = Math.max(box.w / (c.w * ratio), box.h / c.h); // alto, en px, de la imagen de origen entera
    bg = {
      backgroundImage: `url("${image}")`,
      backgroundSize: `${ratio * s}px ${s}px`,
      backgroundPosition: `${box.w / 2 - (c.x + c.w / 2) * ratio * s}px ${box.h / 2 - (c.y + c.h / 2) * s}px`,
      backgroundRepeat: 'no-repeat',
    };
  } else {
    bg = {
      backgroundImage: `url("${image}")`,
      backgroundSize: `${100 / c.w}% ${100 / c.h}%`,
      backgroundPosition: `${pos(c.x, c.w)}% ${pos(c.y, c.h)}%`,
      backgroundRepeat: 'no-repeat',
    };
  }
  const aspect = fit === 'contain' ? (c.w * src) / c.h : 0;
  return <div ref={ref} role="img" aria-label={alt} className={className} style={{ ...(aspect ? { aspectRatio: String(aspect) } : {}), ...bg, ...style }} />;
}
