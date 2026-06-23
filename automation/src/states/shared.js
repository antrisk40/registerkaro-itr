import axios from 'axios';
import { emitEvent } from '../utils/emitter.js';
import { pollForOtp, setOtpError } from '../utils/polling.js';
import { safeClick, sleep, unlockPageScroll, lockPageScroll, blurActiveElement, dispatchInputEvents, getErrorBanner } from '../core/dom.js';
import { config } from '../core/config.js';

export const handleOtpVerification = async (page, context) => {
  console.log('[State] REG_OTP');
  const maxAttempts = 3;
  
  if (context.otpAttempts >= maxAttempts) {
    throw new Error(`OTP failed after ${maxAttempts} attempts.`);
  }

  const message = context.otpMessage || 'OTP sent. Please enter it on the dashboard.';
  await emitEvent(context.jobId, 'info', 'OTP_GATE', message);
  await axios.post(`${config.API_URL}/jobs/${context.jobId}`, { lastOtpError: null }).catch(() => {});

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
      await axios.post(`${config.API_URL}/jobs/${context.jobId}`, { lastOtpError: null, suppliedOtp: null }).catch(() => {});
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

export const handleSetPassword = async (page, context) => {
  console.log('[State] SET_PASSWORD');
  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', 'OTP verified. Setting up account password...');

  const tempPassword = 'Karo@2024!';
  const newPwdInput = page.locator('input[formcontrolname="password"], input[type="password"]').first();
  const confirmPwdInput = page.locator('input[formcontrolname="confirmPassword"], input[formcontrolname="reenterPassword"]').first();

  await fillPasswordField(newPwdInput, tempPassword);
  await sleep(400);
  await fillPasswordField(confirmPwdInput, tempPassword);
  await sleep(800);

  await safeClick(
    page.getByRole('button', { name: /Submit|Continue|Reset|Update/i }).first(),
    'Submit Password'
  );
  await sleep(5000); // Give portal time to respond
};

export const fillPasswordField = async (locator, password) => {
  await locator.click({ timeout: 5000 });
  await locator.fill('');
  await locator.pressSequentially(password, { delay: 80 });
  await dispatchInputEvents(locator);
};
