/* Run with Node and Playwright: NODE_PATH must point to installed packages if needed. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const output = path.join(__dirname, '..', 'test-results');
fs.mkdirSync(output, { recursive: true });
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`); }
(async () => {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const failures = [];
  const externalRequests = [];
  let antivirusRequestsBlocked = 0;
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.route('**/*', route => {
    // Installed antivirus injects its own script into HTTP responses on this PC.
    // Block that environmental script separately; it is absent from repo files.
    if (new URL(route.request().url()).hostname.endsWith('.scr.kaspersky-labs.com')) {
      antivirusRequestsBlocked++;
      return route.abort();
    }
    if (!route.request().url().startsWith(base)) { externalRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  try {
    const pages = ['index','catalog','product','order','favorites','delivery','contacts','privacy'];
    await check('Every page loads offline assets without console errors at 320–1440px', async () => {
      for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const name of pages) {
          await page.goto(`${base}/${name}.html`);
          await page.locator('h1:visible').waitFor();
          await page.locator('img').evaluateAll(async images => {
            images.forEach(image => { image.loading = 'eager'; });
            await Promise.all(images.map(image => image.decode()));
          });
          assert.equal(await page.locator('h1:visible').count(), 1, `${name}: heading`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: overflow at ${width}`);
          assert.equal(await page.locator('img').evaluateAll(images => images.filter(img => !img.complete || img.naturalWidth === 0).length), 0);
          if (width === 1440 || width === 375) await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
        }
      }
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(failures, []);
    });
    await check('Mobile menu opens, closes and exposes current page', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${base}/catalog.html`);
      const toggler = page.getByRole('button', { name: 'Открыть меню' });
      await toggler.click();
      await page.locator('#mainNavbar.show').waitFor();
      assert.equal(await toggler.getAttribute('aria-expanded'), 'true');
      assert.equal((await page.locator('.nav-link[aria-current="page"]').textContent()).trim(), 'Каталог');
      await toggler.click();
      await page.waitForFunction(() => !document.getElementById('mainNavbar').classList.contains('show'));
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await check('Catalog pagination, search, category, price, sale, sorting and empty state', async () => {
      await page.goto(`${base}/catalog.html`);
      assert.equal(await page.locator('#catalogGrid [data-product-card]:visible').count(), 6);
      await page.getByRole('button', { name: 'Страница 2', exact: true }).click();
      assert.equal(await page.locator('#catalogGrid [data-product-card]:visible').count(), 3);
      await page.locator('#category').selectOption('Аудио');
      assert.equal(await page.locator('#catalogGrid [data-product-card]:visible').count(), 3);
      await page.locator('#sale').check();
      assert.equal(await page.locator('#catalogGrid [data-product-card]:visible').count(), 2);
      await page.locator('#maxPrice').fill('7000');
      assert.equal(await page.locator('#catalogGrid [data-product-card]:visible').count(), 1);
      assert.equal(await page.locator('#catalogGrid [data-product-card]:visible').getAttribute('data-id'), 'sound-go');
      await page.locator('#search').fill('несуществующий товар');
      assert.ok(await page.locator('#catalogEmpty').isVisible());
      await page.locator('[data-reset-filters]').click();
      await page.waitForFunction(() => document.getElementById('catalogCount').textContent.includes('9'));
      await page.locator('#sort').selectOption('price-asc');
      assert.equal(await page.locator('#catalogGrid [data-product-card]:visible').first().getAttribute('data-id'), 'light-dot');
      await page.goto(`${base}/catalog.html?category=${encodeURIComponent('Аксессуары')}`);
      assert.equal(await page.locator('#category').inputValue(), 'Аксессуары');
    });
    await check('Favorite persists across navigation and reload; empty state restores', async () => {
      await page.goto(`${base}/index.html`);
      await page.locator('[data-favorite="keys-air"]').click();
      assert.equal(await page.locator('[data-favorite-count]').textContent(), '1');
      await page.goto(`${base}/favorites.html`);
      await page.reload();
      assert.equal(await page.locator('#favoritesGrid [data-product-card]:visible').count(), 1);
      await page.locator('[data-favorite="keys-air"]').click();
      assert.ok(await page.locator('#favoritesEmpty').isVisible());
    });
    await check('All nine product pages, tabs, modal, invalid URL and order preselection', async () => {
      const products = await page.evaluate(() => window.SHOP_PRODUCTS.map(p => ({ id: p.id, name: p.name })));
      for (const product of products) {
        await page.goto(`${base}/product.html?id=${product.id}`);
        assert.equal(await page.locator('#detailName').textContent(), product.name);
        assert.equal(await page.locator('#detailSpecs tr').count(), 4);
        assert.ok((await page.locator('#detailOrder').getAttribute('href')).endsWith(product.id));
      }
      await page.getByRole('tab', { name: 'Доставка и возврат' }).click();
      assert.ok(await page.locator('#delivery').isVisible());
      await page.getByRole('button', { name: 'Как работает заявка?' }).click();
      await page.locator('#productHelp.show').waitFor();
      await page.waitForFunction(() => document.getElementById('productHelp').contains(document.activeElement));
      await page.keyboard.press('Escape');
      await page.locator('#productHelp').waitFor({ state: 'hidden' });
      await page.goto(`${base}/product.html?id=unknown`);
      assert.ok(await page.locator('#productNotFound').isVisible());
      await page.goto(`${base}/order.html?product=light-dot`);
      assert.equal(await page.locator('#orderProduct').inputValue(), 'light-dot');
      await page.goto(`${base}/order.html?product=unknown`);
      assert.equal(await page.locator('#orderProduct').inputValue(), '');
    });
    await check('Order validates required fields, phone, whitespace, integer quantity and courier address', async () => {
      await page.goto(`${base}/order.html`);
      await page.locator('#orderForm button[type=submit]').click();
      assert.ok(await page.locator('#formErrors').isVisible());
      assert.equal(await page.evaluate(() => document.activeElement.id), 'orderProduct');
      await page.locator('#orderProduct').selectOption('light-dot');
      await page.locator('#customerName').fill('  ');
      await page.locator('#email').fill('bad');
      await page.locator('#phone').fill('123');
      await page.locator('#quantity').fill('1.5');
      await page.locator('#orderForm button[type=submit]').click();
      for (const id of ['customerName','email','phone','quantity','consent']) {
        assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'true');
      }
      await page.locator('#customerName').fill('Тестовый пользователь');
      await page.locator('#email').fill('test@example.com');
      await page.locator('#phone').fill('+7 (999) 123-45-67');
      await page.locator('#quantity').fill('1');
      await page.locator('#consent').check();
      await page.locator('#courier').check();
      await page.locator('#orderForm button[type=submit]').click();
      assert.equal(await page.locator('#address').getAttribute('aria-invalid'), 'true');
      assert.ok((await page.locator('#summaryTotal').textContent()).includes('3'));
      assert.equal((await page.locator('#summaryDelivery').textContent()).replace(/\D/g, ''), '390');
      await page.locator('#quantity').fill('4');
      assert.equal((await page.locator('#summaryDelivery').textContent()).replace(/\D/g, ''), '0');
      await page.locator('#address').fill('Москва, Тестовая улица, дом 1');
      await page.locator('#comment').fill('<img src=x onerror=alert(1)>');
      await page.locator('#orderForm button[type=submit]').click();
      await page.locator('#confirmModal.show').waitFor();
      assert.ok((await page.locator('#confirmationDetails').textContent()).includes('<img src=x'));
      assert.equal(await page.locator('#confirmationDetails img').count(), 0);
      await page.screenshot({ path: path.join(output, 'order-confirmation.png'), fullPage: true });
      await page.getByRole('button', { name: 'Изменить', exact: true }).click();
      await page.locator('#confirmModal').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#customerName').inputValue(), 'Тестовый пользователь');
      await page.locator('#orderForm button[type=submit]').click();
      await page.locator('#confirmModal.show').waitFor();
      await page.locator('#confirmOrder').click();
      await page.locator('#orderSuccess').waitFor();
      assert.ok(await page.locator('#orderLayout').isHidden());
      assert.equal(await page.evaluate(() => document.activeElement.id), 'orderSuccess');
      assert.ok(!JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes('test@example.com'));
      await page.locator('#newOrder').click();
      assert.equal(await page.locator('#customerName').inputValue(), '');
      assert.ok(await page.locator('#orderSuccess').isHidden());
    });
    await check('Accordion and keyboard skip link work', async () => {
      await page.goto(`${base}/contacts.html`);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
      await page.getByRole('button', { name: 'Как оформить заказ?' }).click();
      await page.locator('#faq-0.show').waitFor();
      assert.ok(await page.locator('#faq-0').isVisible());
    });
    await check('Storage unavailable and JavaScript disabled degrade without errors', async () => {
      const blocked = await context.newPage();
      await blocked.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
      });
      await blocked.goto(`${base}/favorites.html`);
      assert.ok(await blocked.locator('#storageWarning').isVisible());
      await blocked.close();
      const nojs = await browser.newContext({ javaScriptEnabled: false });
      const staticPage = await nojs.newPage();
      await staticPage.goto(`${base}/catalog.html`);
      assert.equal(await staticPage.locator('[data-product-card]').count(), 9);
      await staticPage.goto(`${base}/product.html`);
      assert.equal((await staticPage.locator('h1:visible').textContent()).trim(), 'Keys Air');
      await staticPage.goto(`${base}/order.html`);
      assert.ok(await staticPage.locator('#customerName').isDisabled());
      assert.ok(await staticPage.locator('#orderForm button[type=submit]').isDisabled());
      await nojs.close();
    });
    assert.deepEqual(failures, []);
    assert.deepEqual(externalRequests, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ base, checks, pageErrors: failures, externalRequests, antivirusRequestsBlocked, widths: [320,375,768,1024,1440] }, null, 2));
    console.log(`${checks.length} scenarios passed.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
