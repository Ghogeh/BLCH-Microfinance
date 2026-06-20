import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@':           path.resolve(__dirname, './src'),
      '@abi':        path.resolve(__dirname, './src/abi'),
      '@hooks':      path.resolve(__dirname, './src/hooks'),
      '@pages':      path.resolve(__dirname, './src/pages'),
      '@components': path.resolve(__dirname, './src/components'),
      '@utils':      path.resolve(__dirname, './src/utils'),
      '@contexts':   path.resolve(__dirname, './src/contexts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'ethers':   ['ethers'],
          'recharts': ['recharts'],
          'vendor':   ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include:  ['src/**/*.{js,jsx}'],
      exclude:  ['src/abi/**', 'src/test/**'],
    },
  },
})
