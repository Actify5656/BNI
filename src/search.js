// import cfg from '../config.js';

// // PAD Flow - Main search:
// // 1. Click Filter button
// // 2. Fill Country autocomplete
// // 3. Fill Category autocomplete (exact match, not first-word partial)
// // 4. Click Search Members
// // 5. Click on the Category2 paragraph (to confirm category in results)
// // 6. Scroll the results container (not window) until no new members load
// // 7. Extract members with correct DOM traversal
// export async function runMemberSearch(page, countryName, categoryName, categoryName2) {
//   console.log(`[Search] Country="${countryName}" | Category="${categoryName}" | Category2="${categoryName2}"`);

//   await page.goto(cfg.SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
//   await page.waitForTimeout(3000);

//   // ── Navigate to Search People (PAD clicks 'Search People' paragraph) ──────
//   const searchPeopleLink = page.locator('p.MuiTypography-body1:has-text("Search People")').first();
//   const onSearch = page.url().includes('/search');
//   if (!onSearch) {
//     const vis = await searchPeopleLink.isVisible({ timeout: 5000 }).catch(() => false);
//     if (vis) {
//       await searchPeopleLink.click();
//       await page.waitForTimeout(2000);
//     }
//   }

//   // ── Click Filter button ───────────────────────────────────────────────────
//   console.log('[Search] Clicking Filter button...');
//   await page.getByRole('button', { name: 'Filter' }).click();
//   await page.waitForTimeout(2000);

//   // ── Set Country ───────────────────────────────────────────────────────────
//   console.log(`[Search] Setting Country = ${countryName}...`);

//   const countryInput = page.locator('input.MuiAutocomplete-input').first();
//   await countryInput.click();
//   await countryInput.fill(countryName.substring(0, 3).toLowerCase()); // e.g. 'ind' for India
//   await page.waitForTimeout(1500);

//   const countryOption = page.locator(`li[role="option"]:has-text("${countryName}")`).first();
//   const countryOptionVis = await countryOption.isVisible({ timeout: 5000 }).catch(() => false);
//   if (countryOptionVis) {
//     await countryOption.click();
//   } else {
//     await page.keyboard.press('ArrowDown'); // ArrowDown = first item (ArrowUp = last item — wrong)
//     await page.keyboard.press('Enter');
//   }
//   await page.waitForTimeout(1000);

//   // ── Set Category ──────────────────────────────────────────────────────────
//   // FIX: typing only the first word (e.g. "food") matches multiple categories like
//   // "Food & Beverage Caterer" AND "Manufacturing > Food Products", then ArrowUp
//   // picked the LAST option (wrong). Now we type enough chars to uniquely narrow
//   // the dropdown, and use ArrowDown (first item) as the fallback.
//   console.log(`[Search] Setting Category = ${categoryName}...`);

//   const categoryInput = page.locator('input.MuiAutocomplete-input').nth(1);
//   await categoryInput.click();

//   // Type first 9 chars — enough to uniquely identify most categories
//   // e.g. "Food & Be" only matches "Food & Beverage Caterer", not "Manufacturing > Food Products"
//   const partial = categoryName.length > 9 ? categoryName.substring(0, 9) : categoryName;
//   await categoryInput.fill(partial);
//   await page.waitForTimeout(2000);

//   // Attempt 1: find exact matching option in dropdown
//   const catOption = page.locator('li[role="option"]').filter({ hasText: categoryName }).first();
//   const catOptionVis = await catOption.isVisible({ timeout: 8000 }).catch(() => false);

//   if (catOptionVis) {
//     await catOption.click();
//     console.log(`[Search] ✓ Category selected: "${categoryName}"`);
//   } else {
//     // Attempt 2: type the full name char-by-char to force the dropdown to narrow further
//     await categoryInput.fill('');
//     await categoryInput.type(categoryName, { delay: 60 });
//     await page.waitForTimeout(2000);

