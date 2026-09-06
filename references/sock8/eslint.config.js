// ESLint flat config
import { config as baseConfig } from '@sock8/eslint-config/base';

export default [
  ...baseConfig,
  {
    // Ignore all files by default to prevent duplicate linting with the workspace-specific configs
    ignores: ['**/*', '!.eslintrc.js'],
  },
];
