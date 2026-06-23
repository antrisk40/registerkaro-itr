import { emitEvent } from '../utils/emitter.js';
import { safeFill, safeClick, sleep } from '../core/dom.js';

export const handleUnknownState = async (page, context) => {
  console.log('[State] UNKNOWN state. Navigating to login...');
  await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/login', {
    timeout: 0, waitUntil: 'domcontentloaded'
  });
  await sleep(2500);
};

export const handleLoginPage = async (page, context) => {
  console.log('[State] LOGIN_PAGE');
  
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