//     const catOption2 = page.locator('li[role="option"]').filter({ hasText: categoryName }).first();
//     const vis2 = await catOption2.isVisible({ timeout: 5000 }).catch(() => false);
//     if (vis2) {
//       await catOption2.click();
//       console.log(`[Search] ✓ Category selected (retry): "${categoryName}"`);
//     } else {
//       // Last resort: ArrowDown = first item in list (NOT ArrowUp which wraps to last item)
//       await page.keyboard.press('ArrowDown');
//       await page.keyboard.press('Enter');
//       console.log('[Search] ⚠ Category selected via ArrowDown fallback');
//     }
//   }
//   await page.waitForTimeout(1000);

//   // ── Click Search Members ──────────────────────────────────────────────────
//   console.log('[Search] Clicking Search Members...');
//   await page.getByRole('button', { name: 'Search Members' }).click();
//   await page.waitForTimeout(3000);

//   // ── Click Category2 paragraph in results (PAD does this to confirm) ───────
//   if (categoryName2) {
//     console.log(`[Search] Clicking category2 result: "${categoryName2}"...`);
//     try {
//       const cat2Para = page.locator(`p:has-text("${categoryName2}")`).first();
//       const cat2Vis = await cat2Para.isVisible({ timeout: 8000 }).catch(() => false);
//       if (cat2Vis) {
//         await cat2Para.click();
//         await page.waitForTimeout(1500);
//       }
//     } catch (e) {
//       console.warn('[Search] Category2 click failed (may not be needed):', e.message);
//     }
//   }

//   // ── Wait for Search Results ───────────────────────────────────────────────
//   try {
//     await page.waitForSelector('text=Search Results', { timeout: 20000 });
//   } catch {
//     console.warn('[Search] "Search Results" heading not found, continuing...');
//   }
//   await page.waitForTimeout(2000);

//   // ── Scroll to load all lazy results ──────────────────────────────────────
//   // FIX: BNI is a fixed-layout React app — results live in a scrollable DIV, not
//   // the window/body. window.scrollTo and pressing End both did nothing. We walk
//   // up from the first member link to find the actual scrollable container.
//   console.log('[Search] Scrolling results container to load all members...');
//   let previousCount = 0;

//   for (let attempt = 0; attempt < 40; attempt++) {
//     await page.evaluate(() => {
//       const memberLink = document.querySelector('a[href*="networkHome"], a[href*="userId"]');
//       if (memberLink) {
//         let el = memberLink.parentElement;
//         while (el && el !== document.body) {
//           const style = window.getComputedStyle(el);
//           const scrollable = style.overflow === 'auto'  || style.overflow === 'scroll' ||
//                              style.overflowY === 'auto' || style.overflowY === 'scroll';
//           if (scrollable && el.scrollHeight > el.clientHeight + 50) {
//             el.scrollTop = el.scrollHeight; // scroll the real results container
//             return;
//           }
//           el = el.parentElement;
//         }
//       }
//       // Fallback if no scrollable container found
//       window.scrollTo(0, document.body.scrollHeight);
//     });

//     await page.waitForTimeout(900);

//    const currentCount = await page.evaluate(() =>
//   document.querySelectorAll(
//     'a[href*="networkHome"], a[href*="userId"], a[href*="/web/member"], a[href*="uuId"]'
//   ).length
// );

//     console.log(`[Search] Scroll ${attempt + 1}: ${currentCount} members visible`);

//     if (currentCount === previousCount && attempt >= 3) {
//       console.log('[Search] No new results — scroll complete.');
//       break;
//     }
//     previousCount = currentCount;
//   }
//   await page.waitForTimeout(1500);

//   // ── Extract all members ───────────────────────────────────────────────────
//   const members = await extractMembersWithPADLogic(page);
//   console.log(`[Search] Extracted ${members.length} members.`);
//   return members;
// }

// async function extractMembersWithPADLogic(page) {
//   const BASE = 'https://www.bniconnectglobal.com';

//   return await page.evaluate((base) => {
//     const results = [];
//     const seen    = new Set();

//     // Collect all profile anchors, deduplicated by href


