import cfg from '../config.js';

export async function login(page) {
  console.log('[Login] Navigating to login page...');
  await page.goto(cfg.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });

  // Wait for login form to be ready (mirrors PAD: wait for login div)
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });

  await page.locator('input[name="username"]').fill(cfg.USERNAME);
  await page.locator('input[name="password"]').fill(cfg.PASSWORD);
  await page.locator('button[type="submit"]').click();

  await page.waitForTimeout(cfg.WAIT_AFTER_LOGIN);

  // Dismiss popup if present (PAD: checks for "Happy...September 12" div then clicks Back)
  await dismissPopup(page);

  console.log('[Login] Login complete. URL:', page.url());
}

export async function reAuthIfNeeded(page) {
  if (!page.url().includes('/login')) return false;
  console.log('[Login] Session expired – re-authenticating...');
  try {
    await page.waitForSelector('input[name="password"]', { timeout: 5000 });
    await page.locator('input[name="password"]').fill(cfg.PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);
    await dismissPopup(page);
    console.log('[Login] Re-auth done.');
    return true;
  } catch (err) {
    console.error('[Login] Re-auth failed:', err.message);
    return false;
  }
}

export async function dismissPopup(page) {
  try {
    // PAD checks for the "Happy Connecting" popup div and clicks Back
    const backBtn = page.locator('a.button:has-text("Back"), a:has-text("Back")').first();
    const vis = await backBtn.isVisible({ timeout: 4000 }).catch(() => false);
    if (vis) {
      await backBtn.click();
      await page.waitForTimeout(1500);
      console.log('[Login] Popup dismissed (Back button).');
      return;
    }
    // Also try MUI close button
    const closeBtn = page.locator('.MuiTypography-root.MuiTypography-body1.css-1c6tb1q > svg').first();
    const vis2 = await closeBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (vis2) {
      await closeBtn.click();
      await page.waitForTimeout(1000);
      console.log('[Login] Popup dismissed (SVG close).');
    }
  } catch { /* no popup */ }
}