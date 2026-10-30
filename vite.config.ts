import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.glb'],
  server: {
    // Port volontairement inhabituel : évite de collisionner avec les autres
    // serveurs de dev qui tournent déjà sur la machine. strictPort=false ->
    // Vite décale automatiquement si le port est pris.
    port: 5183,
    strictPort: false,
    open: false,
    allowedHosts: ['.e2b.app'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
