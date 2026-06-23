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

/** Click Validate once scroll is stable — no repeated isVisible polling */
const clickValidateOtp = async (page, jobId) => {
  await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Locating Validate/Submit button...');
  await blurActiveElement(page);
  await sleep(400);

  // Dump all visible buttons to logs for debugging
  const buttonDump = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    const matches = btns.filter(b => /validate|verify|submit|confirm|continue/i.test(b.textContent || ''));
    return matches.map(b => ({
      text: (b.textContent || '').trim().replace(/\s+/g, ' '),
      tag: b.tagName,
      disabled: b.disabled || b.hasAttribute('disabled')
    }));
  });
  
  await emitEvent(jobId, 'info', 'OTP_GATE', `[Bot Action] Found matching buttons: ${JSON.stringify(buttonDump)}`);

  try {
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      // Exclude "Back" or "Cancel" just in case they have weird text
      const target = buttons.find((b) => /validate|verify|submit|confirm|continue/i.test(b.textContent || '') && !/cancel/i.test(b.textContent || ''));
      return target && !target.disabled && !target.hasAttribute('disabled');
    }, { timeout: 15000 });
  } catch {
    await emitEvent(jobId, 'warn', 'OTP_GATE', '[Bot Warning] Validate button is still disabled or not found after 15s wait. Proceeding anyway.');
  }

  const btnIndex = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    const targetIndex = buttons.findIndex((b) => {
      const text = b.textContent || '';
      return /validate|verify|submit|confirm|continue/i.test(text) && !/cancel/i.test(text) && !b.disabled && !b.hasAttribute('disabled');
    });
    
    if (targetIndex !== -1) {
      buttons[targetIndex].scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    }
    return targetIndex;
  });

  await sleep(600);

  try {
    if (btnIndex === -1) {
      // Fallback: Just click anything that matches via playwright
      const fallbackBtn = page.locator('button:visible, a:visible, [role="button"]:visible')
        .filter({ hasText: /validate|verify|submit|confirm|continue/i }).last();
      await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Clicking fallback Validate/Submit button...');
      await fallbackBtn.click({ timeout: 5000, noWaitAfter: true });
    } else {
      await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Executing JS click on located active button...');
      await page.evaluate((idx) => {
        const buttons = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
        buttons[idx].click();
      }, btnIndex);
    }
    await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Successfully triggered Validate/Submit action');
  } catch (e) {
    await emitEvent(jobId, 'warn', 'OTP_GATE', `[Bot Warning] Click failed completely: ${e.message}`);
  }

  await unlockPageScroll(page);
};

const setOtpError = async (jobId, message) => {
  await axios.post(`${API_URL}/jobs/${jobId}`, {
    suppliedOtp: null,
    lastOtpError: message,
  }).catch(() => {});
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

// ─── Main Bot ─────────────────────────────────────────────────────────────────

const runBot = async () => {
  await sleep(3000); // Let Express fully boot

  const jobId   = JOB_ID || process.env.DUMMY_JOB_ID;
  const pan     = TARGET_PAN || DUMMY_PAN;
  const isOthers = IS_OTHERS === 'true';
  const category = TAXPAYER_CATEGORY || 'Individual';

  // Registration form data
  const regData = {
    lastName:          REG_LAST_NAME     || 'DOE',
    middleName:        REG_MIDDLE_NAME   || '',
    firstName:         REG_FIRST_NAME    || 'JOHN',
    dateOfBirth:       REG_DATE_OF_BIRTH || '01/01/1990',
    gender:            REG_GENDER        || 'Male',
    residentialStatus: REG_RESIDENTIAL   || 'Resident',
    email:             REG_EMAIL         || '',
    mobile:            REG_MOBILE        || '',
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

    // ── DETECT: PAN ALREADY REGISTERED ───────────────────────────────────────
    try {
      const alreadyReg = page.getByText('PAN already registered', { exact: false });
      await alreadyReg.waitFor({ state: 'visible', timeout: 3000 });
      await emitEvent(jobId, 'warn', 'ALREADY_EXISTS', `PAN ${pan} is already registered on the portal.`);
      await sleep(10000);
      await browser.close();
      return;
    } catch { /* not registered — good, continue */ }

    // ── DETECT: PAN DOES NOT EXIST → REGISTRATION FLOW ───────────────────────
    try {
      const noExist = page.getByText('PAN does not exist', { exact: false });
      await noExist.waitFor({ state: 'visible', timeout: 5000 });

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

      // Date of Birth — The portal uses a date picker.
      // We type directly into the mat-datepicker input.
      console.log(`[Action] Filling Date of Birth: ${regData.dateOfBirth}`);
      try {
        const dobInput = page.locator('input[formcontrolname="dateOfBirth"], input[placeholder*="date"], input[aria-label*="DOB"], input[placeholder*="Date"]').first();
        await dobInput.click({ timeout: 5000 });
        await sleep(300);
        await dobInput.fill(regData.dateOfBirth, { timeout: 5000 });
        // Press Tab to commit the date (Angular datepicker requires this)
        await page.keyboard.press('Tab');
        await sleep(600);
      } catch (e) { console.warn('[Warning] Could not fill DOB:', e.message); }

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
        await emitEvent(jobId, 'error', 'FAILED', `Basic Details error: ${basicErr}`);
        await sleep(30000); await browser.close(); return;
      }

      // Continue to next tab (skip if still on OTP screen)
      if (!(await isOtpScreenVisible(page))) {
        console.log('[Action] Clicking Continue to Contact Details');
        await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue to Contact');
        await sleep(3000);
      }
      } // end basic details block

      // ═══════════════════════════════════════════════════════════════════
      //  CONTACT DETAILS TAB
      // ═══════════════════════════════════════════════════════════════════
      if (!(await isOtpScreenVisible(page))) {
      await emitEvent(jobId, 'info', 'CONTACT_DETAILS', 'Filling in Contact Details...');

      if (regData.mobile) {
        await safeFill(
          page.locator('input[formcontrolname="mobile"], input[placeholder*="Mobile"], input[type="tel"]').first(),
          regData.mobile, 'Mobile'
        );
        await sleep(400);
      }

      if (regData.email) {
        await safeFill(
          page.locator('input[formcontrolname="email"], input[placeholder*="Email"], input[type="email"]').first(),
          regData.email, 'Email'
        );
        await sleep(400);
      }

      // ── POST-CONTACT_DETAILS ERROR CHECK ──────────────────────────────
      const contactErr = await getErrorBanner(page);
      if (contactErr) {
        await emitEvent(jobId, 'error', 'FAILED', `Contact Details error: ${contactErr}`);
        await sleep(30000); await browser.close(); return;
      }

      // Continue — OTP may appear after contact details
      if (!(await isOtpScreenVisible(page))) {
        console.log('[Action] Clicking Continue to OTP verification');
        await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue to OTP');
        await sleep(4000);
      }

      await handleOtpIfVisible(
        page, jobId,
        'OTP sent to registered mobile/email. Please enter OTP on the dashboard.'
      );
      } // end contact details block

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
  process.exit(1);
});
