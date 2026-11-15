import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('./web'),
  publicDir: path('./public'),
  plugins: [react()],
  resolve: {alias: {'@': path('./')}},
  css: {postcss: {plugins: [tailwindcss()]}},
  server: {watch: {usePolling: true}},
  build: {
    outDir: path('./dist'),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // three's WebGL runtime is the heavy part of the viewer. Keep it
              // out of the entry chunk; the scene is loaded with import().
              name: 'three',
              test: /node_modules[\\/]three[\\/]/,
            },
          ],
        },
      },
    },
  },
});
