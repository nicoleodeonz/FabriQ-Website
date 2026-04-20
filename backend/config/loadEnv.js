import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendEnvPath = path.resolve(__dirname, '../.env');
const workspaceEnvPath = path.resolve(__dirname, '../../.env');

let environmentLoaded = false;

export function loadEnvironment() {
  if (environmentLoaded) {
    return;
  }

  // Prefer backend-local env values, then allow a workspace-root env file as a fallback.
  dotenv.config({ path: backendEnvPath });
  dotenv.config({ path: workspaceEnvPath });

  environmentLoaded = true;
}