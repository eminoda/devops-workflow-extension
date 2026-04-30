import { Jimp } from 'jimp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const inputPath = path.resolve(repoRoot, 'src/assets/logo.png')
const outDir = path.resolve(repoRoot, 'src/assets/icons')

const sizes = [16, 32, 48, 128]

async function main() {
  const img = await Jimp.read(inputPath)

  // 统一输出为正方形图标：以最短边居中裁剪，再缩放到指定尺寸
  const cropSize = Math.min(img.bitmap.width, img.bitmap.height)
  const x = Math.floor((img.bitmap.width - cropSize) / 2)
  const y = Math.floor((img.bitmap.height - cropSize) / 2)

  for (const size of sizes) {
    const outPath = path.resolve(outDir, `icon-${size}.png`)
    const clone = img.clone().crop({ x, y, w: cropSize, h: cropSize }).resize({ w: size, h: size })
    await clone.write(outPath)
    // eslint-disable-next-line no-console
    console.log('wrote', path.relative(repoRoot, outPath))
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})

