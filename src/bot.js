// import { chromium }        from 'playwright';
// import cfg                 from '../config.js';
// import * as excelHelper    from './excelHelper.js';
// import * as fileUtils      from './fileUtils.js';
// import * as loginMod       from './login.js';
// import * as searchMod      from './search.js';
// import * as profileScraper from './profileScraper.js';
// import * as outputBuilder  from './outputBuilder.js';

// async function main() {
//   console.log('═══════════════════════════════════════════');
//   console.log('  BNI BOT  –  Playwright Edition v2');
//   console.log('═══════════════════════════════════════════\n');

//   // ── Step 1: Read Category_Country.xlsx ───────────────────────────────────
//   console.log('[Main] Reading Category_Country.xlsx...');
//   const categoryRows = await excelHelper.readAllRows(cfg.CATEGORY_COUNTRY_XLS);
//   if (!categoryRows.length) {
//     console.error('No data in Category_Country.xlsx');
//     process.exit(1);
//   }

//   const lastRow       = categoryRows[categoryRows.length - 1];
//   const countryName   = String(lastRow['Country']   || '').trim();
//   const categoryName  = String(lastRow['Category']  || '').trim();
//   const categoryName2 = String(lastRow['Category2'] || '').trim();
//   console.log(`[Main] Country: ${countryName} | Category: ${categoryName} | Category2: ${categoryName2}`);

//   // ── Step 2: Clean dirty data then archive old output files ───────────────
//   // FIX 1: was fileUtils.archiveExistingFiles() — that function no longer exists
//   await fileUtils.cleanAndArchive();

//   // ── Launch browser ────────────────────────────────────────────────────────
//   const launchOpts = {
//     headless: cfg.HEADLESS,
//     args: ['--start-maximized'],
//   };
//   if (cfg.BROWSER_CHANNEL) launchOpts.channel = cfg.BROWSER_CHANNEL;

//   console.log('[Main] Launching browser...');
//   const browser = await chromium.launch(launchOpts);
//   const context = await browser.newContext({ viewport: null, ignoreHTTPSErrors: true });
//   const page    = await context.newPage();
//   page.setDefaultTimeout(cfg.ACTION_TIMEOUT);
//   page.setDefaultNavigationTimeout(cfg.NAV_TIMEOUT);

//   try {
//     // ── Step 3: Login ─────────────────────────────────────────────────────
//     await loginMod.login(page);

//     // ── Step 4: Navigate to search ────────────────────────────────────────
//     await page.goto(cfg.SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
//     await page.waitForTimeout(2000);

//     // ── Step 5: Run search with filters + extract member list ─────────────
//     const members = await searchMod.runMemberSearch(page, countryName, categoryName, categoryName2);
//     if (!members.length) {
//       console.warn('[Main] No members found. Exiting.');
//       await browser.close();
//       return;
//     }

//     // ── Step 6: Create output Excel with member list ──────────────────────
//     await outputBuilder.createOutputFile(countryName, members);

//     // ── Step 7: Re-read rows ──────────────────────────────────────────────
//     const rows = await outputBuilder.readOutputRows(countryName);
//     console.log(`[Main] ${rows.length} rows to process.\n`);

//     // ── Step 8: Loop every member → open profile → scrape contacts ────────
//     let processed = 0, skipped = 0;

//     for (let i = 0; i < rows.length; i++) {
//       const row        = rows[i];
//       const memberName = String(row['Name'] || '').trim();
//       if (!memberName) continue;

//       if (outputBuilder.isAlreadyDone(row)) {
//         console.log(`[Loop] SKIP (DONE): "${memberName}"`);
//         skipped++;
//         continue;
//       }

//       const memberData = members.find(m => m.Name === memberName);
//       const profileUrl = memberData?.profileUrl || '';

//       console.log(`\n[Loop] ${i + 1}/${rows.length}: "${memberName}"`);
//       console.log(`        URL: ${profileUrl}`);

