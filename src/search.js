import cfg from '../config.js';

// PAD Flow - Main search:
// 1. Click Filter button
// 2. Fill Country autocomplete
// 3. Fill Category autocomplete (exact match, not first-word partial)
// 4. Click Search Members
// 5. Click on the Category2 paragraph (to confirm category in results)
// 6. Scroll the results container (not window) until no new members load
// 7. Extract members with correct DOM traversal
export async function runMemberSearch(page, countryName, categoryName, categoryName2) {
  console.log(`[Search] Country="${countryName}" | Category="${categoryName}" | Category2="${categoryName2}"`);

  await page.goto(cfg.SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: cfg.NAV_TIMEOUT });
  await page.waitForTimeout(3000);

  // ── Navigate to Search People (PAD clicks 'Search People' paragraph) ──────
  const searchPeopleLink = page.locator('p.MuiTypography-body1:has-text("Search People")').first();
  const onSearch = page.url().includes('/search');
  if (!onSearch) {
    const vis = await searchPeopleLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (vis) {
      await searchPeopleLink.click();
      await page.waitForTimeout(2000);
    }
  }

  // ── Click Filter button ───────────────────────────────────────────────────
  console.log('[Search] Clicking Filter button...');
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.waitForTimeout(2000);

  // ── Set Country ───────────────────────────────────────────────────────────
  console.log(`[Search] Setting Country = ${countryName}...`);

  const countryInput = page.locator('input.MuiAutocomplete-input').first();
  await countryInput.click();
  await countryInput.fill(countryName.substring(0, 3).toLowerCase()); // e.g. 'ind' for India
  await page.waitForTimeout(1500);

  const countryOption = page.locator(`li[role="option"]:has-text("${countryName}")`).first();
  const countryOptionVis = await countryOption.isVisible({ timeout: 5000 }).catch(() => false);
  if (countryOptionVis) {
    await countryOption.click();
  } else {
    await page.keyboard.press('ArrowDown'); // ArrowDown = first item (ArrowUp = last item — wrong)
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1000);

  // ── Set Category ──────────────────────────────────────────────────────────
  // FIX: typing only the first word (e.g. "food") matches multiple categories like
  // "Food & Beverage Caterer" AND "Manufacturing > Food Products", then ArrowUp
  // picked the LAST option (wrong). Now we type enough chars to uniquely narrow
  // the dropdown, and use ArrowDown (first item) as the fallback.
  console.log(`[Search] Setting Category = ${categoryName}...`);

  const categoryInput = page.locator('input.MuiAutocomplete-input').nth(1);
  await categoryInput.click();

  // Type first 9 chars — enough to uniquely identify most categories
  // e.g. "Food & Be" only matches "Food & Beverage Caterer", not "Manufacturing > Food Products"
  const partial = categoryName.length > 9 ? categoryName.substring(0, 9) : categoryName;
  await categoryInput.fill(partial);
  await page.waitForTimeout(2000);

  // Attempt 1: find exact matching option in dropdown
  const catOption = page.locator('li[role="option"]').filter({ hasText: categoryName }).first();
  const catOptionVis = await catOption.isVisible({ timeout: 8000 }).catch(() => false);

  if (catOptionVis) {
    await catOption.click();
    console.log(`[Search] ✓ Category selected: "${categoryName}"`);
  } else {
    // Attempt 2: type the full name char-by-char to force the dropdown to narrow further
    await categoryInput.fill('');
    await categoryInput.type(categoryName, { delay: 60 });
    await page.waitForTimeout(2000);

    const catOption2 = page.locator('li[role="option"]').filter({ hasText: categoryName }).first();
    const vis2 = await catOption2.isVisible({ timeout: 5000 }).catch(() => false);
    if (vis2) {
      await catOption2.click();
      console.log(`[Search] ✓ Category selected (retry): "${categoryName}"`);
    } else {
      // Last resort: ArrowDown = first item in list (NOT ArrowUp which wraps to last item)
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      console.log('[Search] ⚠ Category selected via ArrowDown fallback');
    }
  }
  await page.waitForTimeout(1000);

  // ── Click Search Members ──────────────────────────────────────────────────
  console.log('[Search] Clicking Search Members...');
  await page.getByRole('button', { name: 'Search Members' }).click();
  await page.waitForTimeout(3000);

  // ── Click Category2 paragraph in results (PAD does this to confirm) ───────
  if (categoryName2) {
    console.log(`[Search] Clicking category2 result: "${categoryName2}"...`);
    try {
      const cat2Para = page.locator(`p:has-text("${categoryName2}")`).first();
      const cat2Vis = await cat2Para.isVisible({ timeout: 8000 }).catch(() => false);
      if (cat2Vis) {
        await cat2Para.click();
        await page.waitForTimeout(1500);
      }
    } catch (e) {
      console.warn('[Search] Category2 click failed (may not be needed):', e.message);
    }
  }

  // ── Wait for Search Results ───────────────────────────────────────────────
  try {
    await page.waitForSelector('text=Search Results', { timeout: 20000 });
  } catch {
    console.warn('[Search] "Search Results" heading not found, continuing...');
  }
  await page.waitForTimeout(2000);

  // ── Scroll to load all lazy results ──────────────────────────────────────
  // FIX: BNI is a fixed-layout React app — results live in a scrollable DIV, not
  // the window/body. window.scrollTo and pressing End both did nothing. We walk
  // up from the first member link to find the actual scrollable container.
  console.log('[Search] Scrolling results container to load all members...');
  let previousCount = 0;

  for (let attempt = 0; attempt < 40; attempt++) {
    await page.evaluate(() => {
      const memberLink = document.querySelector('a[href*="networkHome"], a[href*="userId"]');
      if (memberLink) {
        let el = memberLink.parentElement;
        while (el && el !== document.body) {
          const style = window.getComputedStyle(el);
          const scrollable = style.overflow === 'auto'  || style.overflow === 'scroll' ||
                             style.overflowY === 'auto' || style.overflowY === 'scroll';
          if (scrollable && el.scrollHeight > el.clientHeight + 50) {
            el.scrollTop = el.scrollHeight; // scroll the real results container
            return;
          }
          el = el.parentElement;
        }
      }
      // Fallback if no scrollable container found
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.waitForTimeout(900);

   const currentCount = await page.evaluate(() =>
  document.querySelectorAll(
    'a[href*="networkHome"], a[href*="userId"], a[href*="/web/member"], a[href*="uuId"]'
  ).length
);

    console.log(`[Search] Scroll ${attempt + 1}: ${currentCount} members visible`);

    if (currentCount === previousCount && attempt >= 3) {
      console.log('[Search] No new results — scroll complete.');
      break;
    }
    previousCount = currentCount;
  }
  await page.waitForTimeout(1500);

  // ── Extract all members ───────────────────────────────────────────────────
  const members = await extractMembersWithPADLogic(page);
  console.log(`[Search] Extracted ${members.length} members.`);
  return members;
}

async function extractMembersWithPADLogic(page) {
  const BASE = 'https://www.bniconnectglobal.com';

  return await page.evaluate((base) => {
    const results = [];
    const seen    = new Set();

    // Collect all profile anchors, deduplicated by href


const rawAnchors = [
  ...document.querySelectorAll('a[href*="networkHome"]'),   // old numeric format
  ...document.querySelectorAll('a[href*="userId"]'),         // old numeric format
  ...document.querySelectorAll('a[href*="/web/member"]'),    // new UUID format
  ...document.querySelectorAll('a[href*="uuId"]'),           // new UUID format (fallback)
];


    const seenHrefs  = new Set();
    const allAnchors = [];
    for (const a of rawAnchors) {
      const h = a.getAttribute('href') || '';
      if (h && !seenHrefs.has(h)) { seenHrefs.add(h); allAnchors.push(a); }
    }

    for (const anchor of allAnchors) {
      const name = anchor.innerText?.trim();
      if (!name || seen.has(name)) continue;

      const href       = anchor.getAttribute('href') || '';
      const profileUrl = href.startsWith('http') ? href : base + href;

      // ── Find the correct row element ──────────────────────────────────────
      // FIX: the old code walked up blindly to any div with ≥3 children, which
      // overshot to a container holding ALL result rows. cols[1] then captured
      // every other member's name concatenated into the Chapter field.
      //
      // Correct approach: walk up until we find a div where:
      //   • it has 4–7 direct DIV children  (the 5 columns + possible extras)
      //   • its FIRST div child contains our anchor  (Name is always column 0)
      // Only the actual member row satisfies both conditions simultaneously.
      let row     = null;
      let current = anchor;

      while (current && current !== document.body) {
        const parent = current.parentElement;
        if (!parent || parent === document.body) break;

        const directDivs = [...parent.children].filter(c => c.tagName === 'DIV');

        if (directDivs.length >= 4 && directDivs.length <= 7) {
          if (directDivs[0].contains(anchor)) { // anchor must be in the FIRST column
            row = parent;
            break;
          }
        }
        current = parent;
      }

      if (!row) continue;

      seen.add(name);
      const cols = [...row.children].filter(c => c.tagName === 'DIV');

      results.push({
        Name:                   name,
        Chapter:                cols[1]?.innerText?.trim() || '',
        Company:                cols[2]?.innerText?.trim() || '',
        City:                   cols[3]?.innerText?.trim() || '',
        IndustryClassification: cols[4]?.innerText?.trim() || '',
        profileUrl,
      });
    }

    return results;
  }, BASE);
}