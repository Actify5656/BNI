import { chromium } from 'playwright';
import cfg               from '../config.js';
import * as excelHelper  from './excelHelper.js';
import * as fileUtils    from './fileUtils.js';
import * as loginMod     from './login.js';
import * as searchMod    from './search.js';
import * as profileScraper from './profileScraper.js';
import * as outputBuilder  from './outputBuilder.js';

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  BNI BOT  –  Playwright Edition (PAD-aligned)');
  console.log('═══════════════════════════════════════════\n');

  // ── Step 1: Read Category_Country.xlsx ───────────────────────────────────
  // PAD: reads ALL rows, processes LAST row (LOOP FOREACH but SET overwrites so last wins)
  console.log('[Main] Reading Category_Country.xlsx...');
  const categoryRows = await excelHelper.readAllRows(cfg.CATEGORY_COUNTRY_XLS);
  if (!categoryRows.length) {
    console.error('No data in Category_Country.xlsx');
    process.exit(1);
  }

  // PAD loops through ALL rows but since SET overwrites each iteration,
  // effectively uses the LAST row. Replicate that:
  const lastRow      = categoryRows[categoryRows.length - 1];
  const countryName  = String(lastRow['Country']   || '').trim();
  const categoryName = String(lastRow['Category']  || '').trim();
  const categoryName2 = String(lastRow['Category2'] || '').trim(); // PAD uses Category2 for result-click
  console.log(`[Main] Country: ${countryName} | Category: ${categoryName} | Category2: ${categoryName2}`);

  // ── Step 2: Archive old output files ─────────────────────────────────────
  // PAD: GetFiles *.xlsx → RenameAddDateTime → Move to MOVED_FILES
  fileUtils.archiveExistingFiles();

  // ── Launch browser ────────────────────────────────────────────────────────
  const launchOpts = {
    headless: cfg.HEADLESS,
    args: ['--start-maximized'],
  };
  if (cfg.BROWSER_CHANNEL) launchOpts.channel = cfg.BROWSER_CHANNEL;

  console.log(`[Main] Launching browser...`);
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: null, ignoreHTTPSErrors: true });
  const page    = await context.newPage();
  page.setDefaultTimeout(cfg.ACTION_TIMEOUT);
  page.setDefaultNavigationTimeout(cfg.NAV_TIMEOUT);

  try {
    // ── Step 3: Login ─────────────────────────────────────────────────────
    // PAD: LaunchEdge to login URL, fill username/password, click Sign In, dismiss popup
    await loginMod.login(page);

    // ── Step 4: BackToWebsite subflow = navigate to search ────────────────
    // PAD BackToWebsite: clicks 'Search People' paragraph on dashboard
    // We go directly to search URL (equivalent)
    await page.goto(cfg.SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
    await page.waitForTimeout(2000);

    // ── Step 5: Run search with filters ──────────────────────────────────
    // PAD main flow: Filter → Country → Category → Search Members → click Category2 → scroll
    const members = await searchMod.runMemberSearch(page, countryName, categoryName, categoryName2);

    if (!members.length) {
      console.warn('[Main] No members found. Exiting.');
      await browser.close();
      return;
    }

    // ── Step 6: Extract table → write to BNIBOT.xlsm → run macro → new xlsx ─
    // PAD: writes ExtractedData to BNIBOT.xlsm → runs CleanNames_NoPrefix macro
    //       → copies to ${CountryName}.xlsx with proper headers
    // We skip the macro step and write directly (already clean from Playwright extraction)
    await outputBuilder.createOutputFile(countryName, members);

    // ── Step 7: Read ${CountryName}.xlsx rows ─────────────────────────────
    // PAD: reads ExcelData2 from the new file
    const rows = await outputBuilder.readOutputRows(countryName);
    console.log(`[Main] ${rows.length} rows to process.\n`);

    // ── Step 8: Main loop — PAD's member loop ─────────────────────────────
    // PAD LOOP FOREACH CurrentItem IN ExcelData2
    //   IF IsEmpty(CurrentItem.Status) THEN
    //     FindSingle by Name → get FoundRowIndex
    //     LaunchEdge to search URL → type name in search box → Search Members
    //     Click member anchor by name → {Up}{Up}{Enter} (to trigger right-click copy URL)
    //     Clipboard.GetText → WebsiteLInk (the profile URL)
    //     CALL ProfilePage (attach to "BNI Member Profile" tab, extract, write Excel)
    //
    // Our approach: we already captured profileUrl during search, use it directly
    // This is actually BETTER than PAD (PAD has to re-search per member)

    let processed = 0, skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row        = rows[i];
      const memberName = String(row['Name'] || '').trim();
      if (!memberName) continue;

      // PAD: IF IsEmpty(CurrentItem.Status) — skip if already DONE
      if (outputBuilder.isAlreadyDone(row)) {
        console.log(`[Loop] SKIP (DONE): "${memberName}"`);
        skipped++;
        continue;
      }

      const memberData = members.find(m => m.Name === memberName);
      const profileUrl = memberData?.profileUrl || '';

      console.log(`\n[Loop] ${i + 1}/${rows.length}: "${memberName}"`);
      console.log(`        URL: ${profileUrl}`);

      if (!profileUrl) {
        console.warn('[Loop] No profile URL — trying name search fallback...');
        // PAD fallback: search by name to find the profile URL
        const fallbackUrl = await findProfileByName(page, memberName, context);
        if (!fallbackUrl) {
          await outputBuilder.writeContactToRow(countryName, memberName,
            { email: 'No URL', phone: 'No URL', website: 'No URL' });
          continue;
        }
        // Use fallback URL
        const profilePage = await profileScraper.openProfile(context, fallbackUrl);
        await processProfile(profilePage, countryName, memberName);
        processed++;
        continue;
      }

      try {
        // ── PAD ProfilePage subflow ──────────────────────────────────────
        // PAD: Attach to "BNI Member Profile" tab → wait 5s → ExtractData → 
        //      write BNI_DATA.txt → regex parse → write to Excel
        const profilePage = await profileScraper.openProfile(context, profileUrl);
        const contacts    = await profileScraper.scrapeProfilePage(profilePage);
        await profilePage.close().catch(() => {});

        await outputBuilder.writeContactToRow(countryName, memberName, contacts);
        processed++;

        // Check if main session is still alive
        if (page.url().includes('/login')) {
          console.log('[Loop] Main session expired, re-logging in...');
          await loginMod.login(page);
        }

      } catch (err) {
        console.error(`[Loop] Error for "${memberName}": ${err.message}`);
        await outputBuilder.writeContactToRow(countryName, memberName,
          { email: 'ERROR', phone: 'ERROR', website: 'ERROR' }).catch(() => {});
      }
    }

    console.log(`\n[Main] ✅ Done. Processed: ${processed}  Skipped: ${skipped}`);
    console.log(`[Main] Output: ${outputBuilder.getOutputPath(countryName)}`);

  } catch (err) {
    console.error('[Main] Fatal error:', err);
  } finally {
    await browser.close();
  }
}

