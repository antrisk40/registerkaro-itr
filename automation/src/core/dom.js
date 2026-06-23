export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const safeClick = async (locator, label) => {
  try { await locator.click({ timeout: 7000 }); }
  catch (e) { console.warn(`[Warning] safeClick failed for "${label}":`, e.message); }
};

export const safeFill = async (locator, value, label) => {
  try {
    await locator.fill(value, { timeout: 7000 });
  } catch (e) {
    console.warn(`[Warning] safeFill failed for "${label}":`, e.message);
  }
};

export const lockPageScroll = async (page) => {
  await page.evaluate(() => {
    window.__savedScrollY = window.scrollY;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  });
};

export const unlockPageScroll = async (page) => {
  await page.evaluate(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (typeof window.__savedScrollY === 'number') {
      window.scrollTo({ top: window.__savedScrollY, behavior: 'instant' });
    }
  });
};

export const blurActiveElement = async (page) => {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
};

export const dispatchInputEvents = async (locator) => {
  await locator.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  });
};

export const getErrorBanner = async (page) => {
  const selectors = [
    '.errorMsg', '.error-message', '.alert-danger',
    'p.error', 'span.error', '.mat-mdc-snack-bar-label',
    'div[class*="error"]', 'span[class*="error"]',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 })) {
        return (await el.innerText()).trim();
      }
    } catch { /* ignore */ }
  }
  return null;
};
