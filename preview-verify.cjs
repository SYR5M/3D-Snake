const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader','--enable-webgl','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file:///workspace/serpet-3d-snake.html');
  await page.waitForTimeout(2500);

  // 1. Menu visible?
  const playBtn = page.locator('button', { hasText: /PLAY|START/i }).first();
  const menuVisible = await playBtn.isVisible().catch(() => false);
  console.log('MENU_VISIBLE:', menuVisible);

  // 2. Click play
  if (menuVisible) { await playBtn.click(); await page.waitForTimeout(2000); }

  // 3. Canvas size check (previous bug: 1px height)
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    let gl = null; try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch(e){}
    return { w: Math.round(r.width), h: Math.round(r.height), webgl: !!gl };
  });
  console.log('CANVAS:', JSON.stringify(canvasInfo));

  // 4. Keyboard input: arrow key then check game still alive
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(1500);
  const hud = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g,' | '));
  console.log('TEXT_SNIPPET:', hud);

  // 5. Pause with Space
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  const paused = await page.locator('text=/PAUSED/i').first().isVisible().catch(() => false);
  console.log('PAUSE_OVERLAY:', paused);

  console.log('CONSOLE_ERRORS:', errors.length ? errors.slice(0,5) : 'none');
  await page.screenshot({ path: '/workspace/preview-check.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
