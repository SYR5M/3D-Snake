const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file:///workspace/serpet-3d-snake.html');
  await page.waitForTimeout(2000);
  // pick hardest difficulty if selectable to maximize speed (optional)
  for (const label of ['NIGHTMARE','HARD','INSANE']) {
    const b = page.locator('button', { hasText: new RegExp(label,'i') }).first();
    if (await b.isVisible().catch(()=>false)) { await b.click(); break; }
  }
  await page.locator('button', { hasText: /PLAY|START/i }).first().click();
  await page.waitForTimeout(1000);

  let over = false;
  outer:
  for (let lap = 0; lap < 6; lap++) {           // spiral: R, D, L, U repeatedly -> guaranteed self/wall hit
    for (const key of ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp']) {
      await page.keyboard.press(key);
      for (let t = 0; t < 15; t++) {            // up to 7.5s per leg
        await page.waitForTimeout(500);
        if (await page.locator('text=/GAME OVER/i').first().isVisible().catch(()=>false)) { over = true; break outer; }
      }
    }
  }
  console.log('GAME_OVER_REACHED:', over);
  if (over) {
    const retry = page.locator('button', { hasText: /RETRY|RESTART|PLAY AGAIN|AGAIN/i }).first();
    const vis = await retry.isVisible().catch(()=>false);
    console.log('RESTART_BUTTON_VISIBLE:', vis);
    if (vis) { await retry.click(); await page.waitForTimeout(2000);
      console.log('RESTART_WORKS:', await page.evaluate(() => !/GAME OVER/i.test(document.body.innerText))); }
  }
  console.log('PAGE_ERRORS:', errors.length ? errors.slice(0,3) : 'none');
  await page.screenshot({ path: '/workspace/preview-gameover.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
