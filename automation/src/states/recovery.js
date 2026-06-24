import { emitEvent } from '../utils/emitter.js';
import { safeClick, safeFill, sleep } from '../core/dom.js';
import { pollForAadhaarOtpChoice } from '../utils/polling.js';
import { config } from '../core/config.js';
import { botPatch } from '../utils/apiClient.js';

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

const DEFAULT_AADHAAR_OTP_OPTIONS = ['I already have an OTP', 'Generate OTP'];

const readOtpChoiceOptions = async (page) => {
  const options = await page.evaluate(() =>
    [...document.querySelectorAll('mat-radio-button, [role="radio"]')]
      .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );
  return options.length >= 2 ? options : DEFAULT_AADHAAR_OTP_OPTIONS;
};

const clickOtpChoice = async (page, choice) => {
  const clicked = await page.evaluate((choiceText) => {
    const wrappers = [...document.querySelectorAll('mat-radio-button, [role="radio"]')];
    const normalized = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetChoice = normalized(choiceText);

    const target = wrappers.find(el => normalized(el.textContent).includes(targetChoice))
      || wrappers.find(el => /generate otp/i.test(el.textContent || '') && /generate/i.test(targetChoice))
      || wrappers.find(el => /already have/i.test(el.textContent || '') && /already/i.test(targetChoice))
      || wrappers[wrappers.length - 1];

    if (!target) return false;

    const innerInput = target.querySelector('input[type="radio"]');
    if (innerInput) {
      innerInput.click();
      innerInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    target.click();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }, choice);

  return clicked;
};

const clickContinueOnPortal = async (page) =>
  page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, [role="button"]')];
    const cont = buttons.find(b => /continue/i.test(b.textContent || '') && b.offsetParent !== null);
    if (!cont) return false;
    cont.removeAttribute('disabled');
    cont.classList.remove('mat-button-disabled');
    cont.click();
    return true;
  });

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

  if (context.aadhaarOtpChoiceApplied) {
    await sleep(2000);
    return;
  }

  if (context.regData?.aadhaarOtpChoice) {
    const choice = context.regData.aadhaarOtpChoice;
    await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Applying selected option: "${choice}"`);
    const clicked = await clickOtpChoice(page, choice);
    await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Radio clicked via JS: ${clicked}`);
    await sleep(1500);
    const continueBtnClicked = await clickContinueOnPortal(page);
    await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Continue clicked via JS: ${continueBtnClicked}`);
    await sleep(3000);
    await handleUidaiConsentPopup(page);
    delete context.regData.aadhaarOtpChoice;
    context.aadhaarOtpChoiceApplied = true;
    return;
  }

  const options = await readOtpChoiceOptions(page);
  const message = 'Aadhaar OTP required. Do you want to generate a new OTP or use an existing one?';

  await emitEvent(context.jobId, 'info', 'CORRECTION_GATE', message);
  await botPatch(`${config.API_URL}/jobs/${context.jobId}`, {
    status: 'CORRECTION_GATE',
    correctionMessage: message,
    correctionField: 'aadhaarOtpChoice',
    correctionOptions: options,
  }).catch(() => {});

  const choice = await pollForAadhaarOtpChoice(context.jobId);
  context.regData = { ...context.regData, aadhaarOtpChoice: choice };

  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `User selected: "${choice}" — continuing on portal...`);

  const clicked = await clickOtpChoice(page, choice);
  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Radio clicked via JS: ${clicked}`);
  await sleep(1500);

  const continueBtnClicked = await clickContinueOnPortal(page);
  await emitEvent(context.jobId, 'info', 'ACCOUNT_RECOVERY', `Continue clicked via JS: ${continueBtnClicked}`);
  await sleep(3000);

  await handleUidaiConsentPopup(page);
  delete context.regData.aadhaarOtpChoice;
  context.aadhaarOtpChoiceApplied = true;
};


