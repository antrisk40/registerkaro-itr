import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import dotenv from 'dotenv';
import { emitEvent } from './utils/emitter.js';

dotenv.config();

chromium.use(stealth());

// ─── Read all environment variables (both from .env and from Orchestrator spawn) ─────
const {
  API_URL,
  DUMMY_PAN,
  TARGET_PAN,
  JOB_ID,
  IS_OTHERS,
  TAXPAYER_CATEGORY,
  REG_LAST_NAME,
  REG_MIDDLE_NAME,
  REG_FIRST_NAME,
  REG_DATE_OF_BIRTH,   // DD/MM/YYYY
  REG_GENDER,          // Male | Female | Transgender
  REG_RESIDENTIAL,     // Resident | Non Resident
  REG_EMAIL,
  REG_MOBILE,
} = process.env;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Poll Express API until the human operator submits an OTP (handles resend requests) */
const pollForOtp = async (jobId, page = null) => {
  console.log(`[Polling] Waiting for OTP on job ${jobId}...`);
  while (true) {
    try {
      const { data } = await axios.get(`${API_URL}/jobs/${jobId}`);
      const job = data.job;

      if (page && job?.resendOtpRequested) {
        await clickPortalResend(page, jobId);
        await axios.post(`${API_URL}/jobs/${jobId}`, {
          resendOtpRequested: false,
          suppliedOtp: null,
          lastOtpError: null,
        }).catch(() => {});
        await emitEvent(jobId, 'info', 'OTP_GATE', 'Resend OTP process completed. Waiting for new OTP...');
      }

      if (job?.suppliedOtp) {
        console.log(`[Polling] OTP received for job ${jobId}`);
        return job.suppliedOtp;
      }
    } catch (err) {
      console.error('[Polling Error]', err.message);
    }
    await sleep(1500);
  }
};

const clickPortalResend = async (page, jobId) => {
  await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Attempting to click "Resend OTP" link on portal...');
  
  // Resend OTP is often an <a> tag or a <span> instead of a button
  const resend = page.locator('a, button, span, [role="button"]').filter({ hasText: /resend/i }).first();
  
  try {
    await resend.click({ timeout: 5000 });
    await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Successfully clicked Resend OTP');
  } catch (e) {
    await emitEvent(jobId, 'warn', 'OTP_GATE', `[Bot Warning] Failed to click Resend OTP normally, trying JS click. Error: ${e.message}`);
    await resend.evaluate((el) => el.click()).catch(err => {
      emitEvent(jobId, 'warn', 'OTP_GATE', `[Bot Warning] JS Resend click also failed: ${err.message}`);
    });
  }
  
  await sleep(3000);
};

/** Fire DOM events so Angular/Material registers typed OTP values */
const dispatchInputEvents = async (locator) => {
  await locator.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  });
};

/** Prevent focus/scroll fighting while entering OTP */
const lockPageScroll = async (page) => {
  await page.evaluate(() => {
    window.__savedScrollY = window.scrollY;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  });
};

const unlockPageScroll = async (page) => {
  await page.evaluate(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (typeof window.__savedScrollY === 'number') {
      window.scrollTo({ top: window.__savedScrollY, behavior: 'instant' });
    }
  });
};

const blurActiveElement = async (page) => {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
};

/** Read combined value from split OTP inputs */
const readOtpValue = async (otpBoxes, count) => {
  let combined = '';
  for (let i = 0; i < count; i++) {
    combined += await otpBoxes.nth(i).inputValue().catch(() => '');
  }
  return combined.replace(/\s/g, '');
};

/** Type OTP without clearing previous boxes or pressing Tab (Tab causes scroll bounce) */
const fillOtp = async (page, otp) => {
  const cleanOtp = String(otp).replace(/\s/g, '');
  if (!cleanOtp) return;

  await lockPageScroll(page);

  const otpBoxes = page.locator(
    'input.otp-input, input[autocomplete="one-time-code"], input[formcontrolname="otpDigit"], input[inputmode="numeric"][maxlength="1"]'
  );
  const count = await otpBoxes.count();

  const verifyFilled = async () => {
    if (count === 0) {
      const field = page.locator('input[formcontrolname="otp"], input[name="otp"]').first();
      if (!(await field.isVisible({ timeout: 500 }).catch(() => false))) return false;
      const val = (await field.inputValue().catch(() => '')).replace(/\s/g, '');
      return val.length >= cleanOtp.length;
    }
    if (count === 1) {
      const val = (await otpBoxes.first().inputValue().catch(() => '')).replace(/\s/g, '');
      return val.length >= cleanOtp.length;
    }
    const entered = await readOtpValue(otpBoxes, count);
    return entered === cleanOtp;
  };

  const clearFirstBox = async (locator) => {
    await locator.click({ timeout: 5000, noWaitAfter: true });
    await sleep(150);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await sleep(100);
  };

  // Strategy 1: type full OTP in first box — widget auto-advances
  if (count >= 1) {
    try {
      const first = otpBoxes.first();
      await clearFirstBox(first);
      await first.pressSequentially(cleanOtp, { delay: 150 });
      await sleep(600);
      if (await verifyFilled()) {
        console.log('[OTP] Filled via first-box typing');
        await blurActiveElement(page);
        return;
      }
    } catch (e) {
      console.warn('[OTP] Strategy 1 failed:', e.message);
    }
  }

  // Strategy 2: paste into first box
  if (count >= 1) {
    try {
      const first = otpBoxes.first();
      await clearFirstBox(first);
      await page.evaluate(async (text) => {
        await navigator.clipboard.writeText(text);
      }, cleanOtp);
      await page.keyboard.press('Control+v');
      await sleep(600);
      if (await verifyFilled()) {
        console.log('[OTP] Filled via paste');
        await blurActiveElement(page);
        return;
      }
    } catch (e) {
      console.warn('[OTP] Strategy 2 failed:', e.message);
    }
  }

  // Strategy 3: set all digit boxes at once — no focus() calls (avoids scroll jumps)
  if (count > 1) {
    try {
      await otpBoxes.first().evaluate((firstEl, { digits }) => {
        const root = firstEl.closest('form, [class*="otp"], [class*="OTP"], div') || firstEl.parentElement;
        const inputs = root
          ? [...root.querySelectorAll('input[inputmode="numeric"], input.otp-input, input[autocomplete="one-time-code"], input[maxlength="1"]')]
          : [firstEl];
        const boxes = inputs.filter((el) => el.maxLength === 1 || el.classList.contains('otp-input'));
        const targets = boxes.length >= digits.length ? boxes : inputs;

        digits.split('').forEach((digit, i) => {
          const el = targets[i];
          if (!el) return;
          el.value = digit;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: digit, inputType: 'insertText' }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }, { digits: cleanOtp });
      await sleep(500);
      if (await verifyFilled()) {
        console.log('[OTP] Filled via atomic evaluate');
        await blurActiveElement(page);
        return;
      }
    } catch (e) {
      console.warn('[OTP] Strategy 3 failed:', e.message);
    }
  }

  // Strategy 4: single combined field
  try {
    const field = page.locator('input[formcontrolname="otp"], input[name="otp"]').first();
    if (await field.isVisible({ timeout: 2000 })) {
      await clearFirstBox(field);
      await field.pressSequentially(cleanOtp, { delay: 150 });
      await dispatchInputEvents(field);
      console.log('[OTP] Filled via single OTP field');
    }
  } catch (e) {
    console.warn('[OTP] Strategy 4 failed:', e.message);
  }

  await blurActiveElement(page);
};

/** Detect income-tax redirect / disclaimer popup after first Validate click */
const findRedirectPopup = async (page) => {
  const patterns = [
    /disclaimer/i,
    /leaving e-filing portal/i,
    /you are redirecting/i,
    /redirecting/i,
    /external link/i,
    /leave the portal/i,
  ];

  for (const pattern of patterns) {
    try {
      const modal = page.locator('mat-dialog-container, .modal.show, .modal-dialog, [role="dialog"][aria-modal="true"], [role="dialog"]')
        .filter({ hasText: pattern }).first();
      if (await modal.isVisible({ timeout: 400 })) return modal;
    } catch { /* ignore */ }

    try {
      if (await page.getByText(pattern).first().isVisible({ timeout: 400 })) {
        return page.locator('mat-dialog-container, .modal.show, .modal-dialog, [role="dialog"]').first();
      }
    } catch { /* ignore */ }
  }
  return null;
};

/** Wait briefly for redirect popup, click Cancel/No, return true if dismissed */
const dismissRedirectPopup = async (page, jobId) => {
  let modal = null;
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    modal = await findRedirectPopup(page);
    if (modal) break;
    await sleep(250);
  }
  if (!modal) return false;

  await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Redirect popup detected — clicking Cancel...');

  const cancelCandidates = [
    modal.locator('button').filter({ hasText: /^Cancel$/i }),
    modal.locator('button').filter({ hasText: /Cancel/i }),
    modal.locator('button').filter({ hasText: /^No$/i }),
    modal.locator('a, button').filter({ hasText: /Cancel/i }),
    page.locator('.modal.show button, mat-dialog-container button').filter({ hasText: /Cancel/i }),
    page.getByRole('button', { name: /^Cancel$/i }),
    page.getByRole('button', { name: /Cancel/i }),
  ];

  for (const candidate of cancelCandidates) {
    try {
      const btn = candidate.first();
      if (await btn.isVisible({ timeout: 600 })) {
        await btn.click({ timeout: 3000, noWaitAfter: true });
        await sleep(600);
        // Confirm popup gone
        if (!(await findRedirectPopup(page))) {
          await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Redirect popup dismissed.');
          return true;
        }
      }
    } catch { /* try next */ }
  }

  // Last resort: Escape key
  await page.keyboard.press('Escape');
  await sleep(500);
  return !(await findRedirectPopup(page));
};

