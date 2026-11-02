import { defineConfig, normalizePath, type Plugin } from 'vite';
import path from 'node:path';

const repoRoot = import.meta.dirname;

// Each project keeps its captured footage in projects/<name>/footage/, beside the capture script that
// writes it, not inside the app: serve /footage/<name>/... from there without copying or symlinking.
function footage(): Plugin {
  return {
    name: 'footage',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const match = request.url?.match(/^\/footage\/([^/?]+)(\/.*)?$/);
        if (match) request.url = `/@fs/${encodeURI(normalizePath(repoRoot))}/projects/${match[1]}/footage${match[2] ?? ''}`;
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
  resolve: { alias: { '@root': path.resolve(repoRoot), '@engine': path.resolve(repoRoot, 'app/src/engine') } },
  build: { target: 'esnext' },
});