// PAD fallback: search by member name → click their link → get profile URL
// Mirrors PAD's per-member search in the loop
async function findProfileByName(page, memberName, context) {
  try {
    console.log(`[Fallback] Searching for "${memberName}" by name...`);

    // PAD: navigates to search URL in a new browser instance
    const searchPage = await context.newPage();
    await searchPage.goto(
      `https://www.bniconnectglobal.com/web/dashboard/search`,
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );
    await searchPage.waitForTimeout(3000);

    // PAD: populates the search text field (Div '​​' 2 / input :ri:)
    // This is the free-text "Search BNI Directory for" input
    const searchInput = searchPage.locator('input[placeholder*="Search"], input.MuiInputBase-input').first();
    const inputVisible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (inputVisible) {
      await searchInput.fill(memberName);
      await searchPage.waitForTimeout(2000);

      // PAD clicks Search Members button
      await searchPage.getByRole('button', { name: 'Search Members' }).click();
      await searchPage.waitForTimeout(3000);

      // PAD: clicks the anchor with name text → {Up}{Up}{Enter} → clipboard
      // We just find the href directly
      const anchor = searchPage.locator(`a:has-text("${memberName}")`).first();
      const href = await anchor.getAttribute('href', { timeout: 5000 }).catch(() => null);
      await searchPage.close();

      if (href) {
        return href.startsWith('http')
          ? href
          : `https://www.bniconnectglobal.com${href}`;
      }
    }

    await searchPage.close().catch(() => {});
    return null;
  } catch (err) {
    console.error('[Fallback] Name search failed:', err.message);
    return null;
  }
}

async function processProfile(profilePage, countryName, memberName) {
  const contacts = await profileScraper.scrapeProfilePage(profilePage);
  await profilePage.close().catch(() => {});
  await outputBuilder.writeContactToRow(countryName, memberName, contacts);
}

main().catch(err => { console.error(err); process.exit(1); });