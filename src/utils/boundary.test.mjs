// Tests de límite del sistema, primario en export y firmas reactivas. Se corren con: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
require.extensions['.ts'] = (mod, filename) => {
  const src = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  mod._compile(js, filename);
};

const { BOUNDARIES, DEFAULT_BOUNDARY, boundaryInfo, detectBoundaryRule } = require('./boundary.ts');
const { fullRule } = require('./layerRules.ts');
const { buildExportJson, buildExportPrompt } = require('./exportKit.ts');
const { buildProbarPrompt, buildRecipe, selectDecisions } = require('./probar.ts');
const { structureSig } = require('./structure.ts');

const sampleProject = (overrides = {}) => ({
  id: 'proj_test',
  name: 'BADDER',
  intent: 'Plataforma cultural de música electrónica',
  objective: 'Identidad visual reconocible.',
  description: '',
  status: 'analyzed',
  createdAt: '2026-01-01T00:00:00Z',
  references: [
    { id: 'ref_1', name: 'R1', image: 'data:image/png;base64,AAAA', createdAt: '' },
    { id: 'ref_2', name: 'R2', image: 'data:image/png;base64,BBBB', createdAt: '' },
  ],
  patterns: [
    {
      id: 'pat_1',
      name: 'Tipografía de burbuja orgánica',
      category: 'typography',
      description: 'Letras infladas de contornos redondeados y peso irregular.',
      systemHypothesis: 'Emplear en piezas editoriales juveniles, indumentaria y stickers.',
      evidence: ['ref_1'],
      confidence: 0.9,
      status: 'confirmed',
      layer: 1,
      origin: 'user',
      confirmed: true,
      relatedObservations: [],
    },
    {
      id: 'pat_2',
      name: 'Tramado de medio tono grueso',
      category: 'texture',
      description: 'Trama de puntos de serigrafía amplificada.',
      evidence: ['ref_2'],
      confidence: 0.8,
      status: 'confirmed',
      layer: 2,
      origin: 'agent',
      confirmed: true,
      relatedObservations: [],
    },
  ],
  systems: [],
  feedback: [],
  systemSheet: {
    sig: '',
    userRules: ['Reservá el acento verde brillante solo para sellos de advertencia.'],
    rules: ['Usá la tipografía de burbuja únicamente en titulares.'],
    fonts: [],
  },
  structureSheet: {
    sig: '',
    userRules: ['La información secundaria va al perímetro.'],
    rules: [{ text: 'Saturá el plano con Tramado de medio tono grueso.', refIds: ['ref_1'] }],
  },
  ...overrides,
});

test('por defecto el límite es cerrado y conserva el cierre estricto', () => {
  assert.equal(DEFAULT_BOUNDARY, 'closed');
  assert.equal(boundaryInfo(undefined).id, 'closed');
  assert.match(boundaryInfo('closed').exportPrompt, /No agregues elementos ajenos al sistema/);
  assert.match(boundaryInfo('closed').probarLine, /Do not add elements foreign to the system/);
});

test('cada modo del límite produce un cierre propio para export y Probar', () => {
  assert.equal(BOUNDARIES.length, 3);
  assert.match(boundaryInfo('open_type').exportPrompt, /abierto en tipografía/i);
  assert.match(boundaryInfo('open_type').exportPrompt, /nunca agregues colores ni imágenes/i);
  assert.match(boundaryInfo('open_type').probarLine, /open in typography only/i);
  assert.match(boundaryInfo('open').exportPrompt, /abierto\./i);
  assert.match(boundaryInfo('open').probarLine, /boundary: open/i);
});

