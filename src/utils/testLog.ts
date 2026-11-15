/**
 * Modo testeo: con ?test=1 se registran eventos en localStorage (cc-test-log), cada uno con marca de tiempo y etapa.
 * Sin ?test=1 no se registra nada. Ctrl+Shift+E descarga el registro.
 */
const KEY = 'cc-test-log';

export const testMode = (() => {
  try {
    return new URLSearchParams(location.search).get('test') === '1';
  } catch {
    return false;
  }
})();

let stage = 'referencias';
export const setLogStage = (s: string) => {
  stage = s;
};

export type TestEvent =
  | 'stage_enter'
  | 'stage_leave'
  | 'blocked_click'
  | 'undo'
  | 'error_shown'
  | 'drag_start'
  | 'drop'
  | 'color_edit'
  | 'eyedropper_start'
  | 'approve'
  | 'export'
  | 'help_open';

const read = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};

export function logEvent(type: TestEvent, data: Record<string, unknown> = {}) {
  if (!testMode) return;
  try {
    const list = read();
    list.push({ t: new Date().toISOString(), ms: Date.now(), stage, type, ...data });
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sin almacenamiento: no se registra */
  }
}

/** Descarga el registro como test-{fecha}-{hora}.json. */
export function downloadTestLog() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `test-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
  const blob = new Blob([JSON.stringify(read(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return name;
}

export const clearTestLog = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
};