//       if (!profileUrl) {
//         console.warn('[Loop] No profile URL — trying name search fallback...');
//         const fallbackUrl = await findProfileByName(page, memberName, context);
//         if (!fallbackUrl) {
//           await outputBuilder.writeContactToRow(countryName, memberName,
//             { email: 'No URL', phone: 'No URL', website: 'No URL' });
//           continue;
//         }
//         const profilePage = await profileScraper.openProfile(context, fallbackUrl);
//         await processProfile(profilePage, countryName, memberName);
//         processed++;
//         continue;
//       }

//       try {
//         const profilePage = await profileScraper.openProfile(context, profileUrl);
//         const contacts    = await profileScraper.scrapeProfilePage(profilePage);
//         await profilePage.close().catch(() => {});

//         await outputBuilder.writeContactToRow(countryName, memberName, contacts);
//         processed++;

//         // Re-login if main session expired
//         if (page.url().includes('/login')) {
//           console.log('[Loop] Main session expired, re-logging in...');
//           await loginMod.login(page);
//         }

//       } catch (err) {
//         console.error(`[Loop] Error for "${memberName}": ${err.message}`);
//         await outputBuilder.writeContactToRow(countryName, memberName,
//           { email: 'ERROR', phone: 'ERROR', website: 'ERROR' }).catch(() => {});
//       }
//     }

//     console.log(`\n[Main] ✅ Done. Processed: ${processed}  Skipped: ${skipped}`);
//     console.log(`[Main] Output: ${outputBuilder.getOutputPath(countryName)}`);

//   } catch (err) {
//     console.error('[Main] Fatal error:', err);
//   } finally {
//     await browser.close();
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  Fallback: search by member name to find their profile URL
// //  FIX 3: loop through anchors by exact innerText instead of CSS :has-text()
// //  which breaks on names with apostrophes, dots, commas etc.
// // ─────────────────────────────────────────────────────────────────────────────
// async function findProfileByName(page, memberName, context) {
//   const searchPage = await context.newPage();
//   try {
//     console.log(`[Fallback] Searching for "${memberName}"...`);

//     await searchPage.goto(cfg.SEARCH_URL, {
//       waitUntil: 'domcontentloaded',
//       timeout: cfg.NAV_TIMEOUT,
//     });
//     await searchPage.waitForTimeout(3000);

//     // Type name into search box
//     const searchInput = searchPage.locator(
//       'input[placeholder*="Search"], input.MuiInputBase-input'
//     ).first();
//     const visible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
//     if (!visible) return null;

//     await searchInput.fill(memberName);
//     await searchPage.waitForTimeout(2000);
//     await searchPage.getByRole('button', { name: 'Search Members' }).click();
//     await searchPage.waitForTimeout(3000);

//     // FIX 3: find anchor by exact innerText — safe for all special characters
//     const allAnchors = searchPage.locator('a');
//     const count      = await allAnchors.count();
//     let href         = null;

//     for (let i = 0; i < count; i++) {
//       const txt = (await allAnchors.nth(i).innerText().catch(() => '')).trim();
//       if (txt === memberName.trim()) {
//         href = await allAnchors.nth(i).getAttribute('href').catch(() => null);
//         break;
//       }
//     }

//     if (!href) return null;
//     return href.startsWith('http') ? href : `https://www.bniconnectglobal.com${href}`;

//   } catch (err) {
//     console.error('[Fallback] Failed:', err.message);
//     return null;
//   } finally {
//     await searchPage.close().catch(() => {});
//   }
// }

// async function processProfile(profilePage, countryName, memberName) {
//   const contacts = await profileScraper.scrapeProfilePage(profilePage);
//   await profilePage.close().catch(() => {});
//   await outputBuilder.writeContactToRow(countryName, memberName, contacts);
// }

// main().catch(err => { console.error(err); process.exit(1); });






// // src/bot.js
// import { chromium }        from 'playwright';
// import cfg                 from '../config.js';
// import * as excelHelper    from './excelHelper.js';
// import * as fileUtils      from './fileUtils.js';
// import * as loginMod       from './login.js';
// import * as searchMod      from './search.js';
// import * as profileScraper from './profileScraper.js';
// import * as outputBuilder  from './outputBuilder.js';
// import fs from 'fs';  

