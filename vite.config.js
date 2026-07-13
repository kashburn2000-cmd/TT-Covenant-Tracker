import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // react-grid-layout's bundled react-draggable reads process.env at runtime;
  // the browser has no `process`, so substitute an empty object at build time.
  define: { 'process.env': {} },
})