// const rawAnchors = [
//   ...document.querySelectorAll('a[href*="networkHome"]'),   // old numeric format
//   ...document.querySelectorAll('a[href*="userId"]'),         // old numeric format
//   ...document.querySelectorAll('a[href*="/web/member"]'),    // new UUID format
//   ...document.querySelectorAll('a[href*="uuId"]'),           // new UUID format (fallback)
// ];


//     const seenHrefs  = new Set();
//     const allAnchors = [];
//     for (const a of rawAnchors) {
//       const h = a.getAttribute('href') || '';
//       if (h && !seenHrefs.has(h)) { seenHrefs.add(h); allAnchors.push(a); }
//     }

//     for (const anchor of allAnchors) {
//       const name = anchor.innerText?.trim();
//       if (!name || seen.has(name)) continue;

//       const href       = anchor.getAttribute('href') || '';
//       const profileUrl = href.startsWith('http') ? href : base + href;

//       // ── Find the correct row element ──────────────────────────────────────
//       // FIX: the old code walked up blindly to any div with ≥3 children, which
//       // overshot to a container holding ALL result rows. cols[1] then captured
//       // every other member's name concatenated into the Chapter field.
//       //
//       // Correct approach: walk up until we find a div where:
//       //   • it has 4–7 direct DIV children  (the 5 columns + possible extras)
//       //   • its FIRST div child contains our anchor  (Name is always column 0)
//       // Only the actual member row satisfies both conditions simultaneously.
//       let row     = null;
//       let current = anchor;

//       while (current && current !== document.body) {
//         const parent = current.parentElement;
//         if (!parent || parent === document.body) break;

//         const directDivs = [...parent.children].filter(c => c.tagName === 'DIV');

//         if (directDivs.length >= 4 && directDivs.length <= 7) {
//           if (directDivs[0].contains(anchor)) { // anchor must be in the FIRST column
//             row = parent;
//             break;
//           }
//         }
//         current = parent;
//       }

//       if (!row) continue;

//       seen.add(name);
//       const cols = [...row.children].filter(c => c.tagName === 'DIV');

//       results.push({
//         Name:                   name,
//         Chapter:                cols[1]?.innerText?.trim() || '',
//         Company:                cols[2]?.innerText?.trim() || '',
//         City:                   cols[3]?.innerText?.trim() || '',
//         IndustryClassification: cols[4]?.innerText?.trim() || '',
//         profileUrl,
//       });
//     }

//     return results;
//   }, BASE);
// }














// // src/search.js
// import cfg from '../config.js';

// export async function runMemberSearch(page, countryName, categoryName) {
//   console.log(`[Search] Country="${countryName}"  Category="${categoryName}"`);

//   await page.goto(cfg.SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
//   await page.waitForTimeout(2000);

//   // ── Open filter panel ──────────────────────────────────────────────────
//   await page.getByRole('button', { name: 'Filter' }).click();
//   await page.waitForTimeout(1500);

//   // ── Country ────────────────────────────────────────────────────────────
//   console.log(`[Search] Setting Country = ${countryName}`);
//   await page.getByRole('combobox', { name: 'Select Country' }).click();
//   await page.getByRole('combobox', { name: 'Select Country' }).fill(countryName.trim().substring(0, 3).toLowerCase());
//   await page.waitForTimeout(800);
//   await page.getByRole('option', { name: countryName.trim() }).click();
//   await page.waitForTimeout(800);

//   // ── Category ───────────────────────────────────────────────────────────
//   // categoryName format: "Food & Beverage (Caterer)"
//   // BNI dropdown may show it as "Food & Beverage > Caterer" or "Caterer"
//   // We type the part inside parentheses as the search term for best match
//   console.log(`[Search] Setting Category = ${categoryName}`);
//   const searchTerm = extractSearchTerm(categoryName);
//   console.log(`[Search] Typing search term: "${searchTerm}"`);

//   await page.getByRole('combobox', { name: 'Search Category' }).click();
//   await page.getByRole('combobox', { name: 'Search Category' }).fill(searchTerm);
//   await page.waitForTimeout(1200);

