import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // O .env vive na raiz do monorepo — uma única fonte para API e web.
  const envDir = path.resolve(__dirname, '..', '..');
  const env = loadEnv(mode, envDir, '');
  const devServerPort = Number(env.VITE_DEV_PORT) || 5180;
  const apiProxyTarget = env.VITE_DEV_API_PROXY?.trim() || 'http://127.0.0.1:3460';
  const allowedHosts = (env.VITE_DEV_ALLOWED_HOSTS || 'localhost')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    envDir,
    plugins: [
      react(),
      {
        // Termos e privacidade são HTML estático em `public/`, servidos em
        // /termos e /privacidade (o Google verifica estas URLs sem executar JS).
        name: 'paginas-legais-sem-extensao',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/termos' || req.url === '/privacidade') req.url = `${req.url}.html`;
            next();
          });
        },
      },
    ],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: {
      port: devServerPort,
      strictPort: true,
      host: true,
      allowedHosts,
      proxy: {
        // Mesmo origin para a API: cookies SameSite=Strict e sem CORS.
        '/api': { target: apiProxyTarget, changeOrigin: false, xfwd: true, ws: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
            if (/node_modules[\\/](react-router|react-router-dom|@tanstack|zustand|axios|clsx|tailwind-merge|@radix-ui|lucide-react|react-hot-toast|framer-motion)[\\/]/.test(id)) return 'vendor-shell';
            return undefined;
          },
        },
      },
    },
  };
});
