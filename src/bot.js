// src/bot.js
import { chromium }        from 'playwright';
import fs                  from 'fs';
import cfg                 from '../config.js';
import * as excelHelper    from './excelHelper.js';
import * as fileUtils      from './fileUtils.js';
import * as loginMod       from './login.js';
import * as searchMod      from './search.js';
import * as profileScraper from './profileScraper.js';
import * as outputBuilder  from './outputBuilder.js';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  BNI BOT  –  Multi-Country Edition');
  console.log('═══════════════════════════════════════════\n');

  // ── Read Category_Country.xlsx ────────────────────────────────────────────
  console.log('[Main] Reading Category_Country.xlsx...');
  const countryRows = await excelHelper.readCategoryCountry(cfg.CATEGORY_COUNTRY_XLS);
  if (!countryRows.length) {
    console.error('No data in Category_Country.xlsx');
    process.exit(1);
  }
  console.log(`[Main] ${countryRows.length} countries to process.\n`);

  // ── Launch browser ONCE — reused for all countries ────────────────────────
  const launchOpts = { headless: cfg.HEADLESS, args: ['--start-maximized'] };
  if (cfg.BROWSER_CHANNEL) launchOpts.channel = cfg.BROWSER_CHANNEL;

  console.log('[Main] Launching browser...');
  const browser = await chromium.launch(launchOpts);
  const context  = await browser.newContext({ viewport: null, ignoreHTTPSErrors: true });
  const page     = await context.newPage();
  page.setDefaultTimeout(cfg.ACTION_TIMEOUT);
  page.setDefaultNavigationTimeout(cfg.NAV_TIMEOUT);

  try {
    // ── Login once before all countries ──────────────────────────────────────
    await loginMod.login(page);

    // ── Loop every country row ────────────────────────────────────────────────
    for (const { country, categories } of countryRows) {
      console.log('\n' + '═'.repeat(60));
      console.log(`[Country] ${country}  (${categories.length} categories)`);
      console.log('═'.repeat(60));

      // Archive previous output for this country if it exists
      const prevOutputPath = outputBuilder.getOutputPath(country);
      if (fs.existsSync(prevOutputPath)) {
        console.log('[Main] Previous output found — cleaning and archiving...');
        await fileUtils.cleanAndArchive();
      } else {
        fileUtils.ensureDir(cfg.PROFILE_DIR);
        fileUtils.ensureDir(cfg.MOVED_DIR);
      }

      // Create fresh multi-sheet workbook for this country
      await outputBuilder.createOutputFile(country, categories);

      // ── Loop every category ───────────────────────────────────────────────
      for (let catIdx = 0; catIdx < categories.length; catIdx++) {
        const categoryName = categories[catIdx];

        console.log('\n' + '─'.repeat(60));
        console.log(`[Category ${catIdx + 1}/${categories.length}] ${categoryName}`);
        console.log('─'.repeat(60));

        // Search + extract member list for this category
        let members = [];
        try {
          members = await searchMod.runMemberSearch(page, country, categoryName);
        } catch (err) {
          console.error(`[Category] Search failed: ${err.message}`);
          continue;
        }

        if (!members.length) {
          console.warn(`[Category] No members found for "${categoryName}" — skipping.`);
          continue;
        }
        console.log(`[Category] Found ${members.length} members.`);

        // Write member list into the correct sheet
        await outputBuilder.appendMembersToSheet(country, categoryName, members);

        // Scrape each member's profile
        let processed = 0, skipped = 0, noData = 0;

        for (let i = 0; i < members.length; i++) {
          const member     = members[i];
          const memberName = member.Name;
          const profileUrl = member.profileUrl || '';

          // Skip if already processed from a previous run
          const done = await outputBuilder.isAlreadyDone(country, categoryName, memberName);
          if (done) {
            console.log(`  [Skip] Already processed: "${memberName}"`);
            skipped++;
            continue;
          }

          console.log(`\n  [${i + 1}/${members.length}] "${memberName}"`);
          console.log(`  URL: ${profileUrl || 'NONE'}`);

          if (!profileUrl) {
            console.warn('  No profile URL — fallback name search...');
            const fallbackUrl = await findProfileByName(page, memberName, context);
            if (!fallbackUrl) {
              await outputBuilder.writeContactToRow(country, categoryName, memberName,
                { email: 'Not Found', email2: '', phone: 'Not Found', phone2: '', website: 'Not Found' });
              noData++;
              continue;
            }
            const profilePage = await profileScraper.openProfile(context, fallbackUrl);
            const contacts    = await profileScraper.scrapeProfilePage(profilePage);
            await profilePage.close().catch(() => {});
            await outputBuilder.writeContactToRow(country, categoryName, memberName, contacts);
            processed++;
            continue;
          }

          try {
            const profilePage = await profileScraper.openProfile(context, profileUrl);
            const contacts    = await profileScraper.scrapeProfilePage(profilePage);
            await profilePage.close().catch(() => {});
            await outputBuilder.writeContactToRow(country, categoryName, memberName, contacts);
            processed++;

            // Re-login if session expired during scraping
            if (page.url().includes('/login')) {
              console.log('  [Session] Expired — re-logging in...');
              await loginMod.login(page);
            }
          } catch (err) {
            console.error(`  [Error] "${memberName}": ${err.message}`);
            await outputBuilder.writeContactToRow(country, categoryName, memberName,
              { email: 'Not Found', email2: '', phone: 'Not Found', phone2: '', website: 'Not Found' }
            ).catch(() => {});
          }
        }

        console.log(`\n[Category] Done: ${categoryName}`);
        console.log(`  Written: ${processed} | NoData: ${noData} | Skipped: ${skipped} | Total: ${members.length}`);
      }

      console.log(`\n✅ ${country} complete → ${outputBuilder.getOutputPath(country)}`);
    }

    console.log('\n[Main] 🎉 All countries done.');

  } catch (err) {
    console.error('[Main] Fatal error:', err);
  } finally {
    await browser.close();
    console.log('[Main] Browser closed.');
  }
}

// Fallback: find profile URL by searching member name
async function findProfileByName(page, memberName, context) {
  const searchPage = await context.newPage();
  try {
    await searchPage.goto(cfg.SEARCH_URL, {
      waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT,
    });
    await searchPage.waitForTimeout(3000);

    const searchInput = searchPage.locator(
      'input[placeholder*="Search"], input.MuiInputBase-input'
    ).first();
    if (!await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) return null;

    await searchInput.fill(memberName);
    await searchPage.waitForTimeout(2000);
    await searchPage.getByRole('button', { name: 'Search Members' }).click();
    await searchPage.waitForTimeout(3000);

    const allAnchors = searchPage.locator('a');
    const count      = await allAnchors.count();
    let href         = null;
    for (let i = 0; i < count; i++) {
      const txt = (await allAnchors.nth(i).innerText().catch(() => '')).trim();
      if (txt === memberName.trim()) {
        href = await allAnchors.nth(i).getAttribute('href').catch(() => null);
        break;
      }
    }
    if (!href) return null;
    return href.startsWith('http') ? href : `https://www.bniconnectglobal.com${href}`;
  } catch (err) {
    console.error('[Fallback] Failed:', err.message);
    return null;
  } finally {
    await searchPage.close().catch(() => {});
  }
}

main().catch(err => { console.error(err); process.exit(1); });