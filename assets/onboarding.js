(function () {
  const STORAGE_PROJECT_KEY = "emergent_visual_system_project_v3";
  const STORAGE_STORE_KEY = "emergent_visual_system_projects_store_v4";
  const STORAGE_CONFIRMED_KEY = "emergent_user_brief_confirmed";

  // Helper to get active project from localStorage
  function getActiveProject() {
    try {
      const raw = localStorage.getItem(STORAGE_PROJECT_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error reading project from localStorage", e);
    }
    return null;
  }

  // Helper to save active project and sync store
  function saveActiveProject(name, objective, description) {
    let proj = getActiveProject() || {};

    if (!proj.id || proj.id === "proj_burger_club" || proj.id === "proj_badder") {
      proj.id = "proj_user_" + Date.now();
    }

    proj.name = name.trim();
    proj.objective = objective.trim();
    proj.description = description.trim();
    proj.references = Array.isArray(proj.references) ? proj.references : [];
    proj.patterns = Array.isArray(proj.patterns) ? proj.patterns : [];
    proj.systems = Array.isArray(proj.systems) ? proj.systems : [];
    proj.feedback = Array.isArray(proj.feedback) ? proj.feedback : [];
    proj.updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_PROJECT_KEY, JSON.stringify(proj));
    localStorage.setItem(STORAGE_CONFIRMED_KEY, "true");

    try {
      let store = {};
      const rawStore = localStorage.getItem(STORAGE_STORE_KEY);
      if (rawStore) {
        store = JSON.parse(rawStore) || {};
      }
      delete store.proj_burger_club;
      delete store.proj_badder;
      store[proj.id] = proj;
      localStorage.setItem(STORAGE_STORE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error("Error updating project store in localStorage", e);
    }
  }

  // Escape HTML helper
  function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Render Brief Modal (Capa 1: Paso 1 del Brief)
  function renderModal(isEditMode = false) {
    const existingModal = document.getElementById("emergent-brief-modal");
    if (existingModal) existingModal.remove();

    const proj = getActiveProject() || {};
    const currentName = proj.name && proj.name !== "Burger Club" && proj.name !== "Badder Brand" ? proj.name : "";
    const currentObjective = proj.objective || "";
    const currentDescription = proj.description || "";

    const overlay = document.createElement("div");
    overlay.id = "emergent-brief-modal";
    overlay.className = "fixed inset-0 z-[99999] flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto";

    overlay.innerHTML = `
      <div class="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-indigo-500/10 p-6 sm:p-8 space-y-6 text-zinc-100 my-8">
        
        <!-- Header Banner -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              Paso 1 • Brief & Definición del Proyecto
            </span>
            ${isEditMode ? `<button id="close-brief-modal" class="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded-lg hover:bg-zinc-800"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>` : ''}
          </div>
          <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-sans">
            ${isEditMode ? 'Editar Brief del Proyecto' : 'Configura tu Proyecto de Investigación Visual'}
          </h2>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Completa el nombre, objetivo y contexto de tu marca o tesis. Esta información guiará el análisis de patrones e identidades visuales por IA.
          </p>
        </div>

        <!-- Form Body -->
        <form id="brief-form" class="space-y-5">
          
          <!-- Field 1: Project Name -->
          <div class="space-y-2">
            <label class="block text-xs font-bold uppercase tracking-wider text-zinc-300">
              1. Nombre del Proyecto / Marca <span class="text-indigo-400">*</span>
            </label>
            <input 
              type="text" 
              id="brief-name" 
              required 
              placeholder="Ej: KROM - Indumentaria Utilitaria Urbana" 
              value="${escapeHtml(currentName)}"
              class="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-sans text-sm"
            />
          </div>

          <!-- Field 2: Objective -->
          <div class="space-y-2">
            <label class="block text-xs font-bold uppercase tracking-wider text-zinc-300">
              2. Objetivo del Proyecto / Identidad <span class="text-indigo-400">*</span>
            </label>
            <input 
              type="text" 
              id="brief-objective" 
              required 
              placeholder="Ej: Construcción de sistema identitario táctil y utilitario para ropa de trabajo" 
              value="${escapeHtml(currentObjective)}"
              class="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-sans text-sm"
            />
          </div>

          <!-- Field 3: Context / Description -->
          <div class="space-y-2">
            <label class="block text-xs font-bold uppercase tracking-wider text-zinc-300">
              3. Contexto & Descripción del Universo Visual <span class="text-zinc-500">(Recomendado)</span>
            </label>
            <textarea 
              id="brief-description" 
              rows="3" 
              placeholder="Ej: Universo visual con estética industrial, sustratos kraft reciclados, tipografía sans-serif condensada de alto impacto, serigrafía textil y etiquetas industriales."
              class="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-sans text-sm resize-none"
            >${escapeHtml(currentDescription)}</textarea>
          </div>

          <!-- Validation Warning -->
          <div id="brief-validation-warning" class="hidden p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-2">
            <svg class="w-4 h-4 shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span>Por favor, completa el nombre y el objetivo del proyecto para continuar.</span>
          </div>

          <!-- Action Button -->
          <div class="pt-2 flex items-center justify-end gap-3">
            ${isEditMode ? `
              <button 
                type="button" 
                id="cancel-brief-btn"
                class="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-all"
              >
                Cancelar
              </button>
            ` : ''}
            <button 
              type="submit" 
              id="submit-brief-btn"
              class="w-full sm:w-auto px-7 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
            >
              <span>${isEditMode ? 'Guardar Cambios del Brief' : 'Ingresar al Lienzo paso a paso'}</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
          </div>

        </form>

      </div>
    `;

    document.body.appendChild(overlay);

    const form = document.getElementById("brief-form");
    const inputName = document.getElementById("brief-name");
    const inputObjective = document.getElementById("brief-objective");
    const inputDesc = document.getElementById("brief-description");
    const warning = document.getElementById("brief-validation-warning");
    const closeBtn = document.getElementById("close-brief-modal");
    const cancelBtn = document.getElementById("cancel-brief-btn");

    if (closeBtn) closeBtn.onclick = () => overlay.remove();
    if (cancelBtn) cancelBtn.onclick = () => overlay.remove();

    form.onsubmit = function (e) {
      e.preventDefault();
      const valName = inputName.value.trim();
      const valObj = inputObjective.value.trim();
      const valDesc = inputDesc.value.trim();

      if (!valName || !valObj) {
        warning.classList.remove("hidden");
        return;
      }

      saveActiveProject(valName, valObj, valDesc);
      overlay.remove();
      window.location.reload();
    };
  }

  // Initial check on DOM Ready
  function initOnboarding() {
    // Clean up any old injected steppers if present
    const oldBar = document.getElementById("emergent-5layer-stepper");
    if (oldBar) oldBar.remove();
    document.body.style.paddingTop = "";

    const isConfirmed = localStorage.getItem(STORAGE_CONFIRMED_KEY);
    const proj = getActiveProject();

    const needsModal = !isConfirmed || !proj || !proj.name || proj.name === "Burger Club" || proj.name === "Badder Brand";

    if (needsModal) {
      renderModal(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOnboarding);
  } else {
    initOnboarding();
  }
})();
