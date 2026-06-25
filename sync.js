const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHEET_URL = 'https://docs.qq.com/sheet/DUEVoZ1ZJRHpVS0Vw?tab=BB08J2';
const OUTPUT = path.join(__dirname, 'data.json');

const EMOJI_MAP = {
  '粗粮':'🌽','饭':'🍚','轻食':'🥗','粉':'🍜','面':'🍝',
  '汉堡/三明治':'🍔','无主食':'🥬','饼/馍':'🫓'
};
function autoEmoji(type) { return EMOJI_MAP[type] || '🍽️'; }

(async () => {
  console.log(`[${new Date().toISOString()}] Starting scrape...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(8000);

    // Grant clipboard
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Select all and copy
    await page.click('body', { position: { x: 400, y: 300 } });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);

    const raw = await page.evaluate(() => navigator.clipboard.readText());
    const lines = raw.trim().split('\n');

    // First line is header, skip it
    const foods = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      if (cols.length < 4) continue;
      const name = (cols[0] || '').trim();
      if (!name) continue;

      const type = (cols[1] || '').trim();
      const source = (cols[2] || '').trim();
      const dietRaw = (cols[3] || '').trim();
      const note = (cols[4] || '').trim();
      const diet = dietRaw.includes('减脂') ? 'diet' : 'normal';

      foods.push({
        id: 's' + i,
        name,
        emoji: autoEmoji(type),
        source,
        type,
        diet,
        note,
      });
    }

    const output = {
      updated: Date.now(),
      source: SHEET_URL,
      count: foods.length,
      foods,
    };

    // Check if food data actually changed (for logging)
    if (fs.existsSync(OUTPUT)) {
      try {
        const old = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
        const oldFoods = JSON.stringify(old.foods || []);
        const newFoods = JSON.stringify(foods);
        if (oldFoods === newFoods) {
          console.log(`⏭️  食物数据未变化（${foods.length} 条），仅更新时间戳`);
        } else {
          console.log(`📝 食物数据有变化: ${old.count || 0} → ${foods.length} 条`);
        }
      } catch(e) {
        console.log('⚠️  旧数据解析失败，直接写入');
      }
    }

    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`✅ Synced ${foods.length} foods to data.json`);
  } catch (e) {
    console.error('❌ Scrape failed:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
