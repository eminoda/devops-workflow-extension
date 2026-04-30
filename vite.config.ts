import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import UnoCSS from 'unocss/vite'
import { fileURLToPath, URL } from 'node:url'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [vue(), UnoCSS(), crx({ manifest })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
  },
})
