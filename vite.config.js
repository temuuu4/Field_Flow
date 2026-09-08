import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use mkcert-generated certificates when available (they are trusted by the
// browser's certificate store, which is required for the Push API to work).
// Fall back to basic-ssl only if the certs directory is missing.
const certsDir = path.join(__dirname, 'certs');
const certFile = path.join(certsDir, 'dev.crt');
const keyFile  = path.join(certsDir, 'dev.key');
const hasMkcert = fs.existsSync(certFile) && fs.existsSync(keyFile);

export default defineConfig(async () => {
  // Lazily import basic-ssl only when mkcert certs are absent, so the dev
  // experience degrades gracefully on a fresh checkout without the certs.
  const plugins = [react()];
  let httpsConfig;

  if (hasMkcert) {
    httpsConfig = {
      cert: fs.readFileSync(certFile),
      key:  fs.readFileSync(keyFile),
    };
  } else {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl());
    httpsConfig = true;
    console.warn(
      '[vite] ⚠  Using self-signed certificate (basic-ssl). ' +
      'The Push API will NOT work in Chrome with a self-signed cert. ' +
      'Run: mkcert -key-file certs/dev.key -cert-file certs/dev.crt localhost 127.0.0.1 ::1',
    );
  }

  return {
    plugins,
    server: {
      host: 'localhost',   // must be 'localhost', NOT '0.0.0.0', for Push API
      port: 5173,
      https: httpsConfig,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
