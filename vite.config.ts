import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3005,
      open: true,
      host: '0.0.0.0',
      allowedHosts: ['echovid.url.com.br'],
      headers: {
        // COOP necessário para SharedArrayBuffer (FFmpeg WASM)
        // credentialless permite SharedArrayBuffer sem bloquear recursos externos
        'Cross-Origin-Opener-Policy':   'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      watch: {
        ignored: ['**/temp_render/**', '**/OUTPUT_*.mp4']
      }
    },
    plugins: [tailwindcss(), react()],
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.FLUX_KEY': JSON.stringify(env.FLUX_KEY),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(new URL('.', import.meta.url).pathname, '.'),
      }
    }
  };
});
