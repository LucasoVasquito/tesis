import { Project, TraceableField, VisualSystem, VisualSystemExportData } from '../types';
import { mergedLog } from './log';

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'emergent';

/** Descarga un texto como archivo (Blob, sin límite de tamaño de data URL). */
export function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Sistema (.json) ---------- */
export function buildVisualSystemExport(system: VisualSystem, project: Project): VisualSystemExportData {
  const patterns = project.patterns.filter(p => system.patternIds.includes(p.id));
  const refIds = new Set(patterns.flatMap(p => p.evidence));
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    system: {
      name: system.name,
      description: system.description,
      aestheticPillars: system.aestheticPillars || [],
      colorPalette: system.colorPalette,
      typographyRules: system.typographyRules,
      textureRules: system.textureRules,
      compositionRules: system.compositionRules,
      graphicResources: patterns.filter(p => p.category === 'graphic_elements').map(p => p.name),
    },
    projectContext: { projectName: project.name, objective: project.objective, description: project.description },
    confirmedPatterns: patterns.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      evidence: p.evidence,
      designerNotes: p.designerNotes,
    })),
    supportingReferences: project.references
      .filter(r => refIds.has(r.id))
      .map(r => ({ id: r.id, name: r.name, tags: r.tags, notes: r.notes, image: r.image })),
  };
}

export function exportVisualSystemAsJSON(system: VisualSystem, project: Project) {
  downloadText(JSON.stringify(buildVisualSystemExport(system, project), null, 2), `sistema_${slug(system.name)}.json`, 'application/json');
}

export function parseVisualSystemJSON(jsonText: string): VisualSystemExportData | null {
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !parsed.system || !parsed.system.name) return null;
    return parsed as VisualSystemExportData;
  } catch {
    return null;
  }
}

/* ---------- Proyecto (.json) ---------- */
export function exportProjectAsJSON(project: Project) {
  downloadText(JSON.stringify(project, null, 2), `${slug(project.name)}_emergent.json`, 'application/json');
}

/* ---------- Markdown ---------- */
const traced = (items: string[] | undefined, sources: string[][] | undefined) =>
  (items ?? []).map((it, i) => `- ${it}${sources?.[i]?.length ? ` \`← ${sources[i].join(', ')}\`` : ''}`).join('\n');

const RULES: [TraceableField, string][] = [
  ['typographyRules', 'Tipografía'],
  ['textureRules', 'Textura y materialidad'],
  ['compositionRules', 'Composición y retícula'],
];

/** Lineamientos de un sistema, con trazabilidad a patrones y referencias. */
export function buildSystemMarkdown(project: Project, system: VisualSystem): string {
  const patterns = project.patterns.filter(p => system.patternIds.includes(p.id));
  const palette = (system.colorPalette ?? []).map(c => `| \`${c.hex}\` | ${c.name || ''} | ${c.role || ''} | ${c.source ? `\`${c.source}\`` : '—'} |`).join('\n');
  const rules = RULES.filter(([f]) => system[f]?.length)
    .map(([f, label]) => `### ${label}\n${traced(system[f] as string[], system.sources?.[f])}`)
    .join('\n\n');
  const pats = patterns
    .map(
      p =>
        `### ${p.id} · ${p.name}\n- **Categoría:** \`${p.category}\` · **Confianza:** ${(p.confidence ?? 0).toFixed(2)}\n- **Evidencia:** ${p.evidence.map(e => `\`${e}\``).join(', ') || '—'}\n\n${p.description}${p.designerNotes ? `\n\n> Nota del diseñador: ${p.designerNotes}` : ''}`,
    )
    .join('\n\n');

  return `# ${system.name}
**Proyecto:** ${project.name}
**Objetivo:** ${project.objective}
**Fecha:** ${new Date().toLocaleDateString('es-AR')}

---

## 1. Concepto
${system.description || '_Sin descripción redactada._'}

### Pilares
${traced(system.aestheticPillars, system.sources?.aestheticPillars) || '_Sin pilares._'}

## 2. Paleta inferida del corpus
${palette ? `| HEX | Nombre | Rol | Origen |\n|---|---|---|---|\n${palette}` : '_Sin paleta inferida._'}

