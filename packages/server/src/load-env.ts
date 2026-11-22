// Imported first by the server entry point, so every module sees the variables from `.env` when it loads.
import { DEFAULT_ENV_FILE, loadEnvFile } from './env-file.js';

if (loadEnvFile()) console.log(`  Settings read from ${DEFAULT_ENV_FILE} (variables set in the environment win).`);
