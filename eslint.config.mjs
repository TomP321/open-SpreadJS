import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/src/generated/**',
      '**/src/props.ts',
      '.pnpm-store/**',
      '.playwright-browsers/**',
      'test-results/**',
      // Supervisor-authored differential oracle harness (inputs only; not ours to edit).
      'apps/compare/src/oracle.ts',
      'apps/compare/scripts/oracle.mjs',
      'apps/compare/oracle/**',
    ],
  },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-namespace': 'off' } },
);