// async function main() {
//   console.log('═══════════════════════════════════════════');
//   console.log('  BNI BOT  –  Multi-Category Edition');
//   console.log('═══════════════════════════════════════════\n');

//   // ── Step 1: Read Category_Country.xlsx ───────────────────────────────────
//   // Returns [{ country: 'India', categories: ['Food & Beverage (Caterer)', ...] }]
//   console.log('[Main] Reading Category_Country.xlsx...');
//   const countryRows = await excelHelper.readCategoryCountry(cfg.CATEGORY_COUNTRY_XLS);
//   if (!countryRows.length) {
//     console.error('No data in Category_Country.xlsx');
//     process.exit(1);
//   }

//   // Process each country row (usually just one)
//   for (const { country, categories } of countryRows) {
//     console.log(`\n[Main] Country: ${country}`);
//     console.log(`[Main] Categories (${categories.length}): ${categories.join(' | ')}`);



// // src/bot.js  — replace Step 2 block only

// // ── Step 2: Archive previous run's output if it exists and has data ─────────
// // NOTE: We archive BEFORE creating the new file so the previous
// //       filled India.xlsx gets cleaned and moved, not the new empty one.
// const prevOutputPath = outputBuilder.getOutputPath(country);
// // add this at top of file with other imports

// // Only archive if the file exists (means a previous run completed)
// if (fs.existsSync(prevOutputPath)) {
//   await fileUtils.cleanAndArchive();
// } else {
//   console.log('[Archive] No previous output file found — skipping archive.');
//   // Still ensure directories exist
//   fileUtils.ensureDir(cfg.PROFILE_DIR);
//   fileUtils.ensureDir(cfg.MOVED_DIR);
// }






//     // ── Step 3: Create fresh multi-sheet output workbook ───────────────────
//     await outputBuilder.createOutputFile(country, categories);

//     // ── Launch browser ──────────────────────────────────────────────────────
//     const launchOpts = { headless: cfg.HEADLESS, args: ['--start-maximized'] };
//     if (cfg.BROWSER_CHANNEL) launchOpts.channel = cfg.BROWSER_CHANNEL;

//     console.log('\n[Main] Launching browser...');
//     const browser = await chromium.launch(launchOpts);
//     const context = await browser.newContext({ viewport: null, ignoreHTTPSErrors: true });
//     const page    = await context.newPage();
//     page.setDefaultTimeout(cfg.ACTION_TIMEOUT);
//     page.setDefaultNavigationTimeout(cfg.NAV_TIMEOUT);

//     try {
//       // ── Step 4: Login once for the whole country run ─────────────────────
//       await loginMod.login(page);

//       // ── Step 5: Loop every category ──────────────────────────────────────
//       for (let catIdx = 0; catIdx < categories.length; catIdx++) {
//         const categoryName = categories[catIdx];

//         console.log('\n' + '─'.repeat(60));
//         console.log(`[Category ${catIdx + 1}/${categories.length}] ${categoryName}`);
//         console.log('─'.repeat(60));

//         // ── 5a: Search + extract member list for this category ─────────────
//         let members = [];
//         try {
//           members = await searchMod.runMemberSearch(page, country, categoryName);
//         } catch (err) {
//           console.error(`[Category] Search failed: ${err.message}`);
//           continue; // skip to next category
//         }

//         if (!members.length) {
//           console.warn(`[Category] No members found for "${categoryName}" — skipping.`);
//           continue;
//         }

//         console.log(`[Category] Found ${members.length} members.`);

//         // ── 5b: Write member list into the correct sheet ───────────────────
//         await outputBuilder.appendMembersToSheet(country, categoryName, members);

//         // ── 5c: Loop each member → scrape profile ─────────────────────────
//         let processed = 0, skipped = 0;

//         for (let i = 0; i < members.length; i++) {
//           const member     = members[i];
//           const memberName = member.Name;
//           const profileUrl = member.profileUrl || '';

//           // Check if already done (supports resuming a crashed run)
//           const done = await outputBuilder.isAlreadyDone(country, categoryName, memberName);
//           if (done) {
//             console.log(`  [Skip] Already DONE: "${memberName}"`);
//             skipped++;
//             continue;
//           }