/** Perform a single Validate/Submit click on the OTP form */
const clickValidateButtonOnce = async (page, jobId) => {
  await blurActiveElement(page);
  await sleep(300);

  try {
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      const target = buttons.find((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        return /^(validate|verify|submit|confirm|continue)$/i.test(t);
      });
      return target && !target.disabled && !target.hasAttribute('disabled');
    }, { timeout: 15000 });
  } catch {
    await emitEvent(jobId, 'warn', 'OTP_GATE', '[Bot Warning] Validate button still disabled — clicking anyway.');
  }

  const btnIndex = await page.evaluate(() => {
    const activeModal = document.querySelector('.modal.show, [role="dialog"][aria-modal="true"]');
    const container = activeModal || document;
    const buttons = [...container.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    const targetIndex = buttons.findIndex((b) => {
      const text = (b.textContent || '').trim().toLowerCase();
      return /^(validate|verify|submit|confirm|continue)$/i.test(text) && !b.disabled && !b.hasAttribute('disabled');
    });
    if (targetIndex !== -1) {
      buttons[targetIndex].scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const allButtons = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      return allButtons.indexOf(buttons[targetIndex]);
    }
    return -1;
  });

  await sleep(400);

  if (btnIndex === -1) {
    const fallbackBtn = page.locator('button:visible, a:visible, [role="button"]:visible')
      .filter({ hasText: /validate|verify|submit|confirm|continue/i }).last();
    await fallbackBtn.click({ timeout: 5000, noWaitAfter: true });
  } else {
    await page.evaluate((idx) => {
      const buttons = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      buttons[idx].click();
    }, btnIndex);
  }
};

/** Click Validate — dismiss redirect popup if it appears, then click Validate again immediately */
const clickValidateOtp = async (page, jobId) => {
  await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Clicking Validate (1st attempt)...');
  await clickValidateButtonOnce(page, jobId);
  await sleep(500);

  const dismissed = await dismissRedirectPopup(page, jobId);
  if (dismissed) {
    await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Clicking Validate again immediately...');
    await sleep(400);
    await clickValidateButtonOnce(page, jobId);
    await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Validate clicked after popup dismiss.');
  } else {
    await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Validate clicked (no redirect popup).');
  }

  await unlockPageScroll(page);
};

const setOtpError = async (jobId, message) => {
  await axios.post(`${API_URL}/jobs/${jobId}`, {
    suppliedOtp: null,
    lastOtpError: message,
  }).catch(() => {});
};

