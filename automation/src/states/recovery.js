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

  // If we already applied this successfully, the page should navigate away.
  // If we're still here, reset the flag and retry — don't deadlock with a sleep.
  if (context.aadhaarOtpChoiceApplied) {
    console.log('[OtpChoice] Flag was set but still on this screen — resetting and retrying...');
    context.aadhaarOtpChoiceApplied = false;
    await sleep(1000);
  }

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', 'Auto-selecting "Generate OTP" (2nd radio)...');

  // ── Step 1: Click the LABEL of the 2nd mat-radio-button ──────────────────
  // Angular Material registers clicks on the <label> wrapping the radio circle.
  // Clicking the hidden inner <input> doesn't trigger Angular FormControl update.
  let radioClicked = false;
  try {
    const radioButtons = page.locator('mat-radio-button');
    const radioCount = await radioButtons.count();
    console.log(`[OtpChoice] Found ${radioCount} mat-radio-button(s)`);

    // 2nd radio = "Generate OTP"; fall back to last if only 1 exists
    const targetIdx = Math.min(1, radioCount - 1);
    const targetRadio = radioButtons.nth(targetIdx);

    // Prefer clicking the <label> — this is what Angular's (click) binding reacts to
    const label = targetRadio.locator('label');
    if (await label.count() > 0) {
      await label.first().click({ timeout: 6000 });
      console.log('[OtpChoice] Clicked <label> of 2nd radio');
    } else {
      await targetRadio.click({ timeout: 6000 });
      console.log('[OtpChoice] Clicked mat-radio-button wrapper directly');
    }
    radioClicked = true;
  } catch (e) {
    console.warn('[OtpChoice] Label click failed, trying text-match fallback:', e.message);
    try {
      const generateRadio = page.locator('mat-radio-button').filter({ hasText: /generate otp/i });
      if (await generateRadio.count() > 0) {
        const lbl = generateRadio.first().locator('label');
        if (await lbl.count() > 0) {
          await lbl.first().click({ timeout: 5000 });
        } else {
          await generateRadio.first().click({ timeout: 5000 });
        }
        radioClicked = true;
        console.log('[OtpChoice] Text-match fallback radio click succeeded');
      }
    } catch (e2) {
      console.warn('[OtpChoice] All radio strategies failed:', e2.message);
    }
  }

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Radio clicked: ${radioClicked} — waiting for Continue to enable...`);

  // ── Step 2: Wait up to 4s for Angular to enable Continue, then click ──────
  const continueBtn = page.getByRole('button', { name: /continue/i }).first();
  let continueClicked = false;

  for (let i = 0; i < 8; i++) {
    await sleep(500);
    const enabled = await continueBtn.isEnabled({ timeout: 300 }).catch(() => false);
    if (enabled) {
      try {
        await continueBtn.click({ timeout: 5000 });
        continueClicked = true;
        console.log('[OtpChoice] Continue clicked after being enabled by Angular');
      } catch (e) {
        console.warn('[OtpChoice] Click on enabled Continue threw:', e.message);
      }
      break;
    }
  }

  if (!continueClicked) {
    // Button stayed disabled — strip Angular disabled attributes and force-submit
    console.warn('[OtpChoice] Continue never became enabled — force-submitting via JS...');
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const cont = btns.find(b => /continue/i.test((b.textContent || '').trim()));
      if (cont) {
        cont.removeAttribute('disabled');
        cont.removeAttribute('aria-disabled');
        cont.classList.remove(
          'mat-button-disabled',
          'mat-mdc-button-disabled',
          'mdc-button--disabled'
        );
        cont.click();
        continueClicked = true;
      }
    });
  }

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Continue action done (clicked=${continueClicked}) — waiting for UIDAI consent popup...`);
  await sleep(3000);

  await handleUidaiConsentPopup(page);
  context.aadhaarOtpChoiceApplied = true;
};
