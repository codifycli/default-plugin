import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    onConsoleLog: (log) => {
      process.stdout.write(log);
    },
    watch: false,
    setupFiles: ['./test/setup.ts'],
  },
})
