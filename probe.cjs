const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('file:///workspace/serpet-3d-snake.html');
  await p.waitForTimeout(2000);
  await p.locator('button:has-text("PLAY")').first().click();
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => [...document.querySelectorAll('canvas')].map(c => ({
    cls: c.className.slice(0,60), parent: c.parentElement?.id + '/' + (c.parentElement?.className||'').slice(0,40),
    w: c.width, h: c.height, styleW: c.style.width, styleH: c.style.height, rect: JSON.stringify(c.getBoundingClientRect()),
  })));
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
