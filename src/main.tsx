import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
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
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-950 border border-red-800 flex items-center justify-center text-red-400 text-xl font-bold">
            ⚠️
          </div>
          <h1 className="text-lg font-bold text-zinc-100">Se produjo un error en la aplicación</h1>
          <p className="text-xs text-zinc-400 max-w-md font-mono bg-zinc-900/80 p-3 rounded-lg border border-zinc-800">
            {this.state.error?.message || 'Error inesperado de renderizado.'}
          </p>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-md"
            >
              Recargar aplicación (conservar proyectos)
            </button>
            <button
              onClick={this.handleClearOnlyIfExplicit}
              className="px-3 py-2 text-xs text-zinc-500 hover:text-red-400 border border-zinc-800 hover:border-red-900/50 rounded-lg transition-colors"
            >
              Limpiar caché
            </button>
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
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
