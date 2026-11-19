// Tests de dedupePieces. Se corren con: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const src = fs.readFileSync(new URL('./dedupe.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { dedupePieces } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const piece = (id, name, layer, extra = {}) => ({ id, name, layer, evidence: [], status: 'detected', origin: 'agent', confirmed: false, ...extra });

test('dos piezas con el mismo título en la misma capa se fusionan con la suma de sus referencias', () => {
  const p = { patterns: [piece('a', 'texturas plastico', 1, { evidence: ['r1', 'r2'] }), piece('b', 'Texturas  plástico', 1, { evidence: ['r2', 'r3'] })], fragments: [] };
  const { project, merged } = dedupePieces(p);
  assert.equal(merged, 1);
  assert.equal(project.patterns.length, 1);
  assert.deepEqual(project.patterns[0].evidence.sort(), ['r1', 'r2', 'r3']);
});

test('queda la pieza del usuario o la confirmada', () => {
  const p = { patterns: [piece('a', 'Marco', 2), piece('b', 'Marco', 2, { origin: 'user', confirmed: true })], fragments: [] };
  assert.equal(dedupePieces(p).project.patterns[0].id, 'b');
});

test('el mismo título en capas distintas no se toca, ni lo descartado', () => {
  const p = { patterns: [piece('a', 'Marco', 1), piece('b', 'Marco', 2), piece('c', 'Marco', 1, { status: 'discarded' })], fragments: [] };
  const { project, merged } = dedupePieces(p);
  assert.equal(merged, 0);
  assert.equal(project.patterns.length, 3);
});

test('es idempotente', () => {
  const p = { patterns: [piece('a', 'X', 1), piece('b', 'X', 1)], fragments: [] };
  const once = dedupePieces(p).project;
  assert.equal(dedupePieces(once).merged, 0);
});
