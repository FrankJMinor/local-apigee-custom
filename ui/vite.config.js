import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Cargamos las variables de entorno (las de sistema y las de archivos .env)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      proxy: {
        '/v1': {
          // Si existe la variable VITE_BACKEND_URL, la usa; si no, va a localhost
          target: env.VITE_BACKEND_URL || 'http://localhost:8446',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})