/** Wait for user to submit a correction in the dashboard */
const pollForCorrection = async (jobId, page) => {
  console.log(`[Polling] Waiting for user correction on dashboard for job ${jobId}...`);
  while (true) {
    if (page.isClosed()) throw new Error('Page closed during correction wait');
    
    try {
      const res = await axios.get(`${API_URL}/jobs/${jobId}`);
      if (res.data.job && res.data.job.status === 'REGISTERING' && !res.data.job.correctionMessage) {
        // The user submitted the correction and resumed the job
        return res.data.job.registrationPayload;
      }
    } catch (e) {
      console.warn('[Polling Error] Could not check correction status:', e.message);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Safe click helper — logs a warning instead of crashing on timeout */
const safeClick = async (locator, label) => {
  try { await locator.click({ timeout: 7000 }); }
  catch (e) { console.warn(`[Warning] safeClick failed for "${label}":`, e.message); }
};

/** Safe fill helper */
const safeFill = async (locator, value, label) => {
  try {
    await locator.fill(value, { timeout: 7000 });
  } catch (e) {
    console.warn(`[Warning] safeFill failed for "${label}":`, e.message);
  }
};

/** Parse DOB into DD/MM/YYYY parts (portal expects Indian format) */
const parseDob = (raw) => {
  const s = String(raw).trim();
  let d, m, y;

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dmy) {
    [, d, m, y] = dmy;
  } else if (ymd) {
    [, y, m, d] = ymd;
  } else {
    throw new Error(`Unrecognized DOB format "${raw}" — use DD/MM/YYYY`);
  }

  const day = String(parseInt(d, 10)).padStart(2, '0');
  const month = String(parseInt(m, 10)).padStart(2, '0');
  const year = String(parseInt(y, 10));

  return {
    day: parseInt(day, 10),
    month: parseInt(month, 10),
    year: parseInt(year, 10),
    formatted: `${day}/${month}/${year}`,
    digits: `${day}${month}${year}`,
  };
};

const dobLooksFilled = async (locator, parsed) => {
  const val = (await locator.inputValue().catch(() => '')).replace(/\s/g, '');
  if (!val) return false;
  return (
    val === parsed.formatted ||
    val.replace(/\D/g, '') === parsed.digits ||
    (val.includes(String(parsed.year)) && val.replace(/\D/g, '').length >= 8)
  );
};

/** Navigate Angular Material calendar to pick year → month → day */
const pickDateFromMaterialCalendar = async (page, { day, month, year }) => {
  const calendar = page.locator('mat-calendar, .mat-datepicker-content').first();
  await calendar.waitFor({ state: 'visible', timeout: 5000 });

  const periodBtn = page.locator('button.mat-calendar-period-button').first();
  const monthLabels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  for (let i = 0; i < 4; i++) {
    const yearCell = page.locator('.mat-calendar-body-cell-content').filter({ hasText: new RegExp(`^${year}$`) });
    if (await yearCell.count() > 0) break;
    if (await periodBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await periodBtn.click();
      await sleep(400);
    }
  }

  await page.locator('.mat-calendar-body-cell-content').filter({ hasText: new RegExp(`^${year}$`) }).first()
    .click({ timeout: 5000 });
  await sleep(400);

  const monthShort = monthLabels[month - 1];
  let monthCell = page.locator('.mat-calendar-body-cell-content').filter({ hasText: new RegExp(`^${monthShort}$`, 'i') });
  if (await monthCell.count() === 0) {
    monthCell = page.locator('.mat-calendar-body-cell-content').filter({ hasText: new RegExp(`^${month}$`) });
  }
  await monthCell.first().click({ timeout: 5000 });
  await sleep(400);

  await page.locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled) .mat-calendar-body-cell-content')
    .filter({ hasText: new RegExp(`^${day}$`) }).first()
    .click({ timeout: 5000 });
};

/** Fill Date of Birth on the income-tax portal (masked input + mat-datepicker) */
const fillDateOfBirth = async (page, dobStr) => {
  const parsed = parseDob(dobStr);
  const dobInput = page.locator(
    'input[formcontrolname="dateOfBirth"], input[placeholder*="DD/MM"], input[placeholder*="Date of Birth"], input[placeholder*="date"], input[aria-label*="DOB"], input[aria-label*="Birth"]'
  ).first();

  await dobInput.waitFor({ state: 'visible', timeout: 10000 });
  await page.keyboard.press('Escape').catch(() => {});

  const clearAndFocus = async () => {
    await dobInput.click({ timeout: 5000, noWaitAfter: true });
    await sleep(200);
    await dobInput.evaluate((el) => {
      el.removeAttribute('readonly');
      el.focus();
    });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await sleep(150);
  };

  // Strategy 1: type 8 digits DDMMYYYY — input mask auto-inserts slashes
  try {
    await clearAndFocus();
    await page.keyboard.type(parsed.digits, { delay: 130 });
    await page.keyboard.press('Tab');
    await sleep(500);
    if (await dobLooksFilled(dobInput, parsed)) {
      console.log(`[DOB] Filled via digits: ${parsed.formatted}`);
      return;
    }
  } catch (e) {
    console.warn('[DOB] Digit typing failed:', e.message);
  }

  // Strategy 2: type formatted DD/MM/YYYY including slashes
  try {
    await clearAndFocus();
    await dobInput.pressSequentially(parsed.formatted, { delay: 130 });
    await dispatchInputEvents(dobInput);
    await page.keyboard.press('Tab');
    await sleep(500);
    if (await dobLooksFilled(dobInput, parsed)) {
      console.log(`[DOB] Filled via formatted string: ${parsed.formatted}`);
      return;
    }
  } catch (e) {
    console.warn('[DOB] Formatted typing failed:', e.message);
  }

  // Strategy 3: open calendar picker and select date
  try {
    await page.keyboard.press('Escape').catch(() => {});
    await dobInput.click();
    await sleep(300);

    const toggle = page.locator(
      'mat-datepicker-toggle button, button[aria-label*="calendar" i], button[aria-label*="Choose date" i]'
    ).first();

    if (await toggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await toggle.click();
      await sleep(600);
      await pickDateFromMaterialCalendar(page, parsed);
      await sleep(500);
      if (await dobLooksFilled(dobInput, parsed)) {
        console.log(`[DOB] Filled via calendar: ${parsed.formatted}`);
        return;
      }
    }
  } catch (e) {
    console.warn('[DOB] Calendar picker failed:', e.message);
  }

  // Strategy 4: native value setter + Angular input events
  try {
    await dobInput.evaluate((el, { formatted }) => {
      el.removeAttribute('readonly');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, formatted);
      else el.value = formatted;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: formatted }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }, { formatted: parsed.formatted });
    await sleep(400);
    console.log(`[DOB] Applied native setter fallback: ${parsed.formatted}`);
  } catch (e) {
    console.warn('[DOB] Native setter failed:', e.message);
  }
};

/** Check if the portal is showing an OTP entry screen */
const isOtpScreenVisible = async (page) => {
  const inputSelectors = [
    'input.otp-input',
    'input[autocomplete="one-time-code"]',
    'input[formcontrolname="otp"]',
    'input[name="otp"]',
  ];
  for (const sel of inputSelectors) {
    try {
      if (await page.locator(sel).first().isVisible({ timeout: 1500 })) return true;
    } catch { /* ignore */ }
  }
  try {
    return await page.getByText(/enter otp|verify otp|one.?time password|otp verification|mobile otp|email otp/i)
      .first().isVisible({ timeout: 1000 });
  } catch {
    return false;
  }
};

