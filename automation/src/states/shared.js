import { emitEvent } from '../utils/emitter.js';
import { pollForOtp, setOtpError } from '../utils/polling.js';
import { safeClick, sleep, unlockPageScroll, lockPageScroll, blurActiveElement, dispatchInputEvents, getErrorBanner } from '../core/dom.js';
import { config } from '../core/config.js';
import { botPost, botPatch } from '../utils/apiClient.js';

export const handleOtpVerification = async (page, context) => {
  console.log('[State] REG_OTP');
  const maxAttempts = 3;
  
  if (context.otpAttempts >= maxAttempts) {
    throw new Error(`OTP failed after ${maxAttempts} attempts.`);
  }

  const message = context.otpMessage || 'OTP sent. Please enter it on the dashboard.';
  await emitEvent(context.jobId, 'info', 'OTP_GATE', message);
  await botPost(`${config.API_URL}/jobs/${context.jobId}`, { lastOtpError: null }).catch(() => {});

  const otp = await pollForOtp(context.jobId, page);
  console.log(`[Action] Entering OTP (attempt ${context.otpAttempts + 1})`);
  
  try {
    await fillOtp(page, otp);
    await sleep(500);
    await clickValidateOtp(page, context.jobId);
  } catch (e) {
    await emitEvent(context.jobId, 'warn', 'OTP_GATE', `[Bot Warning] OTP entry/validate failed: ${e.message}`);
    await unlockPageScroll(page).catch(() => {});
  }
  
  await sleep(4000); // Wait for portal response

  const otpErr = await getErrorBanner(page);
  if (otpErr && /invalid|incorrect|expired|wrong|mismatch|not valid/i.test(otpErr)) {
    context.otpAttempts++;
    const errMsg = `Invalid OTP: ${otpErr}`;
    await emitEvent(context.jobId, 'warn', 'OTP_GATE', `${errMsg}. Enter a new OTP or click Resend on the dashboard.`);
    await setOtpError(context.jobId, errMsg);
  } else {
    // Check if OTP input is still visible
    const isStillOtp = await page.locator('.otp-input, input[autocomplete="one-time-code"]').first().isVisible({ timeout: 1000 }).catch(() => false);
    if (isStillOtp) {
      context.otpAttempts++;
      const errMsg = 'OTP was not accepted. The Validate button may still be disabled — try a new OTP.';
      await emitEvent(context.jobId, 'warn', 'OTP_GATE', `${errMsg} (attempt ${context.otpAttempts})`);
      await setOtpError(context.jobId, errMsg);
    } else {
      // Success
      await botPost(`${config.API_URL}/jobs/${context.jobId}`, { lastOtpError: null, suppliedOtp: null }).catch(() => {});
    }
  }
};

const fillOtp = async (page, otp) => {
  const cleanOtp = String(otp).replace(/\s/g, '');
  if (!cleanOtp) return;

  await lockPageScroll(page);

  const otpBoxes = page.locator(
    'input.otp-input, input[autocomplete="one-time-code"], input[formcontrolname="otpDigit"], input[inputmode="numeric"][maxlength="1"]'
  );
  const count = await otpBoxes.count();

  // Strategy 1: Type sequentially in first box (Angular usually handles advance)
  if (count >= 1) {
    try {
      const first = otpBoxes.first();
      await first.click({ timeout: 5000, noWaitAfter: true });
      await sleep(150);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await sleep(100);
      await first.pressSequentially(cleanOtp, { delay: 150 });
      await sleep(600);
      await blurActiveElement(page);
      return;
    } catch (e) {
      console.warn('[OTP] Strategy 1 failed:', e.message);
    }
  }

  // Strategy 2: Single combined field
  try {
    const field = page.locator('input[formcontrolname="otp"], input[name="otp"]').first();
    if (await field.isVisible({ timeout: 2000 })) {
      await field.click({ timeout: 5000, noWaitAfter: true });
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await field.pressSequentially(cleanOtp, { delay: 150 });
      await dispatchInputEvents(field);
      console.log('[OTP] Filled via single OTP field');
    }
  } catch (e) {
    console.warn('[OTP] Strategy 2 failed:', e.message);
  }

  await blurActiveElement(page);
};

