import { Project, VisualSystem, Pattern, Reference, VisualSystemExportData } from '../types';

export function exportVisualSystemAsJSON(system: VisualSystem, project: Project) {
  const assignedPatterns = project.patterns.filter(p => system.patternIds.includes(p.id));
  const relevantRefIds = Array.from(new Set(assignedPatterns.flatMap(p => p.evidence)));
  const supportingRefs = project.references
    .filter(r => relevantRefIds.includes(r.id))
    .map(r => ({
      id: r.id,
      name: r.name,
      tags: r.tags,
      notes: r.notes,
      image: r.image,
    }));

  const exportData: VisualSystemExportData = {
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
      graphicResources: assignedPatterns.filter(p => p.category === 'graphic_elements').map(p => p.name),
    },
    projectContext: {
      projectName: project.name,
      objective: project.objective,
      description: project.description,
    },
    confirmedPatterns: assignedPatterns.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      evidence: p.evidence,
      designerNotes: p.designerNotes,
    })),
    supportingReferences: supportingRefs,
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `sistema_visual_${system.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function parseVisualSystemJSON(jsonText: string): VisualSystemExportData | null {
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !parsed.system || !parsed.system.name) {
      throw new Error("El archivo JSON no contiene una estructura válida de sistema visual.");
    }
    return parsed as VisualSystemExportData;
  } catch (err) {
    console.error("Error al procesar JSON de sistema visual:", err);
    return null;
  }
}

export function exportProjectAsJSON(project: Project) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${project.name.toLowerCase().replace(/\s+/g, '_')}_emergent_system.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function generateSystemMarkdown(project: Project): string {
  let md = `# ${project.name}\n\n`;
  md += `**Objetivo:** ${project.objective}\n\n`;
  md += `**Descripción:** ${project.description}\n\n`;
  md += `*Generado con Emergent - Visual Pattern Explorer (${new Date().toLocaleDateString()})*\n\n`;
  md += `---\n\n`;

  md += `## 1. Referencias Analizadas (${project.references.length})\n\n`;
  project.references.forEach((ref, idx) => {
    md += `- **[${ref.id}] ${ref.name}**: ${ref.tags?.join(', ') || 'Sin tags'}\n`;
    if (ref.notes) md += `  - *Nota:* ${ref.notes}\n`;
  });
  md += `\n---\n\n`;

  md += `## 2. Sistemas Visuales Construidos (${project.systems.length})\n\n`;
  if (project.systems.length === 0) {
    md += `*No se han confirmado sistemas visuales aún.*\n\n`;
  } else {
    project.systems.forEach((sys, idx) => {
      md += `### Sistema ${idx + 1}: ${sys.name}\n`;
      md += `${sys.description}\n\n`;
      
      if (sys.aestheticPillars && sys.aestheticPillars.length > 0) {
        md += `**Pilares Estéticos:**\n`;
        sys.aestheticPillars.forEach(p => md += `- ${p}\n`);
        md += `\n`;
      }

      const assignedPatterns = project.patterns.filter(p => sys.patternIds.includes(p.id));
      md += `**Patrones Confirmados (${assignedPatterns.length}):**\n`;
      assignedPatterns.forEach(p => {
        md += `- **[${p.category.toUpperCase()}] ${p.name}** (Evidencia en ${p.evidence.length} refs: ${p.evidence.join(', ')})\n`;
        md += `  ${p.description}\n`;
      });
      md += `\n`;
    });
  }

  md += `\n---\n\n`;
  md += `## 3. Registro de Decisiones y Feedback del Diseñador (${project.feedback.length})\n\n`;
  project.feedback.forEach(f => {
    md += `- **[${f.type}]** ${f.comment} *(Fecha: ${new Date(f.createdAt).toLocaleDateString()})*\n`;
  });

  return md;
}

export function downloadProjectMarkdown(project: Project) {
  const md = generateSystemMarkdown(project);
  const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${project.name.toLowerCase().replace(/\s+/g, '_')}_dossier.md`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