//   // Try to click the matching option — try multiple text formats
//   const clicked = await clickCategoryOption(page, categoryName);
//   if (!clicked) {
//     console.warn(`[Search] Could not find category option for "${categoryName}" — trying Enter`);
//     await page.keyboard.press('ArrowDown');
//     await page.waitForTimeout(300);
//     await page.keyboard.press('Enter');
//   }
//   await page.waitForTimeout(800);

//   // ── Search Members ─────────────────────────────────────────────────────
//   await page.getByRole('button', { name: 'Search Members' }).click();
//   console.log('[Search] Waiting for results...');

//   await page.waitForSelector('text=Search Results', { timeout: 20_000 });
//   await page.waitForTimeout(2000);

//   // ── Scroll to load all lazy results ────────────────────────────────────
//   console.log('[Search] Scrolling to load all results...');
//   let prevCount = 0;
//   for (let i = 0; i < cfg.PAGE_DOWN_COUNT; i++) {
//     await page.keyboard.press('End');
//     await page.waitForTimeout(200);
//     if (i > 0 && i % 15 === 0) {
//       const cur = await page.locator('a').count();
//       console.log(`  Scroll pass ${i}: ~${cur} anchors`);
//       if (cur === prevCount && i > 20) { console.log('  Stable, stopping.'); break; }
//       prevCount = cur;
//     }
//   }
//   await page.waitForTimeout(1000);

//   // ── Extract members ────────────────────────────────────────────────────
//   const members = await extractMembersTable(page);
//   console.log(`[Search] Extracted ${members.length} members.`);
//   return members;
// }

// // Extract the keyword to type into the category search box
// // "Food & Beverage (Caterer)" → "Caterer"
// // "Food & Beverage (Coffee House/Shop)" → "Coffee"
// function extractSearchTerm(categoryName) {
//   const match = categoryName.match(/\(([^)]+)\)/);
//   if (match) {
//     return match[1].split('/')[0].split(' ')[0]; // first word inside parens
//   }
//   return categoryName.split(' ')[0];
// }

// // Try clicking the category dropdown option using multiple text formats
// async function clickCategoryOption(page, categoryName) {
//   // BNI shows categories in various formats in the dropdown:
//   // "Food & Beverage > Caterer"  or  "Caterer"  or  "Food & Beverage (Caterer)"
//   const candidates = [
//     categoryName,                                          // exact as-is
//     categoryName.replace(/\(([^)]+)\)/, '> $1'),          // "(Caterer)" → "> Caterer"
//     categoryName.replace(/.*\(([^)]+)\).*/, '$1'),        // just "Caterer"
//     categoryName.replace(/\s*\([^)]*\)/, ''),             // strip parens entirely
//   ];

//   for (const text of candidates) {
//     try {
//       const opt = page.getByRole('option', { name: text.trim() });
//       const count = await opt.count();
//       if (count > 0) {
//         await opt.first().click({ timeout: 3000 });
//         console.log(`[Search] Clicked option: "${text.trim()}"`);
//         return true;
//       }
//     } catch { /* try next */ }
//   }
//   return false;
// }

// async function extractMembersTable(page) {
//   const BASE = 'https://www.bniconnectglobal.com';

//   return await page.evaluate((base) => {
//     const results = [];
//     const seen    = new Set();

//     // Strategy 1: standard table rows
//     document.querySelectorAll('tr').forEach(row => {
//       const cells    = row.querySelectorAll('td');
//       if (cells.length < 4) return;
//       const nameLink = cells[0]?.querySelector('a') || row.querySelector('a');
//       if (!nameLink) return;
//       const name = nameLink.innerText.trim();
//       if (!name || seen.has(name)) return;
//       seen.add(name);
//       const href = nameLink.getAttribute('href') || '';
//       results.push({
//         Name:                   name,
//         Chapter:                cells[1]?.innerText.trim() || '',
//         Company:                cells[2]?.innerText.trim() || '',
//         City:                   cells[3]?.innerText.trim() || '',
//         IndustryClassification: cells[4]?.innerText.trim() || '',
//         profileUrl: href ? (href.startsWith('http') ? href : base + href) : '',
//       });
//     });

