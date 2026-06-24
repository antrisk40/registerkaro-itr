import { emitEvent } from '../utils/emitter.js';
import { safeFill, safeClick, sleep } from '../core/dom.js';

export const handleUnknownState = async (page, context) => {
  console.log('[State] UNKNOWN state. Waiting for page to settle...');
  await sleep(3000);

  // If we are stuck in an unknown state for ~15 seconds, then reset to login
  context.unknownCount = (context.unknownCount || 0) + 1;
  if (context.unknownCount > 5) {
    console.log('[State] Stuck in UNKNOWN state. Resetting flow to login...');
    context.aadhaarOtpChoiceApplied = false;
    context.unknownCount = 0;
    await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/login', {
      timeout: 0, waitUntil: 'domcontentloaded'
    });
    await sleep(2500);
  }
};

export const handleLoginPage = async (page, context) => {
  console.log('[State] LOGIN_PAGE');
  
  // Clear forgot password state flags since we are at the beginning
  context.aadhaarOtpChoiceApplied = false;
  context.unknownCount = 0;

  const panInputs = page.locator('input[id="panAdhaarUserId"]');
  await panInputs.first().waitFor({ state: 'attached', timeout: 10000 });
  
  let visiblePanInput = panInputs.first();
  const count = await panInputs.count();
  for (let i = 0; i < count; i++) {
    if (await panInputs.nth(i).isVisible()) {
      visiblePanInput = panInputs.nth(i);
      break;
    }
  }

  await safeFill(visiblePanInput, context.pan, 'PAN input on Login');
  await sleep(500);
  await safeClick(page.locator('button.large-button-primary').first(), 'Continue');
  await sleep(4000); // Give portal time to respond (might transition to PASSWORD, REGISTER, or FORGOT_PASSWORD)
};
