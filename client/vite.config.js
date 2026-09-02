import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      }
    }
  },
  build: {
    target: 'es2020',               // Modern browsers only — smaller output, no legacy polyfills
    cssCodeSplit: true,             // Per-page CSS — only loads what the current page needs
    assetsInlineLimit: 4096,        // Inline small assets (<4KB) as base64 to save HTTP requests
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom'],
          'vendor-redux':  ['@reduxjs/toolkit', 'react-redux'],
          'vendor-motion': ['framer-motion'],
          'vendor-ui':     ['lucide-react', 'clsx', 'tailwind-merge', 'canvas-confetti'],
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
  },
});