test('buildExportJson, buildExportPrompt y buildProbarPrompt leen el límite desde la misma fuente única', () => {
  const palette = { primary: '#1A1A1A', secondary: '#B83637', accent: '#85E83B' };
  const pOpenType = sampleProject({ boundary: 'open_type' });
  const json = buildExportJson(pOpenType, palette, () => undefined);
  assert.equal(json.boundary.mode, 'open_type');
  const exportPrompt = buildExportPrompt(json);
  assert.match(exportPrompt, /abierto en tipografía/i);
  assert.doesNotMatch(exportPrompt, /^No agregues elementos ajenos al sistema/m);

  const recipe = buildRecipe(pOpenType, 'poster');
  const sel = selectDecisions(recipe, id => recipe.suggested.has(id));
  const probarPrompt = buildProbarPrompt(pOpenType, {
    type: 'poster',
    sel,
    direct: false,
    text: 'BADDER',
    request: '',
    transparent: false,
  });
  assert.match(probarPrompt, /open in typography only/i);
  assert.doesNotMatch(probarPrompt, /Do not add elements foreign to the system/);
});

test('Primario pone primero la descripción de cómo se ve y después dónde se aplica', () => {
  const p = sampleProject();
  const rule = fullRule(p.patterns[0]);
  assert.ok(rule.startsWith('Letras infladas de contornos redondeados y peso irregular.'));
  assert.ok(rule.includes('Emplear en piezas editoriales juveniles, indumentaria y stickers.'));

  const json = buildExportJson(p, { primary: '#1A1A1A', secondary: '#B83637', accent: '#85E83B' }, () => undefined);
  assert.ok(json.layers.nucleo.pieces[0].rule.startsWith('Letras infladas'));
});

test('structureSig cambia cuando cambia el límite o una regla del usuario en cualquiera de los dos lados', () => {
  const base = sampleProject({ boundary: 'closed' });
  const sigBase = structureSig(base);
  const sigBoundary = structureSig(sampleProject({ boundary: 'open_type' }));
  const sigStructRule = structureSig(
    sampleProject({
      boundary: 'closed',
      structureSheet: { sig: '', userRules: ['Otra regla de estructura'], rules: [] },
    }),
  );
  const sigUsageRule = structureSig(
    sampleProject({
      boundary: 'closed',
      systemSheet: { sig: '', userRules: ['Otra regla de uso'], rules: [], fonts: [] },
    }),
  );
  assert.notEqual(sigBoundary, sigBase);
  assert.notEqual(sigStructRule, sigBase);
  assert.notEqual(sigUsageRule, sigBase);
});

test('detectBoundaryRule detecta reglas que tocan el límite y sugiere el modo correcto', () => {
  assert.equal(
    detectBoundaryRule('Agrega elementos tipograficos ajenos al sistema: si hace falta llenar espacio, llenalo con nuevos recursos.'),
    'open_type',
  );
  assert.equal(
    detectBoundaryRule('Se pueden sumar tipografías de otros estilos para llenar; colores e imágenes nuevas, nunca.'),
    'open_type',
  );
  assert.equal(detectBoundaryRule('No agregues elementos ajenos al sistema'), 'closed');
  assert.equal(detectBoundaryRule('Solo usar recursos del sistema, nada de afuera'), 'closed');
  assert.equal(detectBoundaryRule('Agregá nuevos recursos y elementos ajenos cuando haga falta'), 'open');
});

test('detectBoundaryRule no da falsos positivos en reglas normales de uso o estructura', () => {
  const normal = [
    'Saturá los espacios vacíos acumulando Tramado de medio tono grueso y Marcos de alambre y espinas.',
    'Usá saltos de escala extremos: el titular es gigante y el texto secundario se reduce al mínimo.',
    'La información secundaria y legal se ubica siempre pegada al perímetro, jamás en el centro.',
    'Rompé la grilla estándar inclinando franjas de texto en diagonal o disponiéndolas de manera vertical.',
    'Usá la tipografía en perspectiva únicamente para el titular principal.',
    'Aplicá la composición radial con una sola estructura en cadena.',
    'Reservá el acento verde brillante solo para sellos de advertencia.',
    'No ubiques la mascota cartoon sobre tramas de medio tono.',
  ];
  for (const rule of normal) {
    assert.equal(detectBoundaryRule(rule), null, `no debía detectar límite en: ${rule}`);
  }
});
