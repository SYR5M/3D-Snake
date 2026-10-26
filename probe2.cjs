const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('file:///workspace/serpet-3d-snake.html');
  await p.waitForTimeout(2000);
  await p.locator('button:has-text("PLAY")').first().click();
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => {
    const layer = document.querySelector('.game-render-layer');
    const shell = document.querySelector('.game-shell');
    const c = layer?.querySelector('canvas');
    return {
      htmlH: document.documentElement.clientHeight, bodyH: document.body.clientHeight,
      rootH: document.getElementById('root')?.clientHeight,
      shellRect: shell ? JSON.parse(JSON.stringify(shell.getBoundingClientRect())) : null,
      layerRect: layer ? JSON.parse(JSON.stringify(layer.getBoundingClientRect())) : null,
      layerClient: layer ? {w: layer.clientWidth, h: layer.clientHeight} : null,
      canvasParentIsLayer: c?.parentElement === layer,
      computedPos: layer ? getComputedStyle(layer).position + '/' + getComputedStyle(layer).height : null,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
