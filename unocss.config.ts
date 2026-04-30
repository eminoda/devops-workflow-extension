import { defineConfig, presetUno, presetAttributify } from 'unocss'
import { presetIcons } from '@unocss/preset-icons'
import presetAnimations from 'unocss-preset-animations'
import { presetShadcn } from 'unocss-preset-shadcn'
import { icons as materialSymbols } from '@iconify-json/material-symbols'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      collections: {
        ms: materialSymbols,
      },
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetAnimations(),
    // zinc 中性底 + 在 src/assets/index.css 覆盖 primary 为 Material 蓝
    presetShadcn(
      {
        color: 'zinc',
        radius: 'md',
      },
      {
        componentLibrary: 'reka',
      },
    ),
  ],
  content: {
    pipeline: {
      include: [
        /\.(vue|[jt]sx|mdx?|html)($|\?)/,
        'src/**/*.{js,ts}',
      ],
    },
  },
  rules: [[/^h-100vh$/, () => ({ height: '100vh' })]],
})
