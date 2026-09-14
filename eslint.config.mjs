import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      '.npm-cache/**',
      '.electron-cache/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
)