## 3. Reglas
${rules || '_Sin reglas redactadas._'}

## 4. Patrones confirmados (${patterns.length})
${pats || '_Sin patrones asignados._'}

---
*Lineamientos generados con Emergent. Cada pilar y regla indica los patrones que lo sostienen; cada color, su referencia o patrón de origen.*
`;
}

/** Dossier académico del proyecto completo, con la bitácora de decisiones. */
export function generateSystemMarkdown(project: Project): string {
  const confirmed = project.patterns.filter(p => p.status === 'confirmed');
  const discarded = project.patterns.filter(p => p.status === 'discarded');
  const pending = project.patterns.filter(p => p.status === 'detected');
  const log = mergedLog(project);

  let md = `# ${project.name || 'Proyecto sin nombre'}\n\n`;
  md += `**Objetivo:** ${project.objective}\n\n`;
  if (project.description) md += `**Contexto:** ${project.description}\n\n`;
  md += `*Dossier generado con Emergent (${new Date().toLocaleDateString('es-AR')})*\n\n---\n\n`;

  md += `## 1. Corpus (${project.references.length} referencias)\n\n`;
  project.references.forEach(r => {
    md += `- **\`${r.id}\`** ${r.name}${r.tags?.length ? ` · ${r.tags.join(', ')}` : ''}\n`;
    if (r.notes) md += `  - ${r.notes}\n`;
  });

  md += `\n## 2. Auditoría de patrones\n\n`;
  md += `${confirmed.length} confirmados · ${discarded.length} descartados · ${pending.length} pendientes\n\n`;
  const section = (title: string, list: typeof confirmed, extra?: (p: (typeof confirmed)[number]) => string) => {
    if (!list.length) return;
    md += `### ${title}\n\n`;
    list.forEach(p => {
      md += `- **\`${p.id}\` ${p.name}** (\`${p.category}\`, confianza ${(p.confidence ?? 0).toFixed(2)}) · evidencia: ${p.evidence.map(e => `\`${e}\``).join(', ')}\n`;
      if (extra) md += extra(p);
    });
    md += `\n`;
  };
  section('Confirmados', confirmed, p => (p.designerNotes ? `  - Nota: ${p.designerNotes}\n` : ''));
  section('Descartados', discarded, p => `  - Motivo: ${p.discardReason || '—'}\n`);
  section('Pendientes', pending);

  md += `## 3. Sistemas (${project.systems.length})\n\n`;
  if (!project.systems.length) md += `_Todavía no se armaron sistemas._\n\n`;
  project.systems.forEach((s, i) => {
    md += `### ${i + 1}. ${s.name}${s.adoptedFrom ? ' _(sugerencia adoptada)_' : ''}\n\n`;
    if (s.description) md += `${s.description}\n\n`;
    md += `- **Patrones:** ${s.patternIds.map(id => `\`${id}\``).join(', ') || '—'}\n`;
    if (s.colorPalette?.length) md += `- **Paleta:** ${s.colorPalette.map(c => `\`${c.hex}\`${c.source ? ` ← \`${c.source}\`` : ''}`).join(', ')}\n`;
    if (s.aestheticPillars?.length) md += `- **Pilares:**\n${traced(s.aestheticPillars, s.sources?.aestheticPillars).replace(/^/gm, '  ')}\n`;
    md += `\n`;
  });

  md += `## 4. Bitácora (${log.length} entradas)\n\n`;
  [...log].reverse().forEach(e => {
    md += `- \`${new Date(e.at).toLocaleString('es-AR')}\` · \`${e.targetId}\` · **${e.label}**${e.reason ? ` — _${e.reason}_` : ''}\n`;
  });

  return md;
}

export function downloadProjectMarkdown(project: Project) {
  downloadText(generateSystemMarkdown(project), `${slug(project.name)}_dossier.md`, 'text/markdown');
}

export function downloadSystemMarkdown(project: Project, system: VisualSystem) {
  downloadText(buildSystemMarkdown(project, system), `lineamientos_${slug(system.name)}.md`, 'text/markdown');
}
