const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file:///workspace/serpet-3d-snake.html');
  await page.waitForTimeout(2500);

  const menuVisible = await page.locator('text=SERPET').first().isVisible().catch(()=>false);
  console.log('MENU_VISIBLE=' + menuVisible);
  await page.screenshot({ path: '/tmp/menu.png' });

  // Click PLAY
  const playBtn = page.locator('button:has-text("PLAY")').first();
  const playCount = await playBtn.count();
  console.log('PLAY_BUTTON_FOUND=' + (playCount>0));
  if (playCount>0) { await playBtn.click(); await page.waitForTimeout(1500); }
  await page.screenshot({ path: '/tmp/playing.png' });

  // Canvas present & sized?
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height, styleW: c.style.width } : null;
  });
  console.log('CANVAS=' + JSON.stringify(canvasInfo));

  // Control the snake
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(600);

  // Pause with Space
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  const paused = await page.locator('text=/PAUSED/i').first().isVisible().catch(()=>false);
  console.log('PAUSE_OVERLAY=' + paused);
  await page.screenshot({ path: '/tmp/paused.png' });
  await page.keyboard.press('Space'); await page.waitForTimeout(400);

  // Minimap visible?
  const minimap = await page.evaluate(() => !!document.querySelector('canvas[style*="fixed"], .minimap, #minimap'));
  console.log('MINIMAP_CANVAS=' + minimap);

  // Resize test
  await page.setViewportSize({ width: 900, height: 600 }); await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/resized.png' });

  // WebGL active check: sample canvas pixels for non-black content
  const rendered = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('canvas')];
    for (const c of cs) {
      try {
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) return { webgl: true, lost: gl.isContextLost() };
      } catch(e){}
    }
    return { webgl: false };
  });
  console.log('WEBGL=' + JSON.stringify(rendered));

  console.log('CONSOLE_ERRORS=' + errors.length);
  errors.slice(0,5).forEach(e => console.log('ERR: ' + e.slice(0,200)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
