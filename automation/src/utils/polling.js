import { emitEvent } from './emitter.js';
import { sleep } from '../core/dom.js';
import { config } from '../core/config.js';
import { botGet, botPost } from './apiClient.js';

export const pollForOtp = async (jobId, page = null) => {
  console.log(`[Polling] Waiting for OTP on job ${jobId}...`);
  while (true) {
    try {
      const { data } = await botGet(`${config.API_URL}/jobs/${jobId}`);
      const job = data.job;

      if (page && job?.resendOtpRequested) {
        await clickPortalResend(page, jobId);
        await botPost(`${config.API_URL}/jobs/${jobId}`, {
          resendOtpRequested: false,
          suppliedOtp: null,
          lastOtpError: null,
        }).catch(() => {});
        await emitEvent(jobId, 'info', 'OTP_GATE', 'Resend OTP process completed. Waiting for new OTP...');
      }

      if (job?.suppliedOtp) {
        console.log(`[Polling] OTP received for job ${jobId}`);
        return job.suppliedOtp;
      }
    } catch (err) {
      console.error('[Polling Error]', err.message);
    }
    await sleep(1500);
  }
};

const clickPortalResend = async (page, jobId) => {
  await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Attempting to click "Resend OTP" link on portal...');
  
  const resend = page.locator('a, button, span, [role="button"]').filter({ hasText: /resend/i }).first();
  
  try {
    await resend.click({ timeout: 5000 });
    await emitEvent(jobId, 'info', 'OTP_GATE', '[Bot Action] Successfully clicked Resend OTP');
  } catch (e) {
    await emitEvent(jobId, 'warn', 'OTP_GATE', `[Bot Warning] Failed to click Resend OTP normally, trying JS click. Error: ${e.message}`);
    await resend.evaluate((el) => el.click()).catch(err => {
      emitEvent(jobId, 'warn', 'OTP_GATE', `[Bot Warning] JS Resend click also failed: ${err.message}`);
    });
  }
  
  await sleep(3000);
};

export const pollForCorrection = async (jobId, page) => {
  console.log(`[Polling] Waiting for user correction on dashboard for job ${jobId}...`);
  while (true) {
    if (page.isClosed()) throw new Error('Page closed during correction wait');

    try {
      const res = await botGet(`${config.API_URL}/jobs/${jobId}`);
      const job = res.data.job;
      if (job && job.status === 'REGISTERING' && !job.correctionMessage) {
        return job.registrationPayload;
      }
    } catch (e) {
      console.warn('[Polling Error] Could not check correction status:', e.message);
    }
    await sleep(3000);
  }
};

export const pollForAadhaarOtpChoice = async (jobId) => {
  console.log(`[Polling] Waiting for Aadhaar OTP choice on dashboard for job ${jobId}...`);
  while (true) {
    try {
      const { data } = await botGet(`${config.API_URL}/jobs/${jobId}`);
      const job = data.job;
      const choice = job?.registrationPayload?.aadhaarOtpChoice;
      if (choice && !job.correctionField) {
        console.log(`[Polling] Aadhaar OTP choice received: ${choice}`);
        return choice;
      }
    } catch (e) {
      console.warn('[Polling Error] Could not check Aadhaar OTP choice:', e.message);
    }
    await sleep(1500);
  }
};

export const setOtpError = async (jobId, message) => {
  await botPost(`${config.API_URL}/jobs/${jobId}`, {
    suppliedOtp: null,
    lastOtpError: message,
  }).catch(() => {});
};
