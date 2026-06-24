import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { emitEvent } from './utils/emitter.js';
import { config } from './core/config.js';
import { sleep } from './core/dom.js';
import { STATES, determineState } from './core/stateEvaluator.js';

import { handleUnknownState, handleLoginPage } from './states/login.js';
import { handleRegBasicDetails, handleRegContactDetails, handleRegisterGetStarted } from './states/registration.js';
import { handleForgotPwdMethod, handleForgotPwdOtpChoice, handleForgotPwdPan } from './states/recovery.js';
import { handleOtpVerification, handleSetPassword } from './states/shared.js';
import { botPatch } from './utils/apiClient.js';

chromium.use(stealth());

const executeState = async (page, state, context) => {
  switch (state) {
    case STATES.UNKNOWN:
      await handleUnknownState(page, context);
      break;
    case STATES.LOGIN_PAGE:
      await handleLoginPage(page, context);
      break;
    case STATES.LOGIN_PASSWORD_PAGE:
      // In this specific flow, if we hit the password page, it means the PAN exists and we should 
      // pivot to forgot password because we don't know their password.
      await emitEvent(context.jobId, 'warn', 'ALREADY_EXISTS', `PAN ${context.pan} is registered. Pivoting to Forgot Password.`);
      
      // Reset the forgot-password context flags since we are starting over
      context.aadhaarOtpChoiceApplied = false;
      context.unknownCount = 0;
      
      try {
        const forgotPwdLink = page.getByRole('link', { name: /Forgot Password/i }).first();
        if (await forgotPwdLink.isVisible({ timeout: 5000 })) {
           await forgotPwdLink.click();
           await sleep(3000);
        } else {
           await page.goto('https://eportal.incometax.gov.in/iec/foservices/#/pre-login/forgot-password', {
             timeout: 0, waitUntil: 'domcontentloaded'
           });
           await sleep(2500);
        }
      } catch (e) {
        console.warn('Failed to click Forgot Password link:', e.message);
      }
      break;
    case STATES.REGISTER_GET_STARTED:
      await handleRegisterGetStarted(page, context);
      break;
    case STATES.REG_BASIC_DETAILS:
      await handleRegBasicDetails(page, context);
      break;
    case STATES.REG_CONTACT_DETAILS:
      await handleRegContactDetails(page, context);
      break;
    case STATES.REG_OTP:
      await handleOtpVerification(page, context);
      break;
    case STATES.SET_PASSWORD:
      await handleSetPassword(page, context);
      break;
    case STATES.FORGOT_PASSWORD_PAN:
      await handleForgotPwdPan(page, context);
      break;
    case STATES.FORGOT_PASSWORD_METHOD:
      await handleForgotPwdMethod(page, context);
      break;
    case STATES.FORGOT_PASSWORD_OTP_CHOICE:
      await handleForgotPwdOtpChoice(page, context);
      break;
    case STATES.SUCCESS:
    case STATES.DASHBOARD:
      await emitEvent(context.jobId, 'info', 'SUCCESS', '✅ Bot finished successfully.');
      context.isFinished = true;
      break;
    default:
      console.log(`[State] Unhandled state: ${state}`);
      await sleep(3000);
  }
};

const runBotStateMachine = async () => {
  await sleep(3000); // Wait for express to boot

  const jobId = config.JOB_ID || config.DUMMY_JOB_ID;
  const pan = config.TARGET_PAN || config.DUMMY_PAN;
  const { regData } = config;

  if (!pan || !jobId) {
    console.error('Missing PAN or JOB_ID. Exiting.');
    process.exit(1);
  }

  await emitEvent(jobId, 'info', 'INIT', `Bot launched for PAN: ${pan.slice(0,3)}***${pan.slice(-2)} (State Machine Mode)`);

  const browser = await chromium.launch({ headless: false });
  const browserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await browserContext.newPage();

  // The context object tracks state across iterations
  const context = {
    pan,
    jobId,
    regData,
    otpAttempts: 0,
    isFinished: false
  };

  while (!context.isFinished) {
    try {
      const currentState = await determineState(page, context);
      console.log(`=== Evaluating State: ${currentState} ===`);
      
      await executeState(page, currentState, context);
      
    } catch (err) {
      const msg = err.message;
      const isRecoverable = msg.includes('Execution context was destroyed') || 
                            msg.includes('Target closed') || 
                            msg.includes('navigated') ||
                            msg.includes('Timeout'); // Catch Playwright timeouts!
                             
      if (isRecoverable) {
        console.warn(`⚠️ Recoverable error in state machine: ${msg}. Stabilizing and retrying...`);
        await emitEvent(jobId, 'warn', 'INFO', 'Page transitioning or reloading. Bot is re-evaluating state to resume...');
        await sleep(4000); // Give the portal time to finish transitioning
        continue; // Restart the loop!
      } else {
        console.error('Fatal crash inside state machine:', err);
        await emitEvent(jobId, 'error', 'FAILED', `Fatal Bot Crash: ${err.message}`);
        await botPatch(`${config.API_URL}/jobs/${jobId}`, {
          status: 'FAILED',
          outcomeMessage: `Bot crashed: ${err.message}`
        }).catch(() => {});
        break; // Exit the loop
      }
    }
  }

  console.log('Bot shutting down.');
  await sleep(60000); // Keep browser open for inspection
  try { await browser.close(); } catch { }
};

runBotStateMachine().catch(err => {
  console.error('Uncaught fatal error:', err);
  process.exit(1);
});
