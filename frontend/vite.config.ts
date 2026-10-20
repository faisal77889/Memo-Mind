import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/google': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth/google': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/sync-message': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/task': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ai-message': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/gmail': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) {
            return '/index.html';
          }
        },
      },
      '/download': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})