import { defineConfig } from 'vite';
export default defineConfig({ optimizeDeps: { exclude: ['@opensheets/spread-sheets'] }, build: { target: 'es2022' }, server: { strictPort: true } });
