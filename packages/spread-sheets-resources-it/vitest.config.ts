import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The package imports its core peer through the name the drop-in application
// aliases; in the workspace that name resolves to our core source (one module
// instance, so the registration lands on the same CultureManager).
const core = fileURLToPath(new URL('../spread-sheets/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@mescius/spread-sheets': core } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