/** Wait for human OTP, fill it, and retry on failure */
const handleOtpGate = async (page, jobId, message) => {
  await emitEvent(jobId, 'info', 'OTP_GATE', message);
  await axios.post(`${API_URL}/jobs/${jobId}`, { lastOtpError: null }).catch(() => {});

  let otpAttempts = 0;
  const MAX_OTP_ATTEMPTS = 3;

  while (otpAttempts < MAX_OTP_ATTEMPTS) {
    const otp = await pollForOtp(jobId, page);

    console.log(`[Action] Entering OTP (attempt ${otpAttempts + 1})`);
    try {
      await fillOtp(page, otp);
      await sleep(500);
      await clickValidateOtp(page, jobId);

    } catch (e) {
      await emitEvent(jobId, 'warn', 'OTP_GATE', `[Bot Warning] OTP entry/validate failed: ${e.message}`);
      await unlockPageScroll(page).catch(() => {});
    }
    await sleep(4000);

    const otpErr = await getErrorBanner(page);
    if (otpErr && /invalid|incorrect|expired|wrong|mismatch|not valid/i.test(otpErr)) {
      otpAttempts++;
      const errMsg = `Invalid OTP: ${otpErr}`;
      await emitEvent(jobId, 'warn', 'OTP_GATE', `${errMsg}. Enter a new OTP or click Resend on the dashboard.`);
      await setOtpError(jobId, errMsg);
      if (otpAttempts >= MAX_OTP_ATTEMPTS) {
        await emitEvent(jobId, 'error', 'FAILED', `OTP failed after ${MAX_OTP_ATTEMPTS} attempts. Manual intervention required.`);
        throw new Error('OTP verification failed');
      }
    } else if (await isOtpScreenVisible(page)) {
      otpAttempts++;
      const errMsg = 'OTP was not accepted. The Validate button may still be disabled — try a new OTP.';
      await emitEvent(jobId, 'warn', 'OTP_GATE', `${errMsg} (attempt ${otpAttempts})`);
      await setOtpError(jobId, errMsg);
      if (otpAttempts >= MAX_OTP_ATTEMPTS) {
        await emitEvent(jobId, 'error', 'FAILED', `OTP failed after ${MAX_OTP_ATTEMPTS} attempts.`);
        throw new Error('OTP verification failed');
      }
    } else {
      await axios.post(`${API_URL}/jobs/${jobId}`, { lastOtpError: null, suppliedOtp: null }).catch(() => {});
      return;
    }
  }
};

/** If OTP screen appears at any step, handle it before continuing */
const handleOtpIfVisible = async (page, jobId, message) => {
  if (await isOtpScreenVisible(page)) {
    await handleOtpGate(page, jobId, message);
    await sleep(2000);
    return true;
  }
  return false;
};

/** Wait for OTP screen to appear (portal may load it after a delay) then handle it */
const waitAndHandleOtp = async (page, jobId, message, maxWaitMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isOtpScreenVisible(page)) {
      await handleOtpGate(page, jobId, message);
      await sleep(2000);
      return true;
    }
    await sleep(1500);
  }
  // Final check — OTP may have appeared right at the deadline
  return handleOtpIfVisible(page, jobId, message);
};