//           console.log(`\n  [${i + 1}/${members.length}] "${memberName}"`);
//           console.log(`  URL: ${profileUrl || 'NONE'}`);

//           if (!profileUrl) {
//             console.warn('  No profile URL — trying name search fallback...');
//             const fallbackUrl = await findProfileByName(page, memberName, context);
//             if (!fallbackUrl) {
//               await outputBuilder.writeContactToRow(country, categoryName, memberName,
//                 { email: 'No URL', phone: 'No URL', website: 'No URL' });
//               continue;
//             }
//             const profilePage = await profileScraper.openProfile(context, fallbackUrl);
//             const contacts    = await profileScraper.scrapeProfilePage(profilePage);
//             await profilePage.close().catch(() => {});
//             await outputBuilder.writeContactToRow(country, categoryName, memberName, contacts);
//             processed++;
//             continue;
//           }

//           try {
//             const profilePage = await profileScraper.openProfile(context, profileUrl);
//             const contacts    = await profileScraper.scrapeProfilePage(profilePage);
//             await profilePage.close().catch(() => {});
//             await outputBuilder.writeContactToRow(country, categoryName, memberName, contacts);
//             processed++;

//             // Re-login if session expired
//             if (page.url().includes('/login')) {
//               console.log('  [Session] Expired — re-logging in...');
//               await loginMod.login(page);
//             }

//           } catch (err) {
//             console.error(`  [Error] "${memberName}": ${err.message}`);
//             await outputBuilder.writeContactToRow(country, categoryName, memberName,
//               { email: 'ERROR', phone: 'ERROR', website: 'ERROR' }).catch(() => {});
//           }
//         }

//         console.log(`\n[Category] "${categoryName}" done.`);
//         console.log(`  Processed: ${processed}  |  Skipped: ${skipped}  |  Total: ${members.length}`);
//       }

//       // ── Step 6: All categories done ───────────────────────────────────────
//       console.log('\n' + '═'.repeat(60));
//       console.log(`✅  All ${categories.length} categories processed for ${country}`);
//       console.log(`    Output: ${outputBuilder.getOutputPath(country)}`);
//       console.log('═'.repeat(60));

//     } catch (err) {
//       console.error('[Main] Fatal error:', err);
//     } finally {
//       await browser.close();
//       console.log('[Main] Browser closed.');
//     }
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  Fallback: find profile URL by searching member name
// // ─────────────────────────────────────────────────────────────────────────────
// async function findProfileByName(page, memberName, context) {
//   const searchPage = await context.newPage();
//   try {
//     await searchPage.goto(cfg.SEARCH_URL, {
//       waitUntil: 'domcontentloaded',
//       timeout: cfg.NAV_TIMEOUT,
//     });
//     await searchPage.waitForTimeout(3000);

//     const searchInput = searchPage.locator(
//       'input[placeholder*="Search"], input.MuiInputBase-input'
//     ).first();
//     const visible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);
//     if (!visible) return null;

//     await searchInput.fill(memberName);
//     await searchPage.waitForTimeout(2000);
//     await searchPage.getByRole('button', { name: 'Search Members' }).click();
//     await searchPage.waitForTimeout(3000);

//     // Find anchor by exact innerText — safe for all special characters
//     const allAnchors = searchPage.locator('a');
//     const count      = await allAnchors.count();
//     let href         = null;

//     for (let i = 0; i < count; i++) {
//       const txt = (await allAnchors.nth(i).innerText().catch(() => '')).trim();
//       if (txt === memberName.trim()) {
//         href = await allAnchors.nth(i).getAttribute('href').catch(() => null);
//         break;
//       }
//     }

//     if (!href) return null;
//     return href.startsWith('http') ? href : `https://www.bniconnectglobal.com${href}`;

//   } catch (err) {
//     console.error('[Fallback] Failed:', err.message);
//     return null;
//   } finally {
//     await searchPage.close().catch(() => {});
//   }
// }

