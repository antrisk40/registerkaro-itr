export const STATES = {
  UNKNOWN: 'UNKNOWN',
  LOGIN_PAGE: 'LOGIN_PAGE',
  LOGIN_PASSWORD_PAGE: 'LOGIN_PASSWORD_PAGE',
  DASHBOARD: 'DASHBOARD',
  REGISTER_GET_STARTED: 'REGISTER_GET_STARTED',
  REG_BASIC_DETAILS: 'REG_BASIC_DETAILS',
  REG_CONTACT_DETAILS: 'REG_CONTACT_DETAILS',
  REG_OTP: 'REG_OTP',
  SET_PASSWORD: 'SET_PASSWORD',
  FORGOT_PASSWORD_PAN: 'FORGOT_PASSWORD_PAN',
  FORGOT_PASSWORD_METHOD: 'FORGOT_PASSWORD_METHOD',
  FORGOT_PASSWORD_OTP_CHOICE: 'FORGOT_PASSWORD_OTP_CHOICE',
  SUCCESS: 'SUCCESS',
};

const checkVisibility = async (page, selector) => {
  try {
    return await page.locator(selector).first().isVisible({ timeout: 500 });
  } catch {
    return false;
  }
};

export const determineState = async (page) => {
  const url = page.url();

  // 1. Success Checks (can happen on dashboard or specific success pages)
  if (url.includes('dashboard')) {
    return STATES.DASHBOARD;
  }
  if (await checkVisibility(page, 'text="registered successfully"') || 
      await checkVisibility(page, 'text="Registration successful"') ||
      await checkVisibility(page, 'text="updated successfully"')) {
    return STATES.SUCCESS;
  }

  // 2. OTP Checks (OTP modals can appear anywhere)
  const isOtpVisible = await checkVisibility(page, '.otp-input, input[autocomplete="one-time-code"], input[formcontrolname="otp"]') ||
                       await checkVisibility(page, 'text="Enter OTP"');
  if (isOtpVisible) {
    return STATES.REG_OTP;
  }

  // 3. Login Flow
  if (url.includes('#/login/password') || await checkVisibility(page, 'input[formcontrolname="loginPassword"]')) {
    return STATES.LOGIN_PASSWORD_PAGE;
  }
  if (url.includes('#/login') || await checkVisibility(page, 'input[id="panAdhaarUserId"]')) {
    return STATES.LOGIN_PAGE;
  }

  // 4. Registration Flow
  if (url.includes('#/pre-login/register')) {
    // Password screen (Final Step)
    if (await checkVisibility(page, 'input[formcontrolname="confirmPassword"]')) {
      return STATES.SET_PASSWORD;
    }
    // Contact Details (Step 3)
    if (await checkVisibility(page, 'input[formcontrolname="primaryMobile"]')) {
      return STATES.REG_CONTACT_DETAILS;
    }
    // Basic Details (Step 2)
    if (await checkVisibility(page, 'input[formcontrolname="lastName"]')) {
      return STATES.REG_BASIC_DETAILS;
    }
    // Get Started (Step 1)
    if (await checkVisibility(page, 'button:has-text("Others")') || await checkVisibility(page, 'input[formcontrolname="pan"]')) {
      return STATES.REGISTER_GET_STARTED;
    }
  }

  // 5. Forgot Password Flow
  if (url.includes('forgot') || await checkVisibility(page, 'text="Forgot Password"')) {
    if (await checkVisibility(page, 'mat-radio-button:has-text("OTP on mobile number registered with Aadhaar")')) {
      return STATES.FORGOT_PASSWORD_METHOD;
    }
    if (await checkVisibility(page, 'mat-radio-button:has-text("Generate OTP")')) {
      return STATES.FORGOT_PASSWORD_OTP_CHOICE;
    }
    if (await checkVisibility(page, 'input[formcontrolname*="pan" i]')) {
      return STATES.FORGOT_PASSWORD_PAN;
    }
  }

  return STATES.UNKNOWN;
};
