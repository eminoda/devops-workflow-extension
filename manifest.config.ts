import { defineManifest } from '@crxjs/vite-plugin'

// 与 package.json 版本保持同步
const version = '0.1.0'

export default defineManifest({
  name: 'Jenkins Runner',
  description: 'Jenkins 轻量编排与状态跟进',
  version,
  manifest_version: 3,
  icons: {
    16: 'src/assets/icons/icon-16.png',
    32: 'src/assets/icons/icon-32.png',
    48: 'src/assets/icons/icon-48.png',
    128: 'src/assets/icons/icon-128.png',
  },
  // 允许 UnoCSS preset-icons 使用的 data: SVG（否则扩展页图标可能被 CSP 拦截而不展示）
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:",
  },
  permissions: ['storage'],
  host_permissions: ['http://*/*', 'https://*/*'],
  action: {
    default_title: 'Jenkins Runner',
    default_popup: 'src/popup.html',
    default_icon: {
      16: 'src/assets/icons/icon-16.png',
      32: 'src/assets/icons/icon-32.png',
      48: 'src/assets/icons/icon-48.png',
      128: 'src/assets/icons/icon-128.png',
    },
  },
  // 仍保留大页面入口（扩展详情页 → 扩展选项）
  options_page: 'src/options.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
})
