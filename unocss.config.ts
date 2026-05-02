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
    // shadcn 绿色主色（builtinColors 之一，与 components.json baseColor 一致）
    presetShadcn(
      {
        color: 'green',
        // 须为数字（单位 rem），勿用 'md' 字符串，否则会生成非法的 --radius: mdrem
        radius: 0.5,
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
