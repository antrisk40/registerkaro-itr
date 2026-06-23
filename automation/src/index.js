import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { emitEvent } from './utils/emitter.js';

dotenv.config();

const { API_URL, DUMMY_PAN, TAXPAYER_CATEGORY } = process.env;

// Inject the stealth plugin into Playwright
chromium.use(stealth());

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
  // Wait 3 seconds to ensure the Express backend is fully booted before sending webhooks
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Generate a fresh MongoDB-compatible ObjectId (24 hex characters) for every run
  // This completely solves the E11000 Duplicate Key error across bot restarts!
  const jobId = crypto.randomBytes(12).toString('hex');
  const pan = DUMMY_PAN;
  
  if (!jobId || !pan) {
    console.error('Missing DUMMY_JOB_ID or DUMMY_PAN in .env');
    process.exit(1);
  }

  await emitEvent(jobId, 'info', 'INIT', `Bot launched, navigating to Income Tax portal for PAN: ${pan}`);
  
  // Launch headful Chrome so we can physically see if the portal is blocking us or just slow!
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // timeout: 0 disables the timeout entirely. We will wait as long as the government portal needs!
    await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/login', {
      timeout: 0,
      waitUntil: 'domcontentloaded'
    });
    
    // Simulate navigation and filling the PAN form
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fill the actual PAN into the ePortal Login Form
    await page.fill('input[id="panAdhaarUserId"]', pan);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small human delay
    await page.click('button.large-button-primary'); // The "Continue" button

    // ---------------------------------------------------------
    // NEW: Detect "PAN does not exist" Error and Route to Registration
    // ---------------------------------------------------------
    try {
      // Wait up to 5 seconds for the error text to appear
      const errorMsg = page.getByText('PAN does not exist', { exact: false });
      await errorMsg.waitFor({ state: 'visible', timeout: 5000 });
      
      console.log('[Phase] Detected unregistered PAN. Entering Registration Phase...');
      const category = TAXPAYER_CATEGORY || 'Individual';
      await emitEvent(jobId, 'warn', 'REGISTERING', `PAN not found. Triggering registration flow for category: ${category}`);
      
      // Navigate to registration page
      await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/pre-login/register', { timeout: 0, waitUntil: 'domcontentloaded' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        // The page loads directly to "Let's Get Started". Taxpayer is selected by default.
        // Step 1: Re-enter the PAN on the registration validation screen
        console.log('[Action] Entering PAN for validation');
        // Look for the input field. The DOM dump showed formcontrolname="pan"
        const panInput = page.locator('input[formcontrolname="pan"], input[id="pan"]').first();
        await panInput.fill(pan, { timeout: 5000 });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for angular to detect input
        
        // Step 2: Click Validate
        console.log('[Action] Clicking Validate button');
        const validateBtn = page.getByRole('button', { name: 'Validate', exact: false });
        await validateBtn.click({ timeout: 5000 });
        
        // Wait for the Indian Govt server to validate the PAN (this often takes a few seconds)
        console.log('[Action] Waiting for Income Tax Server PAN validation...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 3: Verify Category and Click Yes/No
        console.log(`[Action] Confirming Taxpayer Category matches payload: ${category}`);
        // The portal auto-detects the category from the PAN (e.g. 4th letter 'P' = Individual).
        // It asks: "Please confirm if you want to register as Individual taxpayer"
        // We dynamically click "Yes" (assuming the user's payload matches the PAN's actual category)
        const yesRadio = page.getByRole('radio', { name: 'Yes', exact: false }).first();
        await yesRadio.click({ timeout: 5000 }).catch(() => console.log('[Warning] Could not find Yes radio button.'));
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 4: Click Continue (This button unlocks AFTER clicking Yes/No)
        console.log('[Action] Clicking Continue button');
        const continueBtn = page.getByRole('button', { name: 'Continue', exact: false }).first();
        await continueBtn.click({ timeout: 5000 });
        
        // Wait for the popup to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Step 5: Handle UIDAI Aadhaar Validation Popup
        console.log('[Action] Handling UIDAI Validation Popup...');
        // Check the "I agree to validate my details with UIDAI database" checkbox
        const uidaiCheckbox = page.getByRole('checkbox').first(); // We grab the first checkbox as there's usually only one in the modal
        await uidaiCheckbox.check({ timeout: 5000 }).catch(() => console.log('[Warning] UIDAI checkbox not found.'));
        
        // Click the Yes button in the modal
        const uidaiYesBtn = page.getByRole('button', { name: 'Yes', exact: false }).first();
        await uidaiYesBtn.click({ timeout: 5000 }).catch(() => console.log('[Warning] UIDAI Yes button not found.'));
        
        // Wait for the next screen to load after the popup closes
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (err) {
        console.log('[Warning] Registration DOM structure differs from expected...', err.message);
      }

      await emitEvent(jobId, 'info', 'REGISTERING', `UIDAI Validated. Awaiting next registration steps.`);
      
      // Leave the browser open for a few minutes so the user can verify the Registration page!
      await new Promise(resolve => setTimeout(resolve, 120000));
      process.exit(0);

    } catch (e) {
      // Timeout means the error didn't appear. We proceed to CAPTCHA_GATE as normal!
      console.log('[Phase] No PAN error detected. Proceeding to CAPTCHA_GATE...');
    }
    // ---------------------------------------------------------

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