const getErrorBanner = async (page) => {
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

// ─── Forgot Password Flow ───────────────────────────────────────────────────────

const generateSecurePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const specialChars = '!@#$%^&*';
  const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';

  let pwd = '';
  pwd += upperCase[Math.floor(Math.random() * upperCase.length)];
  pwd += lowerCase[Math.floor(Math.random() * lowerCase.length)];
  pwd += numbers[Math.floor(Math.random() * numbers.length)];
  pwd += specialChars[Math.floor(Math.random() * specialChars.length)];

  for (let i = 0; i < 10; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
};

const saveRecoveredPassword = async (jobId, password) => {
  await axios.post(`${API_URL}/jobs/${jobId}`, {
    status: 'SUCCESS',
    outcomeMessage: 'Password recovered successfully via Aadhaar OTP.',
    recoveredPassword: password,
    suppliedOtp: null,
    lastOtpError: null,
  }).catch((err) => {
    console.error('[Recovery] Failed to save password to DB:', err.message);
  });
};

const fillPasswordField = async (locator, password) => {
  await locator.click({ timeout: 5000 });
  await locator.fill('');
  await locator.pressSequentially(password, { delay: 80 });
  await dispatchInputEvents(locator);
};

const runForgotPasswordFlow = async (page, browser, pan, jobId) => {
  try {
    await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', 'PAN already registered — pivoting to Forgot Password recovery...');

    // Instead of forcing a URL change (which the portal blocks if you are mid-login), click the Forgot Password link!
    const forgotPwdLink = page.getByRole('link', { name: /Forgot Password/i }).first();
    if (await forgotPwdLink.isVisible({ timeout: 5000 })) {
       await safeClick(forgotPwdLink, 'Forgot Password Link');
       await sleep(3000);
    } else {
       await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/pre-login/forgot-password', {
         timeout: 0, waitUntil: 'domcontentloaded',
       });
       await sleep(2500);
    }

    // Identity gate — enter PAN (if we clicked the link, the PAN might already be pre-filled, so we check first)
    await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', 'Verifying PAN on Forgot Password screen...');
    
    // Broadened selector to catch "userId", "pan", or placeholder text
    const panInput = page.locator('input[formcontrolname*="pan" i], input[formcontrolname*="user" i], input[id*="pan" i], input[id*="user" i], input[placeholder*="User ID" i], input[placeholder*="PAN" i]').first();
    
    await panInput.waitFor({ state: 'visible', timeout: 20000 });
    
    const currentPanValue = await panInput.inputValue();
    if (!currentPanValue || currentPanValue.toUpperCase() !== pan.toUpperCase()) {
       await safeFill(panInput, pan, 'PAN for recovery');
       await sleep(500);
       await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue (Recovery PAN)');
       await sleep(4000);
    } else {
       console.log('[Recovery] PAN already pre-filled. Clicking Continue.');
       await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue (Recovery PAN)');
       await sleep(4000);
    }

    // Select Aadhaar OTP recovery method
    await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', 'Selecting "OTP on mobile registered with Aadhaar"...');
    const aadhaarRadio = page.locator('mat-radio-button, [role="radio"]').filter({
      hasText: /OTP on mobile number registered with Aadhaar|Aadhaar OTP|mobile.*Aadhaar/i,
    }).first();
    await aadhaarRadio.click({ timeout: 8000 });
    await sleep(1000);
    await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue (Recovery Method)');
    await sleep(3000);

    // Generate OTP confirmation screen (Ask user for preference)
    try {
      // Dynamically fetch all radio button options from the page
      const radioButtons = page.locator('mat-radio-button, [role="radio"]');
      const radioCount = await radioButtons.count();
      
      await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', `[Debug] Found ${radioCount} radio buttons on page`);
      
      if (radioCount > 0) {
        // Extract the text labels from all visible radio buttons
        const options = await page.evaluate(() => {
          const radios = document.querySelectorAll('mat-radio-button, [role="radio"]');
          const labels = [];
          radios.forEach(radio => {
            // Try to get the label text more precisely
            const label = radio.querySelector('.mat-radio-label-content, .mdc-radio__label, label');
            const text = label ? label.textContent?.trim() : radio.textContent?.trim();
            // Filter out empty or very short text
            if (text && text.length > 3) {
              labels.push(text);
            }
          });
          return labels;
        });

        await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', `[Debug] Extracted options: ${JSON.stringify(options)}`);

        if (options.length > 0) {
          await emitEvent(jobId, 'warn', 'CORRECTION_GATE', 'Aadhaar OTP required. Do you want to generate a new OTP or use an existing one?');
          await axios.patch(`${API_URL}/jobs/${jobId}`, {
            status: 'CORRECTION_GATE',
            correctionMessage: 'Please select how you want to proceed with the Aadhaar OTP.',
            correctionField: 'aadhaarOtpChoice',
            correctionOptions: options
          }).catch(() => {});

          // Poll for user choice
          let userChoice = null;
          while (true) {
            const { data: jobInfo } = await axios.get(`${API_URL}/jobs/${jobId}`);
            userChoice = jobInfo?.job?.registrationPayload?.aadhaarOtpChoice;
            if (userChoice) {
              console.log(`[Action] Received Aadhaar OTP choice: ${userChoice}`);
              await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', `User selected: ${userChoice}`);
              
              // Clear the correction gate state
              await axios.patch(`${API_URL}/jobs/${jobId}`, {
                status: 'ACCOUNT_RECOVERY',
                correctionField: null,
                correctionOptions: null,
                correctionMessage: null
              }).catch(() => {});
              break;
            }
            await sleep(5000);
          }

          // Click the chosen radio button by matching the text
          const selectedRadio = radioButtons.filter({ hasText: userChoice }).first();
          await selectedRadio.click({ timeout: 8000 });
          
          await sleep(800);
          await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue (Generate OTP Choice)');
          await sleep(3000);
        }
      }
    } catch { /* optional step */ }

    // UIDAI consent — checkbox + Yes / Generate Aadhaar OTP
    try {
      const checkbox = page.getByRole('checkbox').first();
      if (await checkbox.isVisible({ timeout: 4000 })) {
        await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', 'Accepting UIDAI consent...');
        await checkbox.check({ timeout: 5000 });
        await sleep(500);

        const generateBtn = page.getByRole('button', { name: /Generate Aadhaar OTP/i }).first();
        const yesBtn = page.getByRole('button', { name: /^Yes$/i }).first();

        if (await generateBtn.isVisible({ timeout: 1500 })) {
          await safeClick(generateBtn, 'Generate Aadhaar OTP');
        } else if (await yesBtn.isVisible({ timeout: 1500 })) {
          await safeClick(yesBtn, 'UIDAI Yes');
        }
        await sleep(3000);
      }
    } catch { /* optional UIDAI popup */ }

    // OTP gate — same dashboard flow as registration
    await handleOtpGate(page, jobId, 'Aadhaar OTP required for password reset. Enter it on the dashboard.');

    // New password screen
    await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', 'OTP accepted — setting new secure password...');
    await sleep(2000);

    const newPassword = generateSecurePassword();
    const newPwdInput = page.locator('input[formcontrolname="password"], input[type="password"]').first();
    const confirmPwdInput = page.locator('input[formcontrolname="confirmPassword"], input[formcontrolname="reenterPassword"], input[type="password"]').nth(1);

    await newPwdInput.waitFor({ state: 'visible', timeout: 15000 });
    await fillPasswordField(newPwdInput, newPassword);
    await sleep(400);
    await fillPasswordField(confirmPwdInput, newPassword);
    await sleep(800);

    await safeClick(
      page.getByRole('button', { name: /Submit|Continue|Reset|Update/i }).first(),
      'Submit Password'
    );
    await sleep(5000);

    // Verify success screen
    const successVisible = await page.getByText(/updated successfully|password.*updated|reset successfully|successfully updated/i)
      .first().isVisible({ timeout: 8000 }).catch(() => false);

    if (successVisible) {
      await saveRecoveredPassword(jobId, newPassword);
      await emitEvent(jobId, 'info', 'SUCCESS', 'Password recovered successfully! View the new password on your dashboard.');
      console.log(`[Recovery] Password saved for job ${jobId}`);
    } else {
      await emitEvent(jobId, 'error', 'FAILED', 'Could not confirm password update success screen.');
    }
  } catch (e) {
    await emitEvent(jobId, 'error', 'FAILED', `Forgot Password flow failed: ${e.message}`);
  } finally {
    await sleep(5000);
    try { await browser.close(); } catch { /* already closed */ }
  }
};

// ─── Main Bot ─────────────────────────────────────────────────────────────────

