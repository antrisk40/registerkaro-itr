import axios from 'axios';
import { emitEvent } from '../utils/emitter.js';
import { safeClick, safeFill, sleep, getErrorBanner } from '../core/dom.js';
import { pollForCorrection } from '../utils/polling.js';
import { parseDob } from '../utils/parser.js';
import { config } from '../core/config.js';

export const handleRegisterGetStarted = async (page, context) => {
  console.log('[State] REGISTER_GET_STARTED');
  await emitEvent(context.jobId, 'info', 'REGISTERING', 'Starting registration flow...');

  if (config.IS_OTHERS) {
    await safeClick(page.getByRole('button', { name: 'Others', exact: true }).first(), 'Others tab');
    await sleep(1000);
    await safeClick(page.locator('mat-select').first(), 'Category dropdown');
    await sleep(600);
    await safeClick(
      page.locator('mat-option, .mat-mdc-option').filter({ hasText: new RegExp(config.TAXPAYER_CATEGORY, 'i') }).first(),
      `Option: ${config.TAXPAYER_CATEGORY}`
    );
    await sleep(1000);
  }

  await safeFill(page.locator('input[formcontrolname="pan"]').first(), context.pan, 'PAN');
  await sleep(1000);
  await safeClick(page.getByRole('button', { name: 'Validate', exact: false }), 'Validate');
  await sleep(4000);

  try {
    const yesRadio = page.getByRole('radio', { name: 'Yes', exact: false }).first();
    if (await yesRadio.isVisible({ timeout: 2000 })) {
      await safeClick(yesRadio, 'Yes radio');
      await sleep(1000);
    }
  } catch { /* ignore */ }

  await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue');
  await sleep(3000);

  try {
    const checkbox = page.getByRole('checkbox').first();
    if (await checkbox.isVisible({ timeout: 2000 })) {
      await checkbox.check({ timeout: 5000 });
      await sleep(500);
      await safeClick(page.getByRole('button', { name: 'Yes', exact: false }).first(), 'UIDAI Yes');
      await sleep(3000);
    }
  } catch { /* ignore */ }
};

export const handleRegBasicDetails = async (page, context) => {
  console.log('[State] REG_BASIC_DETAILS');
  await emitEvent(context.jobId, 'info', 'BASIC_DETAILS', 'Filling Basic Details...');

  const { regData } = context;

  await safeFill(page.locator('input[formcontrolname="lastName"], input[placeholder*="Last Name"]').first(), regData.lastName, 'Last Name');
  await sleep(400);

  if (regData.middleName) {
    await safeFill(page.locator('input[formcontrolname="middleName"]').first(), regData.middleName, 'Middle Name');
    await sleep(400);
  }

  if (regData.firstName) {
    await safeFill(page.locator('input[formcontrolname="firstName"]').first(), regData.firstName, 'First Name');
    await sleep(400);
  }

  // DOB
  await fillDateOfBirth(page, regData.dateOfBirth);
  await sleep(500);

  // Gender
  try {
    const genderSel = page.locator('mat-select[formcontrolname="gender"]').first();
    if (await genderSel.isVisible({ timeout: 1000 })) {
      await safeClick(genderSel, 'Gender dropdown');
      await sleep(600);
      await safeClick(page.locator('mat-option').filter({ hasText: new RegExp(`^${regData.gender}$`, 'i') }).first(), 'Gender option');
    }
  } catch { /* ignore */ }

  // Residential Status
  try {
    const resSel = page.locator('mat-select[formcontrolname="residentialStatus"]').first();
    if (await resSel.isVisible({ timeout: 1000 })) {
      await safeClick(resSel, 'Residential dropdown');
      await sleep(600);
      await safeClick(page.locator('mat-option').filter({ hasText: new RegExp(`^${regData.residentialStatus}$`, 'i') }).first(), 'Residential option');
    }
  } catch { /* ignore */ }

  await sleep(1000);
  await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue Basic Details');
  await sleep(3000);

  const basicErr = await getErrorBanner(page);
  if (basicErr) {
    await handleCorrection(page, context, 'CORRECTION_GATE', basicErr);
  }
};

export const handleRegContactDetails = async (page, context) => {
  console.log('[State] REG_CONTACT_DETAILS');
  await emitEvent(context.jobId, 'info', 'CONTACT_DETAILS', 'Filling Contact Details...');

  const { regData } = context;

  await safeFill(page.locator('input[formcontrolname="primaryMobile"]').first(), regData.mobile, 'Mobile');
  await sleep(400);

  try {
    const mobBelongs = page.locator('mat-select[formcontrolname="primaryMobileBelongsTo"]').first();
    if (await mobBelongs.isVisible({ timeout: 500 })) {
      await safeClick(mobBelongs, 'Mobile Belongs To');
      await sleep(600);
      await safeClick(page.locator('mat-option').filter({ hasText: new RegExp(`^${regData.mobileBelongsTo}$`, 'i') }).first(), 'Mobile Option');
    }
  } catch { /* ignore */ }

  await safeFill(page.locator('input[formcontrolname="primaryEmail"]').first(), regData.email, 'Email');
  await sleep(400);

  try {
    const emailBelongs = page.locator('mat-select[formcontrolname="primaryEmailBelongsTo"]').first();
    if (await emailBelongs.isVisible({ timeout: 500 })) {
      await safeClick(emailBelongs, 'Email Belongs To');
      await sleep(600);
      await safeClick(page.locator('mat-option').filter({ hasText: new RegExp(`^${regData.emailBelongsTo}$`, 'i') }).first(), 'Email Option');
    }
  } catch { /* ignore */ }

  // Address
  await safeFill(page.locator('input[formcontrolname="flat"]').first(), regData.flat, 'Flat');
  await safeFill(page.locator('input[formcontrolname="road"]').first(), regData.road, 'Road');
  await safeFill(page.locator('input[formcontrolname="pincode"]').first(), regData.pincode, 'Pincode');
  await sleep(1000); // Pincode auto-fills city/state

  await safeClick(page.getByRole('button', { name: 'Continue', exact: false }).first(), 'Continue Contact Details');
  await sleep(3000);

  const contactErr = await getErrorBanner(page);
  if (contactErr) {
    await handleCorrection(page, context, 'CORRECTION_GATE', contactErr);
  }
};

const handleCorrection = async (page, context, status, errorMsg) => {
  await emitEvent(context.jobId, 'warn', status, `Validation error: ${errorMsg}`);
  await axios.post(`${config.API_URL}/jobs/${context.jobId}`, {
    status,
    correctionMessage: errorMsg
  }).catch(() => {});
  
  const newPayload = await pollForCorrection(context.jobId, page);
  context.regData = { ...context.regData, ...newPayload };
  await emitEvent(context.jobId, 'info', 'INFO', 'Resuming with corrected details...');
};

const fillDateOfBirth = async (page, dobStr) => {
  const parsed = parseDob(dobStr);
  const dobInput = page.locator('input[formcontrolname="dateOfBirth"]').first();

  await dobInput.click({ timeout: 5000, noWaitAfter: true });
  await sleep(200);
  await dobInput.evaluate((el) => {
    el.removeAttribute('readonly');
    el.focus();
  });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await sleep(150);
  
  await dobInput.pressSequentially(parsed.formatted, { delay: 130 });
  await page.keyboard.press('Tab');
};
