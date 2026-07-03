import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built bundle opens directly via file://
  base: './',
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    passWithNoTests: true,
  },
});