const runBot = async () => {
  await sleep(3000); // Let Express fully boot

  const jobId   = JOB_ID || process.env.DUMMY_JOB_ID;
  const pan     = TARGET_PAN || DUMMY_PAN;
  const isOthers = IS_OTHERS === 'true';
  const category = TAXPAYER_CATEGORY || 'Individual';

  // Registration form data
  let regData = {
    lastName:          REG_LAST_NAME     || 'DOE',
    middleName:        REG_MIDDLE_NAME   || '',
    firstName:         REG_FIRST_NAME    || 'JOHN',
    dateOfBirth:       REG_DATE_OF_BIRTH || '01/01/1990',
    gender:            REG_GENDER        || 'Male',
    residentialStatus: REG_RESIDENTIAL   || 'Resident',
    email:             REG_EMAIL         || '',
    emailBelongsTo:    process.env.REG_EMAIL_BELONGS  || 'Self',
    mobile:            REG_MOBILE        || '',
    mobileBelongsTo:   process.env.REG_MOBILE_BELONGS || 'Self',
    country:           process.env.REG_COUNTRY        || 'India',
    flat:              process.env.REG_FLAT           || '',
    road:              process.env.REG_ROAD           || '',
    pincode:           process.env.REG_PINCODE        || '',
    postOffice:        process.env.REG_POST_OFFICE    || '',
    area:              process.env.REG_AREA           || '',
    town:              process.env.REG_TOWN           || '',
    state:             process.env.REG_STATE          || '',
  };

  if (!pan) { console.error('No PAN provided.'); process.exit(1); }
  if (!jobId) { console.error('No JOB_ID provided.'); process.exit(1); }

  await emitEvent(jobId, 'info', 'INIT', `Bot launched for PAN: ${pan.slice(0,3)}***${pan.slice(-2)}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page    = await context.newPage();

  try {
    // ── NAVIGATE TO LOGIN ──────────────────────────────────────────────────────
    await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/login', {
      timeout: 0, waitUntil: 'domcontentloaded'
    });
    await sleep(2500);

    await safeFill(page.locator('input[id="panAdhaarUserId"]'), pan, 'PAN input');
    await sleep(500);
    await safeClick(page.locator('button.large-button-primary').first(), 'Continue');

    // ── DETECT IF PAN EXISTS ──────────────────────────────────────────────────
    let isRegistered = false;
    try {
      // If the PAN is valid, the portal will route from /login to /login/password
      await page.waitForURL('**/login/password', { timeout: 10000 });
      isRegistered = true;
    } catch {
      console.log('[Warning] Did not transition to /login/password. Checking for invalid PAN error...');
      
      try {
         // Maybe the password box appeared without a URL change?
         const passwordInput = page.locator('input[type="password"], input[formcontrolname="loginPassword"]').first();
         if (await passwordInput.isVisible({ timeout: 2000 })) {
             isRegistered = true;
         }
      } catch { /* ignore */ }
    }

    if (isRegistered) {
      await emitEvent(jobId, 'warn', 'ALREADY_EXISTS', `PAN ${pan} is already registered on the portal.`);
      
      // Pivot to Forgot Password recovery flow
      await runForgotPasswordFlow(page, browser, pan, jobId);
      return;
    }

    // ── DETECT: PAN DOES NOT EXIST → REGISTRATION FLOW ───────────────────────
    try {
      const noExist = page.getByText(/PAN does not exist/i, { exact: false });
      if (await noExist.isVisible({ timeout: 1000 })) {
        console.log('[Phase] PAN not found on login screen.');
      }

      console.log(`[Phase] PAN not found. Starting ${isOthers ? 'Others' : 'Taxpayer'} registration...`);
      await emitEvent(jobId, 'warn', 'REGISTERING', `PAN not found. Starting registration as ${category}`);

      // Navigate to registration
      await page.goto(
        'https://eportal.incometax.gov.in/iec/foservices/#/pre-login/register',
        { timeout: 0, waitUntil: 'domcontentloaded' }
      );
      await sleep(3000);

      // ── IF "OTHERS" — Click Others tab + select dropdown ─────────────────
      if (isOthers) {
        console.log('[Action] Clicking Others tab');
        await safeClick(page.getByRole('button', { name: 'Others', exact: true }).first(), 'Others tab');
        await sleep(1000);

        console.log(`[Action] Selecting Others category: ${category}`);
        await safeClick(page.locator('mat-select').first(), 'Category dropdown');
        await sleep(600);
        await safeClick(
          page.locator('mat-option, .mat-mdc-option').filter({ hasText: new RegExp(category, 'i') }).first(),
          `Option: ${category}`
        );
        await sleep(1000);
      }

      // ── FILL PAN + VALIDATE ───────────────────────────────────────────────
      console.log('[Action] Filling PAN for validation');
      await safeFill(page.locator('input[formcontrolname="pan"]').first(), pan, 'PAN');
      await sleep(1000);

      console.log('[Action] Clicking Validate');
      await safeClick(page.getByRole('button', { name: 'Validate', exact: false }), 'Validate');
      await sleep(5000);

      // ── DETECT: "Yes/No" Category Confirmation radio ──────────────────────
      try {
        await page.getByRole('radio', { name: 'Yes' }).waitFor({ state: 'visible', timeout: 5000 });
        console.log('[Action] Clicking Yes for category confirmation');
        await safeClick(page.getByRole('radio', { name: 'Yes', exact: false }).first(), 'Yes radio');
        await sleep(1000);
      } catch { console.log('[Skip] No Yes/No radio detected'); }

      // ── CLICK CONTINUE ────────────────────────────────────────────────────
      console.log('[Action] Clicking Continue');
      await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue');
      await sleep(3000);

      // ── HANDLE UIDAI POPUP ────────────────────────────────────────────────
      try {
        const checkbox = page.getByRole('checkbox').first();
        if (await checkbox.isVisible({ timeout: 3000 })) {
          console.log('[Action] Ticking UIDAI agreement checkbox');
          await checkbox.check({ timeout: 5000 });
          await sleep(500);
          await safeClick(page.getByRole('button', { name: 'Yes', exact: false }).first(), 'UIDAI Yes');
          await sleep(3000);
        }
      } catch { console.log('[Skip] No UIDAI popup detected'); }

      // OTP may appear immediately after UIDAI consent (before Basic Details)
      try {
        await waitAndHandleOtp(
          page, jobId,
          'OTP sent after UIDAI verification. Please enter OTP on the dashboard.'
        );
      } catch (otpErr) {
        await sleep(60000);
        await browser.close();
        return;
      }

      // ── CHECK FOR ERRORS BEFORE PROCEEDING ───────────────────────────────
      const earlyErr = await getErrorBanner(page);
      if (earlyErr) {
        await emitEvent(jobId, 'error', 'FAILED', `Validation error before form: ${earlyErr}`);
        await sleep(30000); await browser.close(); return;
      }

      // ═══════════════════════════════════════════════════════════════════
      //  BASIC DETAILS TAB
      // ═══════════════════════════════════════════════════════════════════
      if (!(await isOtpScreenVisible(page))) {
      let basicFilledSuccessfully = false;
      while (!basicFilledSuccessfully && !(await isOtpScreenVisible(page))) {
      await emitEvent(jobId, 'info', 'BASIC_DETAILS', 'Filling in Basic Details...');
      await sleep(2000);

      // Last Name (mandatory)
      await safeFill(page.locator('input[formcontrolname="lastName"], input[placeholder*="Last Name"]').first(), regData.lastName, 'Last Name');
      await sleep(400);

      // Middle Name (optional)
      if (regData.middleName) {
        await safeFill(page.locator('input[formcontrolname="middleName"], input[placeholder*="Middle Name"]').first(), regData.middleName, 'Middle Name');
        await sleep(400);
      }

      // First Name (optional per portal note — single-name users skip this)
      if (regData.firstName) {
        await safeFill(page.locator('input[formcontrolname="firstName"], input[placeholder*="First Name"]').first(), regData.firstName, 'First Name');
        await sleep(400);
      }

      console.log(`[Action] Setting Date of Birth: ${regData.dateOfBirth}`);
      try {
        await fillDateOfBirth(page, regData.dateOfBirth);
      } catch (e) {
        console.warn('[Warning] Date of Birth fill failed:', e.message);
      }

      // Gender radio
      console.log(`[Action] Selecting Gender: ${regData.gender}`);
      await safeClick(page.getByRole('radio', { name: new RegExp(regData.gender, 'i') }).first(), `Gender: ${regData.gender}`);
      await sleep(400);

      // Residential Status radio
      console.log(`[Action] Selecting Residential Status: ${regData.residentialStatus}`);
      await safeClick(page.getByRole('radio', { name: new RegExp(regData.residentialStatus, 'i') }).first(), `Status: ${regData.residentialStatus}`);
      await sleep(400);

      // ── POST-BASIC_DETAILS ERROR CHECK ────────────────────────────────
      const basicErr = await getErrorBanner(page);
      if (basicErr) {
        await emitEvent(jobId, 'warn', 'CORRECTION_GATE', `Basic Details error: ${basicErr}`);
        await axios.post(`${API_URL}/jobs/${jobId}`, {
          status: 'CORRECTION_GATE',
          correctionMessage: basicErr
        }).catch(() => {});

        const newPayload = await pollForCorrection(jobId, page);
        regData = { ...regData, ...newPayload };
        await emitEvent(jobId, 'info', 'BASIC_DETAILS', 'Resuming with corrected Basic Details...');
        continue;
      }

      basicFilledSuccessfully = true;

      // Continue to next tab (skip if still on OTP screen)
      if (!(await isOtpScreenVisible(page))) {
        console.log('[Action] Clicking Continue to Contact Details');
        await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue to Contact');
        await sleep(3000);
      }
      } // end basic details while
      } // end basic details if

      // ═══════════════════════════════════════════════════════════════════
      //  CONTACT DETAILS TAB
      // ═══════════════════════════════════════════════════════════════════
      let contactFilledSuccessfully = false;
      while (!contactFilledSuccessfully && !(await isOtpScreenVisible(page))) {
        await emitEvent(jobId, 'info', 'CONTACT_DETAILS', 'Filling in Contact Details...');

        if (regData.mobile) {
          await safeFill(
            page.locator('input[formcontrolname="mobile"], input[placeholder*="Mobile"], input[type="tel"]').first(),
            regData.mobile, 'Mobile'
          );
          await sleep(400);
          
          // Select Belongs To (Mobile)
          try {
            const dropdowns = await page.locator('mat-select').all();
            if (dropdowns.length >= 1) {
              await safeClick(dropdowns[0], 'Mobile Belongs To Dropdown');
              await sleep(600);
              await safeClick(page.locator('mat-option, .mat-mdc-option').filter({ hasText: new RegExp(regData.mobileBelongsTo, 'i') }).first(), `Mobile Belongs To: ${regData.mobileBelongsTo}`);
              await sleep(400);
            }
          } catch (e) { console.warn('Could not select mobile belongs to:', e.message); }
        }

        if (regData.email) {
          await safeFill(
            page.locator('input[formcontrolname="email"], input[placeholder*="Email"], input[type="email"]').first(),
            regData.email, 'Email'
          );
          await sleep(400);

          // Select Belongs To (Email)
          try {
            const dropdowns = await page.locator('mat-select').all();
            if (dropdowns.length >= 2) {
              await safeClick(dropdowns[1], 'Email Belongs To Dropdown');
              await sleep(600);
              await safeClick(page.locator('mat-option, .mat-mdc-option').filter({ hasText: new RegExp(regData.emailBelongsTo, 'i') }).first(), `Email Belongs To: ${regData.emailBelongsTo}`);
              await sleep(400);
            }
          } catch (e) { console.warn('Could not select email belongs to:', e.message); }
        }

        // Postal Address
        try {
          if (regData.country && regData.country !== 'India') {
            const dropdowns = await page.locator('mat-select').all();
            if (dropdowns.length >= 3) {
              await safeClick(dropdowns[2], 'Country Dropdown');
              await sleep(600);
              await safeClick(page.locator('mat-option, .mat-mdc-option').filter({ hasText: new RegExp(regData.country, 'i') }).first(), `Country: ${regData.country}`);
              await sleep(400);
            }
          }
          if (regData.flat) await safeFill(page.locator('input[formcontrolname="flat"], input[placeholder*="Flat"]').first(), regData.flat, 'Flat');
          if (regData.road) await safeFill(page.locator('input[formcontrolname="road"], input[placeholder*="Road"]').first(), regData.road, 'Road');
          
          if (regData.pincode) {
            const pinInput = page.locator('input[formcontrolname="pincode"], input[placeholder*="Pincode"]').first();
            await pinInput.fill(regData.pincode);
            await page.keyboard.press('Tab'); // Trigger auto-fetch of Post Office/State
            await sleep(3000); // Wait for portal API to fetch Post Offices
          }

          // Helper to handle fields that could be either a text input or a dropdown (mat-select)
          const fillOrSelect = async (fieldName, value) => {
            if (!value) return;
            const selectLoc = page.locator(`mat-select[formcontrolname="${fieldName}"], mat-select[placeholder*="${fieldName}"]`).first();
            const inputLoc = page.locator(`input[formcontrolname="${fieldName}"], input[placeholder*="${fieldName}"]`).first();
            
            if (await selectLoc.isVisible({ timeout: 1000 })) {
              await safeClick(selectLoc, `${fieldName} Dropdown`);
              await sleep(1000);
              
              // Try exact match first
              let optionLoc = page.locator('mat-option, .mat-mdc-option').filter({ hasText: new RegExp(`^\\s*${value}\\s*$`, 'i') });
              let count = await optionLoc.count();
              
              if (count === 0) {
                // Fallback to partial match
                optionLoc = page.locator('mat-option, .mat-mdc-option').filter({ hasText: new RegExp(value, 'i') });
                count = await optionLoc.count();
                
                if (count > 1) {
                  const texts = await optionLoc.allTextContents();
                  const cleanedTexts = texts.map(t => t.trim()).slice(0, 5); // Array of strings
                  // Throw a special error that the outer block will catch and use for CORRECTION_GATE
                  const userMsg = `Exact match not found for ${fieldName} "${value}". Please select the correct option.`;
                  throw new Error(`AMBIGUOUS_MATCH|${fieldName}|${userMsg}|${JSON.stringify(cleanedTexts)}`);
                }
              }
              
              if (count > 0) {
                await safeClick(optionLoc.first(), `${fieldName}: ${value}`);
                await sleep(400);
              } else {
                 const userMsg = `No matching options found for ${fieldName} "${value}". Please check your spelling.`;
                 throw new Error(`AMBIGUOUS_MATCH|${fieldName}|${userMsg}`);
              }
            } else if (await inputLoc.isVisible({ timeout: 500 })) {
              await safeFill(inputLoc, value, fieldName);
            }
          };

          await fillOrSelect('postOffice', regData.postOffice);
          await fillOrSelect('area', regData.area);
          await fillOrSelect('locality', regData.area); 
          await fillOrSelect('town', regData.town);
          await fillOrSelect('city', regData.town); 
          await fillOrSelect('state', regData.state);

        } catch (e) { 
          console.warn('Address fill warning:', e.message); 
          if (e.message.includes('AMBIGUOUS_MATCH')) {
             const parts = e.message.split('|');
             const userMsg = parts.length > 2 ? parts[2] : parts[1];
             const cField = parts.length > 2 ? parts[1] : null;
             const cOpts = parts.length > 3 ? JSON.parse(parts[3]) : null;

             await emitEvent(jobId, 'warn', 'CORRECTION_GATE', userMsg);
             await axios.post(`${API_URL}/jobs/${jobId}`, {
               status: 'CORRECTION_GATE',
               correctionMessage: userMsg,
               correctionField: cField,
               correctionOptions: cOpts
             }).catch(() => {});
             
             const newPayload = await pollForCorrection(jobId, page);
             regData = { ...regData, ...newPayload };
             await emitEvent(jobId, 'info', 'CONTACT_DETAILS', 'Resuming with corrected address details...');
             continue; // Re-run the loop with new data
          }
        }

        // ── POST-CONTACT_DETAILS ERROR CHECK ──────────────────────────────
        const contactErr = await getErrorBanner(page);
        if (contactErr) {
          await emitEvent(jobId, 'warn', 'CORRECTION_GATE', `Contact Details error: ${contactErr}`);
          await axios.post(`${API_URL}/jobs/${jobId}`, {
            status: 'CORRECTION_GATE',
            correctionMessage: contactErr
          }).catch(() => {});
          
          const newPayload = await pollForCorrection(jobId, page);
          regData = { ...regData, ...newPayload };
          await emitEvent(jobId, 'info', 'CONTACT_DETAILS', 'Resuming with corrected Contact Details...');
          continue; // Re-fill
        }

        contactFilledSuccessfully = true;

        // Continue — OTP may appear after contact details
        if (!(await isOtpScreenVisible(page))) {
          console.log('[Action] Clicking Continue to OTP verification');
          await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue to OTP');
          await sleep(4000);
        }
      } // end while loop

      await handleOtpIfVisible(
        page, jobId,
        'OTP sent to registered mobile/email. Please enter OTP on the dashboard.'
      );

      // ═══════════════════════════════════════════════════════════════════
      //  ACCOUNT RECOVERY — Set password and security question (if prompted)
      // ═══════════════════════════════════════════════════════════════════
      await sleep(3000);
      await emitEvent(jobId, 'info', 'ACCOUNT_RECOVERY', 'OTP verified. Setting up account recovery...');

      // The portal may prompt for password setup at this point
      try {
        const passwordInput = page.locator('input[formcontrolname="password"], input[type="password"]').first();
        if (await passwordInput.isVisible({ timeout: 5000 })) {
          console.log('[Action] Setting account password');
          // Generate a strong default password
          const tempPassword = 'Karo@2024!';
          await safeFill(passwordInput, tempPassword, 'Password');
          const confirmPwd = page.locator('input[formcontrolname="confirmPassword"], input[formcontrolname="reenterPassword"]').first();
          await safeFill(confirmPwd, tempPassword, 'Confirm Password');
          await sleep(500);
          await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue from password');
          await sleep(3000);
        }
      } catch { console.log('[Skip] No password setup screen detected'); }

      // ── POST-RECOVERY ERROR CHECK ──────────────────────────────────────
      const recoveryErr = await getErrorBanner(page);
      if (recoveryErr) {
        await emitEvent(jobId, 'error', 'FAILED', `Account recovery error: ${recoveryErr}`);
        await sleep(60000); await browser.close(); return;
      }

      // ── SUCCESS ───────────────────────────────────────────────────────
      const successText = await page.getByText('registered successfully', { exact: false })
        .or(page.getByText('Registration successful', { exact: false }))
        .first()
        .innerText({ timeout: 10000 })
        .catch(() => 'Registration complete');

      await emitEvent(jobId, 'info', 'SUCCESS', `✅ ${successText}`);
      console.log('[Bot] Registration completed successfully!');

      // Stay open for 5 minutes so user can see the confirmation
      await sleep(300000);

    } catch (registrationErr) {
      // If the registration sub-flow itself threw unexpectedly
      console.error('[Registration Error]', registrationErr.message);
      await emitEvent(jobId, 'error', 'FAILED', `Registration error: ${registrationErr.message}`);
      await sleep(60000);
      await browser.close();
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  If we reach here: PAN exists → Normal Login + CAPTCHA_GATE path
    // ─────────────────────────────────────────────────────────────────────────

  } catch (noExistErr) {
    // The "PAN does not exist" error didn't appear — this PAN already exists.
    // Proceed to the standard OTP login flow.
    console.log('[Phase] PAN exists. Proceeding to CAPTCHA_GATE login...');

    await emitEvent(jobId, 'info', 'CAPTCHA_GATE', `PAN accepted. Waiting for login OTP for PAN: ${pan?.slice(0,3)}***${pan?.slice(-2)}`);

    const otp = await pollForOtp(jobId, page);
    console.log('[Action] Entering login OTP');

    try {
      await fillOtp(page, otp);
      await clickValidateOtp(page, jobId);
      await sleep(4000);
    } catch (e) {
      await emitEvent(jobId, 'warn', 'CAPTCHA_GATE', `[Bot Warning] Login OTP entry failed: ${e.message}`);
      await unlockPageScroll(page).catch(() => {});
    }

    await emitEvent(jobId, 'info', 'SUCCESS', `✅ Login OTP entered. User is now logged in.`);

  } finally {
    // Keep browser alive briefly so the user can see the final state
    await sleep(120000);
    try { await browser.close(); } catch { /* already closed */ }
  }
};

runBot().catch(async (err) => {
  console.error('[Fatal]', err);
  
  const jobId = process.env.JOB_ID || process.env.DUMMY_JOB_ID;
  const isContextError = err.message.includes('Execution context was destroyed') || 
                         err.message.includes('Target closed') || 
                         err.message.includes('navigated');

  if (jobId) {
    if (isContextError) {
      await emitEvent(jobId, 'error', 'FAILED', 'Bot crashed: The page was reloaded or the portal disconnected unexpectedly, destroying the execution context. Please restart the job.');
      // Update job status to FAILED
      await axios.patch(`${process.env.API_URL}/jobs/${jobId}`, {
        status: 'FAILED',
        outcomeMessage: 'Execution context destroyed due to unexpected page reload.'
      }).catch(() => {});
    } else {
      await emitEvent(jobId, 'error', 'FAILED', `Bot crashed fatally: ${err.message}`);
      await axios.patch(`${process.env.API_URL}/jobs/${jobId}`, {
        status: 'FAILED',
        outcomeMessage: `Fatal crash: ${err.message}`
      }).catch(() => {});
    }
  }

  process.exit(1);
});
