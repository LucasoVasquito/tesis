// Tests de derivePalette. Se corren con: npm test  (node --test, TypeScript sin compilar)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// El módulo es TypeScript puro: se transpila al vuelo, sin dependencias.
const src = fs.readFileSync(new URL('./derivePalette.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { derivePalette, buildTheme, DEFAULT_PALETTE, hexToOklch, textOn, contrastRatio, parseColor, oklchToHex } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const oklchHex = c => oklchToHex(parseColor(c));
const RED = '#C8472F';
const BLUE = '#2F5FC8';
const YELLOW = '#E2B23C';
const GREEN = '#3FA866';

test('solo frecuencia: el ranking define primario, secundario y acento', () => {
  const p = derivePalette(
    [
      { hex: YELLOW, weight: 1 },
      { hex: BLUE, weight: 5 },
      { hex: RED, weight: 3 },
    ],
    [],
    {},
  );
  assert.equal(p.primary, BLUE);
  assert.equal(p.secondary, RED);
  assert.equal(p.accent, YELLOW);
});

test('las referencias del usuario pesan el doble que lo inferido por el sistema', () => {
  const p = derivePalette(
    [
      { hex: RED, weight: 3, source: 'agent' },
      { hex: BLUE, weight: 2, source: 'user' },
    ],
    [],
    {},
  );
  assert.equal(p.primary, BLUE); // 2×2 = 4 > 3
});

test('la jerarquía manda sobre la frecuencia', () => {
  const p = derivePalette(
    [
      { hex: BLUE, weight: 9 },
      { hex: RED, weight: 1 },
    ],
    [
      { id: 'a', layer: 1, hex: RED, frequency: 4 },
      { id: 'b', layer: 1, hex: YELLOW, frequency: 9 },
    ],
    {},
  );
  assert.equal(p.primary, YELLOW); // la pieza de Núcleo con más frecuencia
});

test('capa sin color: el rol se completa con el siguiente del ranking no usado', () => {
  const p = derivePalette(
    [
      { hex: BLUE, weight: 9 },
      { hex: RED, weight: 5 },
      { hex: GREEN, weight: 3 },
      { hex: YELLOW, weight: 1 },
    ],
    [
      { id: 'n', layer: 1, hex: RED, frequency: 5 },
      { id: 'a', layer: 3, hex: GREEN, frequency: 2 },
    ],
    {},
  );
  assert.equal(p.primary, RED);
  assert.equal(p.secondary, BLUE); // Soporte sin color → el más frecuente que no está usado
  assert.equal(p.accent, GREEN);
});

test('override a negro: manda sobre lo detectado y el fondo queda negro', () => {
  const p = derivePalette([{ hex: BLUE, weight: 5 }], [{ id: 'n', layer: 1, hex: RED, frequency: 5 }], { n: '#000000' });
  assert.equal(p.primary, '#000000');
  const t = buildTheme(p);
  assert.equal(t['--cc-bg'], 'oklch(0.000 0.000 0.0)');
  assert.ok(contrastRatio(t['--cc-text'], '#000000') >= 12); // el texto se adapta, el color no se corrige
  assert.notEqual(t['--cc-l0-edge'], 'transparent'); // negro sobre negro: lleva contorno
});

test('tres colores iguales: se respetan (se distinguen por nombre y número en la interfaz)', () => {
  const p = derivePalette(
    [],
    [
      { id: '1', layer: 1, hex: RED, frequency: 3 },
      { id: '2', layer: 2, hex: RED, frequency: 2 },
      { id: '3', layer: 3, hex: RED, frequency: 1 },
    ],
    {},
  );
  assert.equal(p.primary, RED);
  assert.equal(p.secondary, RED);
  assert.equal(p.accent, RED);
});

test('proyecto vacío: paleta neutra por defecto', () => {
  assert.deepEqual(derivePalette([], [], {}), DEFAULT_PALETTE);
});

test('tema: el fondo toma el tono del primario con L 0.14 y croma ≤ 0.02', () => {
  const t = buildTheme({ primary: BLUE, secondary: RED, accent: YELLOW });
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(t['--cc-bg']);
  assert.ok(m);
  assert.equal(Number(m[1]), 0.14);
  assert.ok(Number(m[2]) <= 0.02);
  assert.ok(Math.abs(Number(m[3]) - hexToOklch(BLUE)[2]) < 1);
});

test('tema: un primario más oscuro que 0.14 define su propia luminosidad', () => {
  const t = buildTheme({ primary: '#05051A', secondary: RED, accent: YELLOW });
  assert.ok(Number(/oklch\(([\d.]+)/.exec(t['--cc-bg'])[1]) < 0.14);
});

test('texto sobre claro u oscuro', () => {
  assert.equal(textOn(0.3), '#F4F1EC');
  assert.equal(textOn(0.8), '#141210');
});

test('contraste: los titulares y textos cumplen 3:1 / 4.5:1 contra el fondo, en dos paletas opuestas', () => {
  const pals = [
    { primary: '#C8472F', secondary: '#E2B23C', accent: '#5FB3AE' },
    { primary: '#1E3A8A', secondary: '#0B1220', accent: '#2B2B2B' },
  ];
  for (const pal of pals) {
    const t = buildTheme(pal);
    const bg = oklchHex(t['--cc-bg']);
    for (const n of [0, 1, 2]) {
      assert.ok(contrastRatio(bg, oklchHex(t['--cc-l' + n + '-ink'])) >= 4.5, 'ink ' + n);
      assert.ok(contrastRatio(bg, oklchHex(t['--cc-l' + n + '-head'])) >= 3, 'head ' + n);
    }
    assert.ok(contrastRatio(bg, t['--cc-text']) >= 7);
  }
});

test('fondo forzado a blanco: todo se recalcula y el texto sigue legible', () => {
  const t = buildTheme({ primary: '#C8472F', secondary: '#E2B23C', accent: '#5FB3AE' }, { bg: '#FFFFFF' });
  assert.equal(t['--cc-text'], '#141210');
  assert.ok(contrastRatio('#FFFFFF', t['--cc-text']) >= 4.5);
  for (const n of [0, 1, 2]) assert.ok(contrastRatio('#FFFFFF', oklchHex(t['--cc-l' + n + '-ink'])) >= 4.5, 'ink ' + n);
  assert.equal(t['--cc-text-muted'], 'rgba(20, 18, 16, 0.75)');
});
