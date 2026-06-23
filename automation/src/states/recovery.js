import { emitEvent } from '../utils/emitter.js';
import { safeClick, safeFill, sleep } from '../core/dom.js';

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

export const handleForgotPwdOtpChoice = async (page, context) => {
  console.log('[State] FORGOT_PASSWORD_OTP_CHOICE');

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', 'Auto-selecting "Generate OTP"...');

  // Strategy: use JS injection to find and click the "Generate OTP" radio
  // Angular Material radios need the inner <input type="radio"> clicked AND the
  // parent mat-radio-button to receive a click event for the binding to fire.
  const clicked = await page.evaluate(() => {
    // Find all mat-radio-button or [role="radio"] wrappers
    const wrappers = [...document.querySelectorAll('mat-radio-button, [role="radio"]')];

    // Find the one that contains "Generate OTP" text
    const target = wrappers.find(el =>
      /Generate OTP/i.test(el.textContent || '')
    ) || wrappers[wrappers.length - 1]; // fallback: last option

    if (!target) return false;

    // Click the inner radio input first
    const innerInput = target.querySelector('input[type="radio"]');
    if (innerInput) {
      innerInput.click();
      innerInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Also click the wrapper itself to trigger Angular's (click) binding
    target.click();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    return true;
  });

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Radio clicked via JS: ${clicked}`);
  await sleep(1500);

  // Force-enable the Continue button and click it (it may be visually disabled but Angular allows it)
  const continueBtnClicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    const cont = buttons.find(b =>
      /continue/i.test(b.textContent || '') && b.offsetParent !== null
    );
    if (!cont) return false;
    cont.removeAttribute('disabled');
    cont.classList.remove('mat-button-disabled');
    cont.click();
    return true;
  });

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Continue clicked via JS: ${continueBtnClicked}`);
  await sleep(3000);

  // UIDAI consent popup might appear
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


