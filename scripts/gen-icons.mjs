import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const svg = readFileSync('public/favicon.svg', 'utf8')
const b64 = Buffer.from(svg).toString('base64')

for (const size of [192, 512]) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:#000008">
    <img src="data:image/svg+xml;base64,${b64}" width="${size}" height="${size}" style="display:block"/>
  </body></html>`)
  await page.screenshot({ path: `public/icon-${size}.png`, clip: { x: 0, y: 0, width: size, height: size } })
  await browser.close()
  console.log(`icon-${size}.png written`)
}
