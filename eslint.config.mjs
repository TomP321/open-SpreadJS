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
      '.scratch/**',
      // Ignored black-box research artifacts from the interrupted Designer run.
      'apps/designer-compare/.probe/**',
      '.probe/**',
      // Supervisor-authored differential oracle harness (inputs only; not ours to edit).
      'apps/compare/src/oracle.ts',
      'apps/compare/scripts/oracle.mjs',
      'apps/compare/oracle/**',
      // Drop-in sample app sources: they are copied to .probe/t52/apps and typechecked/run there.
      'apps/dropin-check/templates/**',
    ],
  },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-namespace': 'off' } },
);
