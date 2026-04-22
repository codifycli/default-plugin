import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    onConsoleLog: (log) => {
      if (!process.env.CI) {
        process.stdout.write(log);
      }
    },
    watch: false,
    setupFiles: ['./test/setup.ts'],
  },
})
