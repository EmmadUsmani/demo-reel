import { defineConfig, normalizePath, type Plugin } from 'vite';
import path from 'node:path';

const repoRoot = import.meta.dirname;

// The captured footage lives at the repo root, beside the capture scripts that write it, not
// inside the app: serve it at /footage/ without copying or symlinking.
function footage(): Plugin {
  return {
    name: 'footage',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url?.startsWith('/footage/')) request.url = `/@fs/${encodeURI(normalizePath(repoRoot))}${request.url}`;
        next();
      });
    },
  };
}

export default defineConfig({
  root: 'app',
  publicDir: 'public',
  plugins: [footage()],
  // DEMO_REEL_NO_HMR=1: an export must not reload mid-render when a file is saved
  server: { port: 5180, strictPort: false, hmr: process.env.DEMO_REEL_NO_HMR ? false : undefined, fs: { allow: [repoRoot] } },
  resolve: { alias: { '@root': path.resolve(repoRoot) } },
  build: { target: 'esnext' },
});
