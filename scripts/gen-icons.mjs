// Render the SVG logo into the PNG icons the PWA manifest needs.
// Run with: npm run gen-icons
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(join(root, 'public', 'favicon.svg'))

for (const size of [192, 512]) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()
  await writeFile(join(root, 'public', `icon-${size}.png`), png)
  console.log(`wrote public/icon-${size}.png`)
}
