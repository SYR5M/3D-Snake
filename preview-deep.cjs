const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file:///workspace/serpet-3d-snake.html');
  await page.waitForTimeout(2000);
  await page.locator('button', { hasText: /PLAY|START/i }).first().click();
  await page.waitForTimeout(1500);

  // Reward collection: steer toward food using engine state if exposed, else just run straight & sample score over time
  let collected = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => parseInt((document.body.innerText.match(/SCORE\s*\n?\s*(\d+)/i)||[])[1] || '0'));
    const len = await page.evaluate(() => { const m = document.body.innerText.match(/🐍\s*(\d+)/); return m ? +m[1] : -1; });
    if (s > 0 || len > 5) { collected = true; console.log(`REWARD_OK at t=${i+1}s score=${s} length=${len}`); break; }
  }
  if (!collected) console.log('REWARD: no pickup observed in 12s of auto-forward play');

  // Minimap present?
  const mm = await page.evaluate(() => { const c=[...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,pos:getComputedStyle(c).position,z:getComputedStyle(c).zIndex})); return c; });
  console.log('CANVASES:', JSON.stringify(mm));

  // Pause -> resume via overlay button
  await page.keyboard.press('Space'); await page.waitForTimeout(500);
  const resumeBtn = page.locator('button', { hasText: /RESUME|CONTINUE/i }).first();
  const hasResume = await resumeBtn.isVisible().catch(()=>false);
  if (hasResume) { await resumeBtn.click(); await page.waitForTimeout(500); }
  console.log('RESUME_BUTTON:', hasResume);

  // Resize test
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(800);
  const sz = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  console.log('AFTER_RESIZE_CANVAS:', JSON.stringify(sz));

  // Game over: crash into wall by holding one direction long enough
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(15000); await page.keyboard.up('ArrowRight');
  const gameOver = await page.locator('text=/GAME OVER/i').first().isVisible().catch(()=>false);
  console.log('GAME_OVER_REACHED:', gameOver);
  if (gameOver) {
    const restart = await page.locator('button', { hasText: /RETRY|RESTART|PLAY AGAIN/i }).first().isVisible().catch(()=>false);
    console.log('RESTART_BUTTON_VISIBLE:', restart);
    if (restart) { await page.locator('button', { hasText: /RETRY|RESTART|PLAY AGAIN/i }).first().click(); await page.waitForTimeout(1500);
      const back = await page.evaluate(() => !/GAME OVER/i.test(document.body.innerText));
      console.log('RESTART_WORKS:', back); }
  }
  console.log('PAGE_ERRORS:', errors.length ? errors.slice(0,3) : 'none');
  await page.screenshot({ path: '/workspace/preview-deep.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
