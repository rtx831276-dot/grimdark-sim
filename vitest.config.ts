import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Environnement node volontaire : la simulation doit tourner sans DOM.
    // Si un test de src/sim a besoin de window/canvas, c'est une régression
    // d'architecture (voir tests/architecture.test.ts).
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
