import cfg        from '../config.js';
import * as fileUtils from './fileUtils.js';
import * as loginMod  from './login.js';

// PAD ProfilePage subflow:
// 1. Attach to "BNI Member Profile" tab (we open profile URL directly in new page)
// 2. Wait 5 seconds
// 3. Extract data using CSS: html > body > div:eq(0) > div > div > div:eq(1) >
//    div:eq(1) > div:eq(0) > div:eq(1) > div > div:eq(0)  (Own Text)
// 4. Write to BNI_DATA.txt
// 5. Regex parse email, phone, website
// 6. Write to Excel

export async function openProfile(context, profileUrl) {
  console.log(`[Profile] Opening: ${profileUrl}`);
  const profilePage = await context.newPage();
  profilePage.setDefaultTimeout(cfg.ACTION_TIMEOUT);
  profilePage.setDefaultNavigationTimeout(cfg.NAV_TIMEOUT);

  await profilePage.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
  return profilePage;
}

export async function scrapeProfilePage(profilePage) {
  console.log('[Profile] Scraping...');

  try {
    await profilePage.waitForLoadState('domcontentloaded', { timeout: cfg.NAV_TIMEOUT });
    // PAD waits 5 seconds after attaching
    await profilePage.waitForTimeout(5000);

    // Session check
const originalUrl = profilePage.url();
// networkHome?userId= redirects to web/member?uuId= — that's fine, continue scraping
if (originalUrl.includes('/login')) {
      const wasExpired = await loginMod.reAuthIfNeeded(profilePage);
      if (wasExpired) {
        await profilePage.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
        await profilePage.waitForTimeout(3000);
      }
    }

    // Wait for root to render
    await profilePage.waitForSelector('#root', { timeout: 10000 }).catch(() => {});
    await profilePage.waitForTimeout(2000);

    // Extract profile text — mirror PAD's CSS selector approach
    // PAD: html > body > div:eq(0) > div > div > div:eq(1) > div:eq(1) > div:eq(0) > div:eq(1) > div > div:eq(0)
    // This is the main profile content area
    const profileText = await extractProfileTextPAD(profilePage);

    fileUtils.writeTextFile(cfg.DATA_TXT, profileText);
    console.log(`[Profile] Got ${profileText.length} chars`);

    const contacts = fileUtils.parseContactDetails(profileText);
    console.log(`  Email:   ${contacts.email}`);
    console.log(`  Phone:   ${contacts.phone}`);
    console.log(`  Website: ${contacts.website}`);
    return contacts;

  } catch (err) {
    console.error('[Profile] Scrape failed:', err.message);
    return { email: 'Not Found', phone: 'Not Found', website: 'Not Found' };
  }
}

async function extractProfileTextPAD(page) {
  return await page.evaluate(() => {
    // PAD uses "Own Text" extraction on:
    // html > body > div:eq(0) > div > div > div:eq(1) > div:eq(1) > div:eq(0) > div:eq(1) > div > div:eq(0)
    // This targets the profile contact section
    // Let's find it multiple ways and combine

    const collected = [];

    // ── Strategy 1: PAD's exact CSS path ─────────────────────────────────
    try {
      const el = document.querySelector(
        'body > div:first-child > div > div > div:nth-child(2) > div:nth-child(2) > div:first-child > div:nth-child(2) > div > div:first-child'
      );
      if (el) collected.push(el.innerText || '');
    } catch {}

    // ── Strategy 2: Broader profile content container ──────────────────────
    // The BNI profile page (bniconnectglobal.com/web/secure/networkHome) has:
    // - A main content area with contact info
    // Look for email/phone/website in specific profile sections
    try {
      // Profile info sections
      const profileSections = document.querySelectorAll(
        '[class*="profile"], [class*="contact"], [class*="member"], [class*="networkHome"]'
      );
      profileSections.forEach(s => collected.push(s.innerText || ''));
    } catch {}

    // ── Strategy 3: Collect ALL links (mailto, tel, https) ────────────────
    // PAD reads the full text then regexes — we also collect links directly
    const linkTexts = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('mailto:')) {
        linkTexts.push('Email: ' + href.replace('mailto:', '').split('?')[0]);
      }
      if (href.startsWith('tel:')) {
        linkTexts.push('Phone: ' + href.replace('tel:', '').trim());
      }
      if (href.startsWith('http') &&
          !href.includes('bniconnectglobal') &&
          !href.includes('bni.com') &&
          !href.includes('bni.in') &&
          !href.includes('javascript:')) {
        linkTexts.push('Website: ' + href);
      }
    });

    // ── Strategy 4: Full body text (PAD regex runs on full extracted text) ─
    const bodyText = document.body?.innerText || '';

    // Combine: links first (highest precision), then section text, then body
    return [...linkTexts, ...collected, bodyText].join('\n');
  });
}