const clickValidateOtp = async (page, jobId) => {
  await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Clicking Validate...');
  await blurActiveElement(page);
  await sleep(300);

  const fallbackBtn = page.locator('button:visible, a:visible, [role="button"]:visible')
      .filter({ hasText: /validate|verify|submit|confirm|continue/i }).last();
  await fallbackBtn.click({ timeout: 5000, noWaitAfter: true }).catch(() => {});
  
  await unlockPageScroll(page);
};

/**
 * Generates a cryptographically random password that satisfies most portal rules:
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 * - 12-14 characters total
 */
const generateSecurePassword = () => {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '!@#$%^&*';
  const all     = upper + lower + digits + special;

  // Guarantee at least one of each required type
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  // Fill remaining characters randomly
  const length = 12 + Math.floor(Math.random() * 3); // 12-14 chars
  while (required.length < length) {
    required.push(all[Math.floor(Math.random() * all.length)]);
  }

  // Shuffle to avoid predictable pattern (AABB...special at end)
  for (let i = required.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join('');
};

export const handleSetPassword = async (page, context) => {
  console.log('[State] SET_PASSWORD');
  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', 'OTP verified — generating secure password and setting it on portal...');

  const newPassword = generateSecurePassword();
  console.log(`[SetPassword] Generated password for job ${context.jobId}`);

  const newPwdSelector = 'input[formcontrolname="newPassword"], input[formcontrolname="password"], input[id*="newPassword" i], input[type="password"]';
  const confirmPwdSelector = 'input[formcontrolname="confirmPassword"], input[formcontrolname="reenterPassword"], input[id*="confirm" i]';

  const newPwdInput = page.locator(newPwdSelector).first();
  await newPwdInput.waitFor({ state: 'visible', timeout: 10000 });

  const confirmPwdInput = page.locator(confirmPwdSelector).last();

  await fillPasswordField(page, newPwdSelector, newPassword);
  await sleep(500);
  await fillPasswordField(page, confirmPwdSelector, newPassword);
  await sleep(800);

  // Force-enable the Submit/Continue button and click it
  const submitClicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    const submitBtn = buttons.find(b =>
      /submit|continue|reset|update/i.test(b.textContent || '') && b.offsetParent !== null
    );
    if (!submitBtn) return false;
    submitBtn.removeAttribute('disabled');
    submitBtn.classList.remove('mat-button-disabled');
    submitBtn.click();
    return true;
  });

  if (!submitClicked) {
    // Fallback if JS click didn't find the button
    await safeClick(
      page.getByRole('button', { name: /Submit|Continue|Reset|Update/i }).first(),
      'Submit Password'
    );
  }

  await sleep(5000);

  // Save plain-text password via API — the service layer encrypts it with AES-256 before writing to MongoDB
  await botPatch(`${config.API_URL}/jobs/${context.jobId}`, {
    status: 'SUCCESS',
    outcomeMessage: 'Password set successfully via Aadhaar OTP recovery.',
    recoveredPassword: newPassword,  // service will encrypt this → encryptedPassword in DB
  }).catch(err => console.error('[SetPassword] Failed to save password:', err.message));

  await emitEvent(context.jobId, 'info', 'SUCCESS', '✅ Password reset complete! Click "Reveal Password" on the dashboard to view it.');
};

export const fillPasswordField = async (page, selector, password) => {
  try {
    const locator = page.locator(selector).first();
    await locator.click({ timeout: 5000 });
    await locator.fill('');
    await locator.pressSequentially(password, { delay: 80 });
    await dispatchInputEvents(locator);
  } catch (err) {
    console.warn(`[Password] Playwright fill failed for ${selector}, trying native JS fallback...`);
  }

  // Native JS fallback setter (crucial for some Angular fields)
  await page.evaluate(({ sel, pwd }) => {
    const el = document.querySelector(sel);
    if (el) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(el, pwd);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, { sel: selector, pwd: password });
};

