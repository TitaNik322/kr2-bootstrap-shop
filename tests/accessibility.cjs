const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
// Download axe-core for development only, outside the published website.
// https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js
(async () => {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.BROWSER_PATH || (fs.existsSync(edge) ? edge : undefined);
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.route('**/*.scr.kaspersky-labs.com/**', route => route.abort());
  const reports = [];
  try {
    for (const name of ['index','catalog','product','order','favorites','delivery','contacts','privacy']) {
      await page.goto(`http://127.0.0.1:4173/${name}.html`);
      let axePath;
      try { axePath = require.resolve('axe-core/axe.min.js'); }
      catch { axePath = path.join(__dirname, '../test-results/axe.min.js'); }
      await page.addScriptTag({ path: axePath });
      const result = await page.evaluate(async () => {
        const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } });
        return { violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target:n.target, summary:n.failureSummary })) })), incomplete: result.incomplete.map(v=>v.id) };
      });
      reports.push({ page:name, ...result });
      console.log(name, JSON.stringify(result.violations));
    }
    fs.writeFileSync(path.join(__dirname, '../test-results/accessibility.json'), JSON.stringify(reports,null,2));
    if (reports.some(result => result.violations.length)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
