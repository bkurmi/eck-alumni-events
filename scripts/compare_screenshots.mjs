import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function run() {
  const outputDir = path.resolve('C:/Users/BhaweshKurmi/.gemini/antigravity/brain/3130fb18-787c-497a-b0d4-0bcb9365c4e2/scratch');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    try {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    } catch (e2) {
      browser = await chromium.launch({ headless: true });
    }
  }

  const viewports = [
    { name: 'mobile_360', width: 360, height: 780 },
    { name: 'desktop_1280', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2
    });

    // 1. Production site
    const pageProd = await context.newPage();
    console.log(`Loading prod on ${vp.name}...`);
    try {
      await pageProd.goto('https://eck-alumni-events.pages.dev/', { waitUntil: 'networkidle', timeout: 30000 });
      await pageProd.waitForTimeout(1500);
      await pageProd.screenshot({ path: path.join(outputDir, `prod_${vp.name}.png`), fullPage: true });
      console.log(`Saved prod_${vp.name}.png`);
    } catch (err) {
      console.error(`Error loading prod on ${vp.name}:`, err.message);
    }
    await pageProd.close();

    // 2. Local dev site
    const pageLocal = await context.newPage();
    console.log(`Loading local on ${vp.name}...`);
    try {
      await pageLocal.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
      await pageLocal.waitForTimeout(1500);
      await pageLocal.screenshot({ path: path.join(outputDir, `local_${vp.name}.png`), fullPage: true });
      console.log(`Saved local_${vp.name}.png`);
    } catch (err) {
      console.error(`Error loading local on ${vp.name}:`, err.message);
    }
    await pageLocal.close();

    await context.close();
  }

  await browser.close();
  console.log('Finished capturing screenshots!');
}

run().catch(console.error);

