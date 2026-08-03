const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('response', async resp => {
    if (resp.url().includes('identitytoolkit')) {
      console.log('AUTH REQ:', resp.url(), resp.status());
      const text = await resp.text();
      console.log('AUTH RESP:', text);
    }
  });
  await page.goto('http://localhost:5174/login');
  await page.fill('input[type="email"]', 'admin@test.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await browser.close();
})();
