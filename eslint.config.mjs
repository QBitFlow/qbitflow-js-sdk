// ESLint 9 flat config for the QBitFlow JS/TS SDK.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		// Only lint the published source; skip build output, deps, tests and examples.
		ignores: ['dist/**', 'node_modules/**', 'tests/**', 'examples/**', 'coverage/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
		},
		rules: {
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
	}
);
