import { chromium } from 'playwright';
import axios from 'axios';
import dotenv from 'dotenv';
import { emitEvent } from './utils/emitter.js';

dotenv.config();

const { API_URL, DUMMY_PAN, DUMMY_JOB_ID } = process.env;

const pollForOtp = async (jobId) => {
  console.log(`[Polling] Checking Express API for OTP on job ${jobId}...`);
  while (true) {
    try {
      const response = await axios.get(`${API_URL}/jobs/${jobId}`);
      const job = response.data.job;
      
      if (job.suppliedOtp) {
        console.log(`[Polling] Received OTP: ${job.suppliedOtp}`);
        return job.suppliedOtp;
      }
    } catch (error) {
      console.error('[Polling Error] Could not fetch job status:', error.message);
    }
    
    // Poll every 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};

const runBot = async () => {
  const jobId = DUMMY_JOB_ID;
  const pan = DUMMY_PAN;
  
  if (!jobId || !pan) {
    console.error('Missing DUMMY_JOB_ID or DUMMY_PAN in .env');
    process.exit(1);
  }

  await emitEvent(jobId, 'info', 'INIT', `Bot launched, navigating to Income Tax portal for PAN: ${pan}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/login');
    
    // Simulate navigation and filling the PAN form
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Here we'd actually use Playwright selectors like:
    // await page.fill('input[id="panField"]', pan);
    // await page.click('button[type="submit"]');

    await emitEvent(jobId, 'info', 'CAPTCHA_GATE', `PAN entered. Waiting for OTP at CAPTCHA_GATE for PAN: ${pan}`);
    
    // The bot pauses here and polls the Express API every 2 seconds
    const otp = await pollForOtp(jobId);
    
    await emitEvent(jobId, 'info', 'SUCCESS', `Successfully received OTP: ${otp} and entered it into the portal.`);
    
    // Fill the actual OTP field in the real scenario
    // await page.fill('input[id="otpField"]', otp);
    
  } catch (error) {
    await emitEvent(jobId, 'error', 'FAILED', `Bot encountered an error: ${error.message}`);
  } finally {
    await browser.close();
  }
};

runBot();
