import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

// Vista de verificación del sistema visual (solo desarrollo): http://localhost:5173/#ds
const DesignSystemPreview = import.meta.env.DEV ? React.lazy(() => import('./dev/DesignSystemPreview')) : null;
const showDesignSystem = !!DesignSystemPreview && window.location.hash === '#ds';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearOnlyIfExplicit = () => {
    if (window.confirm("¿Seguro que deseás reiniciar el almacenamiento local? Se restablecerán los proyectos guardados.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-bg p-6 text-ink">
          <div role="alert" className="flex w-full max-w-md flex-col gap-3 rounded-card border border-discarded/35 bg-discarded/5 p-5">
            <span className="font-mono text-xs font-medium text-discarded-ink">ERROR DE INTERFAZ</span>
            <h1 className="m-0 text-15 font-medium">Se produjo un error en la aplicación</h1>
            <p className="m-0 text-13 text-ink-2">Tus proyectos siguen guardados en este navegador.</p>
            <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap rounded-ctrl border border-line bg-bg p-3 font-mono text-xs text-ink-2">
              {this.state.error?.message || 'Error inesperado de renderizado.'}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={this.handleReload} className="btn btn-primary btn-sm">
                Recargar (conservar proyectos)
              </button>
              <button type="button" onClick={this.handleClearOnlyIfExplicit} className="btn btn-ghost btn-sm">
                Borrar datos locales
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {showDesignSystem && DesignSystemPreview ? (
        <React.Suspense fallback={null}>
          <DesignSystemPreview />
        </React.Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