// main().catch(err => { console.error(err); process.exit(1); });









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
  console.log('  BNI BOT  –  Multi-Category Edition');
  console.log('═══════════════════════════════════════════\n');

  // ── Step 1: Read Category_Country.xlsx ───────────────────────────────────
  console.log('[Main] Reading Category_Country.xlsx...');
  const countryRows = await excelHelper.readCategoryCountry(cfg.CATEGORY_COUNTRY_XLS);
  if (!countryRows.length) {
    console.error('No data in Category_Country.xlsx');
    process.exit(1);
  }

  for (const { country, categories } of countryRows) {
    console.log(`\n[Main] Country: ${country}`);
    console.log(`[Main] Categories (${categories.length}): ${categories.join(' | ')}`);

    // ── Step 2: Archive PREVIOUS output only if it exists with data ────────
    // FIX 4: Archive runs before createOutputFile so we move the PREVIOUS
    // filled file, not the new empty one we're about to create.
    const prevOutputPath = outputBuilder.getOutputPath(country);
    if (fs.existsSync(prevOutputPath)) {
      console.log('[Main] Previous output found — cleaning and archiving...');
      await fileUtils.cleanAndArchive();
    } else {
      console.log('[Main] No previous output — skipping archive.');
      fileUtils.ensureDir(cfg.PROFILE_DIR);
      fileUtils.ensureDir(cfg.MOVED_DIR);
    }

    // ── Step 3: Create fresh multi-sheet workbook ──────────────────────────
    await outputBuilder.createOutputFile(country, categories);

    // ── Launch browser ──────────────────────────────────────────────────────
    const launchOpts = { headless: cfg.HEADLESS, args: ['--start-maximized'] };
    if (cfg.BROWSER_CHANNEL) launchOpts.channel = cfg.BROWSER_CHANNEL;

    console.log('\n[Main] Launching browser...');
    const browser = await chromium.launch(launchOpts);
    const context = await browser.newContext({ viewport: null, ignoreHTTPSErrors: true });
    const page    = await context.newPage();
    page.setDefaultTimeout(cfg.ACTION_TIMEOUT);
    page.setDefaultNavigationTimeout(cfg.NAV_TIMEOUT);

    try {
      // ── Step 4: Login once ───────────────────────────────────────────────
      await loginMod.login(page);

      // ── Step 5: Loop every category ─────────────────────────────────────
      for (let catIdx = 0; catIdx < categories.length; catIdx++) {
        const categoryName = categories[catIdx];

        console.log('\n' + '─'.repeat(60));
        console.log(`[Category ${catIdx + 1}/${categories.length}] ${categoryName}`);
        console.log('─'.repeat(60));

        // ── 5a: Search + scroll + extract member list ──────────────────────
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

        // ── 5b: Write member list into correct sheet ───────────────────────
        await outputBuilder.appendMembersToSheet(country, categoryName, members);

        // ── 5c: Scrape each member's profile ──────────────────────────────
        let processed = 0, skipped = 0;

        for (let i = 0; i < members.length; i++) {
          const member     = members[i];
          const memberName = member.Name;
          const profileUrl = member.profileUrl || '';

          const done = await outputBuilder.isAlreadyDone(country, categoryName, memberName);
          if (done) {
            console.log(`  [Skip] Already DONE: "${memberName}"`);
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
                { email: 'No URL', phone: 'No URL', website: 'No URL' });
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

            if (page.url().includes('/login')) {
              console.log('  [Session] Expired — re-logging in...');
              await loginMod.login(page);
            }
          } catch (err) {
            console.error(`  [Error] "${memberName}": ${err.message}`);
            await outputBuilder.writeContactToRow(country, categoryName, memberName,
              { email: 'ERROR', phone: 'ERROR', website: 'ERROR' }).catch(() => {});
          }
        }

        console.log(`\n[Category] Done: ${categoryName}`);
        console.log(`  Processed: ${processed} | Skipped: ${skipped} | Total: ${members.length}`);
      }

      console.log('\n' + '═'.repeat(60));
      console.log(`✅  All ${categories.length} categories done for ${country}`);
      console.log(`    Output: ${outputBuilder.getOutputPath(country)}`);
      console.log('═'.repeat(60));

    } catch (err) {
      console.error('[Main] Fatal error:', err);
    } finally {
      await browser.close();
      console.log('[Main] Browser closed.');
    }
  }
}

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