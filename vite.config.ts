import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { editorBuildEnabled } from './scripts/editor-build.ts';
export default defineConfig({
  define: {
    __UPTIMEPAGE_CONFIG_EDITOR__: JSON.stringify(
      editorBuildEnabled(process.env.UPTIMEPAGE_CONFIG_EDITOR),
    ),
  },
  plugins: [react(), tailwind()],
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'validation', test: /node_modules[\\/]zod[\\/]/ }] },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
