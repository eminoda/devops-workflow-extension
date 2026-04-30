import { Jimp } from 'jimp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const inputPath = path.resolve(repoRoot, 'src/assets/logo.png')
const outDir = path.resolve(repoRoot, 'src/assets/icons')

const sizes = [16, 32, 48, 128]

function isNearWhite(r, g, b, a) {
  // 透明像素直接当作背景
  if (a <= 5) return true
  // 近白阈值：允许轻微压缩噪点/锯齿
  return r >= 245 && g >= 245 && b >= 245
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function computeContentBox(img) {
  const { width, height, data } = img.bitmap
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]
      if (!isNearWhite(r, g, b, a)) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  // 极端情况：整张图都是白/透明
  if (maxX < 0 || maxY < 0) {
    return { x: 0, y: 0, w: width, h: height }
  }

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  return { x: minX, y: minY, w, h }
}

function removeNearWhiteBackground(img) {
  const { width, height, data } = img.bitmap
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]
      if (isNearWhite(r, g, b, a)) {
        data[idx + 3] = 0
      }
    }
  }
  return img
}

async function main() {
  const raw = await Jimp.read(inputPath)
  const img = removeNearWhiteBackground(raw.clone())

  // 自动裁剪到内容区域，再加安全留白，避免小尺寸贴边/被裁
  const box = computeContentBox(img)
  const pad = Math.round(Math.max(box.w, box.h) * 0.12) // 12% 留白
  const padded = {
    x: clamp(box.x - pad, 0, img.bitmap.width - 1),
    y: clamp(box.y - pad, 0, img.bitmap.height - 1),
    w: clamp(box.w + pad * 2, 1, img.bitmap.width - clamp(box.x - pad, 0, img.bitmap.width - 1)),
    h: clamp(box.h + pad * 2, 1, img.bitmap.height - clamp(box.y - pad, 0, img.bitmap.height - 1)),
  }

  const content = img.clone().crop(padded)
  const side = Math.max(content.bitmap.width, content.bitmap.height)

  // 做成正方形画布（透明背景），将内容居中贴上去，再缩放
  const square = new Jimp({ width: side, height: side, color: 0x00000000 })
  const dx = Math.floor((side - content.bitmap.width) / 2)
  const dy = Math.floor((side - content.bitmap.height) / 2)
  square.composite(content, dx, dy)

  for (const size of sizes) {
    const outPath = path.resolve(outDir, `icon-${size}.png`)
    const clone = square.clone().resize({ w: size, h: size })
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