//     if (results.length > 0) return results;

//     // Strategy 2: find all member-like anchors and walk up to card container
//     document.querySelectorAll('a').forEach(anchor => {
//       const name = anchor.innerText.trim();
//       if (!name || name.length > 60 || name.split(' ').length < 1) return;
//       if (['Home','Search','Filter','Back','Sign In','Connect'].includes(name)) return;
//       if (seen.has(name)) return;

//       let container = anchor.parentElement;
//       for (let d = 0; d < 8; d++) {
//         if (!container) break;
//         if (container.innerText.split('\n').filter(l => l.trim()).length >= 3) break;
//         container = container.parentElement;
//       }
//       if (!container) return;

//       const lines = (container.innerText || '')
//         .split('\n').map(l => l.trim()).filter(l => l && l !== name);

//       const href = anchor.getAttribute('href') || '';
//       seen.add(name);
//       results.push({
//         Name:                   name,
//         Chapter:                lines[0] || '',
//         Company:                lines[1] || '',
//         City:                   lines[2] || '',
//         IndustryClassification: lines[3] || '',
//         profileUrl: href ? (href.startsWith('http') ? href : base + href) : '',
//       });
//     });

//     return results;
//   }, BASE);
// }










// src/search.js
import cfg from '../config.js';

export async function runMemberSearch(page, countryName, categoryName) {
  console.log(`[Search] Country="${countryName}"  Category="${categoryName}"`);

  await page.goto(cfg.SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
  await page.waitForTimeout(2000);

  // ── Open filter panel ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.waitForTimeout(1500);

  // ── Country ────────────────────────────────────────────────────────────
  console.log(`[Search] Setting Country = ${countryName}`);
  await page.getByRole('combobox', { name: 'Select Country' }).click();
  await page.getByRole('combobox', { name: 'Select Country' }).fill(
    countryName.trim().substring(0, 3).toLowerCase()
  );
  await page.waitForTimeout(800);
  await page.getByRole('option', { name: countryName.trim() }).click();
  await page.waitForTimeout(800);

  // ── Category ───────────────────────────────────────────────────────────
  console.log(`[Search] Setting Category = ${categoryName}`);
  const searchTerm = extractSearchTerm(categoryName);
  console.log(`[Search] Typing: "${searchTerm}"`);

  await page.getByRole('combobox', { name: 'Search Category' }).click();
  await page.getByRole('combobox', { name: 'Search Category' }).fill(searchTerm);
  await page.waitForTimeout(1200);

  const clicked = await clickCategoryOption(page, categoryName);
  if (!clicked) {
    console.warn(`[Search] Option not found for "${categoryName}" — pressing ArrowDown+Enter`);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(800);

  // ── Search Members ─────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Search Members' }).click();
  console.log('[Search] Waiting for results...');

  // Wait for "Search Results" heading — confirmed visible in screenshot
  await page.waitForSelector('text=Search Results', { timeout: 20_000 });
  await page.waitForTimeout(2000);

  // ── FIX 1: Scroll the RESULTS CONTAINER, not the page ─────────────────
  // BNI renders results in a scrollable inner div. The page body does not
  // scroll — only the results list div does. We must find and scroll it.
  await scrollResultsContainer(page);

  // ── Extract members ────────────────────────────────────────────────────
  const members = await extractMembersTable(page);
  console.log(`[Search] Extracted ${members.length} members.`);
  return members;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Scroll the actual results container
// Strategy: find the scrollable div that contains the result rows,
// then repeatedly scroll it via JS until no new rows appear
// ─────────────────────────────────────────────────────────────────────────────
async function scrollResultsContainer(page) {
  console.log('[Search] Scrolling results container...');

  // First, find the scrollable container that holds the member rows
  // We do this by finding the element that has scrollable overflow
  // and contains the "Search Results" section
  const scrolled = await page.evaluate(async () => {
    // Find all elements that are scrollable (overflow-y: auto/scroll)
    const allEls = document.querySelectorAll('*');
    let container = null;

    for (const el of allEls) {
      const style = window.getComputedStyle(el);
      const overflow = style.overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
        // Check if this element contains result rows (has multiple anchor tags)
        const anchors = el.querySelectorAll('a');
        if (anchors.length >= 3) {
          container = el;
          // Don't break — we want the INNERMOST scrollable container with results
        }
      }
    }

    if (!container) return false;

    // Scroll it to bottom repeatedly
    let lastScrollTop = -1;
    let stable = 0;
    for (let i = 0; i < 80; i++) {
      container.scrollTop += 800;
      await new Promise(r => setTimeout(r, 300));
      if (container.scrollTop === lastScrollTop) {
        stable++;
        if (stable >= 3) break; // truly at bottom
      } else {
        stable = 0;
      }
      lastScrollTop = container.scrollTop;
    }
    return true;
  });

  if (!scrolled) {
    // Fallback: try scrolling via mouse wheel on the results area
    console.log('[Search] Container scroll failed — using mouse wheel fallback...');
    try {
      // Click on the results area to focus it
      await page.locator('text=Search Results').scrollIntoViewIfNeeded();
      const box = await page.locator('text=Search Results').boundingBox();
      if (box) {
        // Scroll with mouse wheel at the center of results area
        for (let i = 0; i < cfg.PAGE_DOWN_COUNT; i++) {
          await page.mouse.wheel(0, 600);
          await page.waitForTimeout(200);
        }
      }
    } catch {
      // Last resort: keyboard
      await page.keyboard.press('Tab');
      for (let i = 0; i < cfg.PAGE_DOWN_COUNT; i++) {
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(150);
      }
    }
  }

  await page.waitForTimeout(1500);

  // Count what we got
  const count = await page.evaluate(() => document.querySelectorAll('tr td:first-child a, [role="row"] a').length);
  console.log(`[Search] After scroll: ~${count} member links visible`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2+3: Extract ONLY from the results table, filter out nav garbage
// ─────────────────────────────────────────────────────────────────────────────
async function extractMembersTable(page) {
  const BASE = 'https://www.bniconnectglobal.com';

  return await page.evaluate((base) => {
    const results = [];
    const seen    = new Set();

    // ── FIX 3: Only look inside the Search Results section ────────────────
    // Find the container that has "Search Results" as a heading
    // This scopes us away from the nav sidebar, header, footer etc.
    let searchSection = null;

    // Try to find the results section by its heading text
    const allHeadings = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,span');
    for (const el of allHeadings) {
      if (el.childElementCount === 0 && el.textContent.trim() === 'Search Results') {
        // Walk up to find the section container
        let parent = el.parentElement;
        for (let d = 0; d < 5; d++) {
          if (parent && parent.querySelectorAll('a').length >= 3) {
            searchSection = parent;
            break;
          }
          parent = parent?.parentElement;
        }
        if (searchSection) break;
      }
    }

    // If we found the section, scope to it; otherwise use whole body (with filters)
    const scope = searchSection || document.body;

    // ── Strategy 1: Standard HTML table rows ──────────────────────────────
    scope.querySelectorAll('tr').forEach(row => {
      const cells    = row.querySelectorAll('td');
      if (cells.length < 4) return;

      // FIX 5: Name link must be in the first td, skip avatar initials
      // The first td contains: [avatar img or initials] + [name anchor]
      const nameLink = cells[0].querySelector('a');
      if (!nameLink) return;

      const name = nameLink.innerText.trim();
      if (!name || seen.has(name)) return;

      // FIX 3: Filter out obvious nav items
      const NAV_WORDS = ['Help', 'Home', 'Search', 'Filter', 'Back', 'Sign In',
                         'Connect', 'My BNI', 'Dashboard', 'Settings'];
      if (NAV_WORDS.some(w => name.includes(w))) return;

      seen.add(name);

      const href = nameLink.getAttribute('href') || '';
      results.push({
        Name:                   name,
        Chapter:                cells[1]?.innerText.trim() || '',
        Company:                cells[2]?.innerText.trim() || '',
        City:                   cells[3]?.innerText.trim() || '',
        IndustryClassification: cells[4]?.innerText.trim() || '',
        profileUrl: href ? (href.startsWith('http') ? href : base + href) : '',
      });
    });

    if (results.length > 0) return results;

    // ── Strategy 2: MUI React rows (no <tr> — uses div-based layout) ─────
    // From the screenshot: each row has
    //   [avatar circle] [Name link] [Chapter text] [Company text] [City text] [Seat text] [+ button]
    // The name links are blue anchors. We find them and read siblings.

    scope.querySelectorAll('a').forEach(anchor => {
      const name = anchor.innerText.trim();
      if (!name || name.length > 80 || seen.has(name)) return;

      // FIX 3: Skip nav items
      const NAV_WORDS = ['Help', 'Home', 'Search', 'Filter', 'Back', 'Sign In',
                         'Connect', 'My BNI', 'Dashboard', 'Settings', 'Support',
                         'zendesk', 'BNI Connect'];
      if (NAV_WORDS.some(w => name.toLowerCase().includes(w.toLowerCase()))) return;

      // Must look like a person name: contains a letter, not just symbols/numbers
      if (!/[a-zA-Z]/.test(name)) return;

      // FIX 5: The anchor's parent row container should have 4+ text columns
      // Walk up to find a container that has multiple distinct text pieces
      let rowContainer = anchor.parentElement;
      for (let d = 0; d < 6; d++) {
        if (!rowContainer) break;
        // A result row will have the name + chapter + company + city + seat
        // That's at least 4 non-empty text pieces
        const directTexts = [...rowContainer.querySelectorAll('p, span, td')]
          .map(el => el.innerText.trim())
          .filter(t => t && t !== name && t.length > 1);

        if (directTexts.length >= 3) break;
        rowContainer = rowContainer.parentElement;
      }

      if (!rowContainer) return;

      // FIX 5: Extract column values carefully
      // Get all <p> or <td> children that are direct text nodes (not the name)
      const colEls = [...rowContainer.querySelectorAll('p, td')]
        .filter(el => {
          const txt = el.innerText.trim();
          return txt && txt !== name && txt.length > 0;
        });

      // Filter out avatar initials (typically 1-2 uppercase letters)
      const cols = colEls
        .map(el => el.innerText.trim())
        .filter(t => {
          // Skip avatar initials: 1-3 uppercase letters only, no spaces
          if (/^[A-Z]{1,3}$/.test(t)) return false;
          // Skip the "+" connect button text
          if (t === '+') return false;
          return true;
        });

      const href = anchor.getAttribute('href') || '';
      seen.add(name);

      results.push({
        Name:                   name,
        Chapter:                cols[0] || '',
        Company:                cols[1] || '',
        City:                   cols[2] || '',
        IndustryClassification: cols[3] || '',
        profileUrl: href ? (href.startsWith('http') ? href : base + href) : '',
      });
    });

    return results;
  }, BASE);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract keyword to type in category search box
// "Food & Beverage (Caterer)" → "Caterer"
// "Food & Beverage (Coffee House/Shop)" → "Coffee"
// ─────────────────────────────────────────────────────────────────────────────
function extractSearchTerm(categoryName) {
  const match = categoryName.match(/\(([^)]+)\)/);
  if (match) return match[1].split('/')[0].split(' ')[0];
  return categoryName.split(' ')[0];
}

// Try clicking category dropdown option in multiple text formats
async function clickCategoryOption(page, categoryName) {
  const candidates = [
    categoryName,
    categoryName.replace(/\(([^)]+)\)/, '> $1'),
    categoryName.replace(/.*\(([^)]+)\).*/, '$1'),
    categoryName.replace(/\s*\([^)]*\)/, '').trim(),
  ];

  for (const text of candidates) {
    try {
      const opt   = page.getByRole('option', { name: text.trim() });
      const count = await opt.count();
      if (count > 0) {
        await opt.first().click({ timeout: 3000 });
        console.log(`[Search] Selected option: "${text.trim()}"`);
        return true;
      }
    } catch { /* try next */ }
  }
  return false;
}