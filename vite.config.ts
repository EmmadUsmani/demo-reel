import { defineConfig, normalizePath, type Plugin } from 'vite';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectsOf } from './scripts/bundled-projects';

const repoRoot = import.meta.dirname;
/** Set by scripts/build.ts: build the HTML player for this one edit, with only its project inside. */
const BUILD_EDIT = process.env.DEMO_REEL_EDIT;
/** Set by scripts/build.ts with --single: one self-contained HTML file, so no chunks and every asset inlined. */
const SINGLE = !!process.env.DEMO_REEL_SINGLE;
/** Set by scripts/build.ts: where to list the projects whose code the build bundled (it ships their footage). */
const PROJECTS_FILE = process.env.DEMO_REEL_PROJECTS_FILE;

// Each project keeps its captured footage in projects/<name>/footage/, beside the capture script that
// writes it, not inside the app: serve footage/<name>/... from there without copying or symlinking.
// The player's soundtrack (scripts/audio.ts) is served the same way, from out/audio-<name>/.
function footage(): Plugin {
  return {
    name: 'footage',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const root = `/@fs/${encodeURI(normalizePath(repoRoot))}`;
        const shot = request.url?.match(/^\/footage\/([^/?]+)(\/.*)?$/);
        if (shot) request.url = `${root}/projects/${shot[1]}/footage${shot[2] ?? ''}`;
        const sound = request.url?.match(/^\/audio\/([^/?]+)(\/.*)?$/);
        if (sound) request.url = `${root}/out/audio-${sound[1]}${sound[2] ?? ''}`;
        next();
      });
    },
  };
}

// Write the projects whose modules made it into the bundle, one name per line, for scripts/build.ts.
function bundledProjects(): Plugin {
  return {
    name: 'bundled-projects',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (!PROJECTS_FILE) return;
      const ids = Object.values(bundle).flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : []));
      writeFileSync(PROJECTS_FILE, projectsOf(ids, repoRoot).join('\n'));
    },
  };
}

// `virtual:edits`: every project's projects/<name>/timeline.ts by name (app/src/timeline.ts), or only
// BUILD_EDIT's, so a built player carries one video's code and nothing of the others.
function edits(): Plugin {
  const id = 'virtual:edits', resolved = `\0${id}`;
  const timeline = (name: string) => path.join(repoRoot, 'projects', name, 'timeline.ts');
  return {
    name: 'edits',
    resolveId: (source) => (source === id ? resolved : undefined),
    load(source) {
      if (source !== resolved) return;
      const names = readdirSync(path.join(repoRoot, 'projects')).filter((name) => existsSync(timeline(name)) && (!BUILD_EDIT || name === BUILD_EDIT)).sort();
      if (BUILD_EDIT && !names.length) throw new Error(`no project '${BUILD_EDIT}' (projects/${BUILD_EDIT}/timeline.ts)`);
      return [
        ...names.map((name, i) => `import edit${i} from ${JSON.stringify(normalizePath(timeline(name)))};`),
        `export default { ${names.map((name, i) => `${JSON.stringify(name)}: edit${i}`).join(', ')} };`,
      ].join('\n');
    },
    // a project added while the preview runs shows up without restarting it
    configureServer(server) {
      server.watcher.on('add', (file) => {
        if (!/\/projects\/[^/]+\/timeline\.ts$/.test(normalizePath(file))) return;
        const module = server.moduleGraph.getModuleById(resolved);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

export default defineConfig({
  root: 'app',
  publicDir: 'public',
  // a built player is a folder that works from any path: a static host, a sub-directory, an artifact
  base: BUILD_EDIT ? './' : '/',
  plugins: [footage(), edits(), bundledProjects()],
  // a built player plays the MP3s scripts/build.ts encodes; the dev server, audio.ts's WAVs
  define: { 'import.meta.env.PLAYER_AUDIO': JSON.stringify(BUILD_EDIT ? 'mp3' : 'wav') },
  // DEMO_REEL_NO_HMR=1: an export must not reload mid-render when a file is saved
  server: { port: 5180, strictPort: false, hmr: process.env.DEMO_REEL_NO_HMR ? false : undefined, fs: { allow: [repoRoot] } },
  resolve: { alias: { '@root': path.resolve(repoRoot), '@engine': path.resolve(repoRoot, 'app/src/engine') } },
  build: {
    target: 'esnext',
    ...(BUILD_EDIT ? { rolldownOptions: { input: path.resolve(repoRoot, 'app/player.html'), ...(SINGLE ? { output: { codeSplitting: false } } : {}) } } : {}),
    // one file: scenes load with import.meta.glob (lazily), so their chunks fold in; fonts become data: URLs
    ...(SINGLE ? { assetsInlineLimit: Number.MAX_SAFE_INTEGER, cssCodeSplit: false } : {}),
  },
});
