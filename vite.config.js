import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Publica el primer .json de ejemplos/ como /ejemplo.json (en dev y en el build), para hostings estáticos sin backend. */
function exampleProject() {
  const find = () => {
    const dir = path.resolve('ejemplos');
    const file = fs.existsSync(dir) ? fs.readdirSync(dir).find(f => f.toLowerCase().endsWith('.json')) : undefined;
    return file ? path.join(dir, file) : null;
  };
  return {
    name: 'example-project',
    configureServer(server) {
      server.middlewares.use('/ejemplo.json', (req, res) => {
        const file = find();
        if (!file) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const file = find();
      if (file) fs.copyFileSync(file, path.resolve('dist', 'ejemplo.json'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), exampleProject()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
