import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/src/generated/**', '**/src/props.ts', '.pnpm-store/**', '.playwright-browsers/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], '@typescript-eslint/no-namespace': 'off' } },
);
