import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Permite que se escuche en la red local
    allowedHosts: true, // Esto elimina el error 403 de ngrok
    proxy: {
      '/v1': {
        target: 'http://localhost:8446', // Tu simulador de Apigee
        changeOrigin: true,
      },
    },
  },
})