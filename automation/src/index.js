import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { emitEvent } from './utils/emitter.js';

dotenv.config();

chromium.use(stealth());

// ─── Read all environment variables (both from .env and from Orchestrator spawn) ─────
const {
  API_URL,
  DUMMY_PAN,
  TARGET_PAN,
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

/** Poll Express API until the human operator submits an OTP for this job */
const pollForOtp = async (jobId) => {
  console.log(`[Polling] Waiting for OTP on job ${jobId}...`);
  while (true) {
    try {
      const { data } = await axios.get(`${API_URL}/jobs/${jobId}`);
      if (data.job?.suppliedOtp) {
        console.log(`[Polling] OTP received: ${data.job.suppliedOtp}`);
        return data.job.suppliedOtp;
      }
    } catch (err) {
      console.error('[Polling Error]', err.message);
    }
    await sleep(2000);
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

/** Check for known error banners and return the error text or null */
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

  const jobId   = crypto.randomBytes(12).toString('hex');
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

  await emitEvent(jobId, 'info', 'INIT', `Bot launched for PAN: ${pan.slice(0,3)}***${pan.slice(-2)}`);

  // Store PID in the job so Express can kill it later if user clicks Stop
  try {
    await axios.post(`${API_URL}/jobs/${jobId}`, { pid: process.pid });
  } catch { /* non-fatal */ }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
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

      // ── CHECK FOR ERRORS BEFORE PROCEEDING ───────────────────────────────
      const earlyErr = await getErrorBanner(page);
      if (earlyErr) {
        await emitEvent(jobId, 'error', 'FAILED', `Validation error before form: ${earlyErr}`);
        await sleep(30000); await browser.close(); return;
      }

      // ═══════════════════════════════════════════════════════════════════
      //  BASIC DETAILS TAB
      // ═══════════════════════════════════════════════════════════════════
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

      // Continue to next tab
      console.log('[Action] Clicking Continue to Contact Details');
      await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue to Contact');
      await sleep(3000);

      // ═══════════════════════════════════════════════════════════════════
      //  CONTACT DETAILS TAB
      // ═══════════════════════════════════════════════════════════════════
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

      // Continue
      console.log('[Action] Clicking Continue to OTP verification');
      await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue to OTP');
      await sleep(4000);

      // ═══════════════════════════════════════════════════════════════════
      //  OTP GATE — Wait for human to submit OTP
      // ═══════════════════════════════════════════════════════════════════
      await emitEvent(jobId, 'info', 'OTP_GATE', 'OTP sent to registered mobile/email. Please enter OTP on the dashboard.');

      let otp = null;
      let otpAttempts = 0;
      const MAX_OTP_ATTEMPTS = 3;

      while (otpAttempts < MAX_OTP_ATTEMPTS) {
        otp = await pollForOtp(jobId);
        
        // Fill OTP — The portal uses individual digit boxes
        console.log(`[Action] Entering OTP: ${otp} (attempt ${otpAttempts + 1})`);
        try {
          // Try single OTP input field first
          const singleOtpInput = page.locator('input.otp-input, input[autocomplete="one-time-code"]').first();
          if (await singleOtpInput.isVisible({ timeout: 2000 })) {
            // Individual digit boxes — type into the first one and let the portal tab through
            const otpBoxes = await page.locator('input.otp-input, input[autocomplete="one-time-code"]').all();
            for (let i = 0; i < otpBoxes.length && i < otp.length; i++) {
              await otpBoxes[i].fill(otp[i]);
              await sleep(100);
            }
          } else {
            // Single field OTP
            const field = page.locator('input[formcontrolname="otp"], input[name="otp"]').first();
            await field.fill(otp, { timeout: 5000 });
          }
        } catch (e) {
          console.warn('[Warning] OTP fill failed:', e.message);
        }
        
        await sleep(500);
        
        // Click Validate / Submit OTP
        await safeClick(page.getByRole('button', { name: /validate|submit|verify|continue/i }).first(), 'Submit OTP');
        await sleep(4000);
        
        // Check for OTP error
        const otpErr = await getErrorBanner(page);
        if (otpErr && /invalid|incorrect|expired|wrong/i.test(otpErr)) {
          otpAttempts++;
          if (otpAttempts < MAX_OTP_ATTEMPTS) {
            await emitEvent(jobId, 'warn', 'OTP_GATE', `OTP attempt ${otpAttempts} failed: "${otpErr}". Resending OTP...`);
            // Clear the previous OTP from database so operator can submit fresh OTP
            await axios.post(`${API_URL}/jobs/${jobId}`, { suppliedOtp: null }).catch(() => {});
            // Click Resend OTP if available
            const resendBtn = page.getByRole('button', { name: /resend/i }).first();
            await safeClick(resendBtn, 'Resend OTP');
            await sleep(3000);
          } else {
            await emitEvent(jobId, 'error', 'FAILED', `OTP failed after ${MAX_OTP_ATTEMPTS} attempts. Manual intervention required.`);
            await sleep(60000); // Keep browser open for manual check
            await browser.close(); return;
          }
        } else {
          // OTP accepted!
          break;
        }
      }

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

    const otp = await pollForOtp(jobId);
    console.log('[Action] Entering login OTP');

    try {
      const otpBoxes = await page.locator('input.otp-input, input[autocomplete="one-time-code"]').all();
      if (otpBoxes.length > 0) {
        for (let i = 0; i < otpBoxes.length && i < otp.length; i++) {
          await otpBoxes[i].fill(otp[i]);
          await sleep(100);
        }
      } else {
        await safeFill(page.locator('input[formcontrolname="otp"]').first(), otp, 'Login OTP');
      }
      await safeClick(page.getByRole('button', { name: /validate|login|submit|continue/i }).first(), 'Submit login OTP');
      await sleep(4000);
    } catch (e) {
      console.warn('[Warning] Login OTP entry failed:', e.message);
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
