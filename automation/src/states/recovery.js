import { emitEvent } from '../utils/emitter.js';
import { safeClick, safeFill, sleep } from '../core/dom.js';
import { config } from '../core/config.js';

export const handleForgotPwdPan = async (page, context) => {
  console.log('[State] FORGOT_PASSWORD_PAN');
  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', 'Verifying PAN on Forgot Password screen...');
  
  const panInputs = page.locator('input[formcontrolname*="pan" i], input[formcontrolname*="user" i], input[id*="pan" i], input[id*="user" i], input[placeholder*="User ID" i], input[placeholder*="PAN" i]');
  await panInputs.first().waitFor({ state: 'attached', timeout: 10000 });
  
  let visiblePanInput = panInputs.first();
  const count = await panInputs.count();
  for (let i = 0; i < count; i++) {
    if (await panInputs.nth(i).isVisible()) {
      visiblePanInput = panInputs.nth(i);
      break;
    }
  }

  const currentPanValue = await visiblePanInput.inputValue();
  if (!currentPanValue || currentPanValue.toUpperCase() !== context.pan.toUpperCase()) {
    try {
      await visiblePanInput.click({ timeout: 3000, noWaitAfter: true });
      await sleep(200);
      await visiblePanInput.evaluate((el, { pan }) => {
        el.removeAttribute('readonly');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, pan);
        else el.value = pan;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: pan }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }, { pan: context.pan });
      await sleep(1000);
    } catch (e) {
      console.warn('[Recovery] Native setter failed, falling back:', e.message);
      await safeFill(visiblePanInput, context.pan, 'PAN for recovery fallback');
      await sleep(1000);
    }
  }
  
  const continueBtn = page.getByRole('button', { name: 'Continue', exact: false }).first();
  if (await continueBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
    await safeClick(continueBtn, 'Continue');
  } else {
    // Force click if disabled flag is an Angular visual thing
    await continueBtn.evaluate(el => el.click()).catch(() => {});
  }
  
  await sleep(4000);
};

export const handleForgotPwdMethod = async (page, context) => {
  console.log('[State] FORGOT_PASSWORD_METHOD');
  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', 'Selecting "OTP on mobile registered with Aadhaar"...');
  
  const aadhaarRadio = page.locator('mat-radio-button, [role="radio"]').filter({
    hasText: /OTP on mobile number registered with Aadhaar|Aadhaar OTP/i,
  }).first();
  
  await aadhaarRadio.click({ timeout: 8000 });
  await sleep(1000);
  await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue (Recovery Method)');
  await sleep(3000);
};

const handleUidaiConsentPopup = async (page) => {
  try {
    const checkbox = page.getByRole('checkbox').first();
    if (await checkbox.isVisible({ timeout: 4000 })) {
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
  } catch { /* ignore */ }
};

export const handleForgotPwdOtpChoice = async (page, context) => {
  console.log('[State] FORGOT_PASSWORD_OTP_CHOICE');

  // If we already applied this choice, the state evaluator should NOT be sending
  // us here again (context guard in stateEvaluator). If it somehow did anyway
  // (e.g. initial loop before flag was set), just wait for page to settle.
  // NEVER reset the flag — resetting causes an infinite retry loop.
  if (context.aadhaarOtpChoiceApplied) {
    console.log('[OtpChoice] Already applied — unexpected re-entry. Waiting for page to settle...');
    await sleep(3000);
    return;
  }

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', 'Auto-selecting "Generate OTP" (2nd radio)...');

  // ── Step 1: Vigorously select the "Generate OTP" option ──────────────────
  // Angular Material can be stubborn. We try multiple native and JS strategies.
  let radioClicked = false;
  
  // Strategy A: Find the label text directly and click it (most reliable for real browsers)
  try {
    const textEl = page.locator('label').filter({ hasText: /Generate OTP/i }).first();
    if (await textEl.isVisible({ timeout: 2000 })) {
      await textEl.click({ timeout: 5000 });
      radioClicked = true;
      console.log('[OtpChoice] Strategy A (label text) succeeded');
    }
  } catch (e) {
    console.warn('[OtpChoice] Strategy A failed:', e.message);
  }

  // Strategy B: Click the mat-radio-button container directly
  if (!radioClicked) {
    try {
      const radioBtn = page.locator('mat-radio-button, [role="radio"]').filter({ hasText: /Generate/i }).first();
      if (await radioBtn.isVisible({ timeout: 2000 })) {
        await radioBtn.click({ timeout: 5000 });
        radioClicked = true;
        console.log('[OtpChoice] Strategy B (mat-radio-button) succeeded');
      }
    } catch (e) {
      console.warn('[OtpChoice] Strategy B failed:', e.message);
    }
  }

  // Strategy C: Brute-force JS click on the element
  if (!radioClicked) {
    try {
      await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('mat-radio-button, label'));
        const target = els.find(el => /Generate OTP/i.test(el.innerText || el.textContent));
        if (target) {
          target.click();
          // Dispatch change event to trigger Angular forms
          const input = target.querySelector('input');
          if (input) {
            input.click();
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      });
      radioClicked = true;
      console.log('[OtpChoice] Strategy C (JS brute-force) executed');
    } catch (e) {
      console.warn('[OtpChoice] Strategy C failed:', e.message);
    }
  }

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Radio clicked: ${radioClicked} — clicking Continue...`);

  // ── Step 2: Sleep briefly for Angular to process, then click Continue ────
  await sleep(1500);
  const continueBtn = page.getByRole('button', { name: /continue/i }).first();

  try {
    await continueBtn.click({ timeout: 5000 });
    console.log('[OtpChoice] Continue clicked');
  } catch (e) {
    // Force-click if Angular still shows it as disabled
    console.warn('[OtpChoice] Normal click failed, force-clicking via JS:', e.message);
    await page.evaluate(() => {
      const cont = [...document.querySelectorAll('button')]
        .find(b => /continue/i.test((b.textContent || '').trim()));
      if (cont) {
        cont.removeAttribute('disabled');
        cont.removeAttribute('aria-disabled');
        cont.classList.remove('mat-button-disabled', 'mat-mdc-button-disabled', 'mdc-button--disabled');
        cont.click();
      }
    });
  }

  await sleep(3000);

  await handleUidaiConsentPopup(page);
  context.aadhaarOtpChoiceApplied = true;
};
