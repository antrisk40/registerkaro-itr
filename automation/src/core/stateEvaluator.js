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
    const loc = page.locator(selector);
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      if (await loc.nth(i).isVisible()) return true;
    }
    // Also try checking the first element if count is 0, just in case it appears slightly later within a short timeout
    return await loc.first().isVisible({ timeout: 500 });
  } catch {
    return false;
  }
};

export const determineState = async (page) => {
  const url = page.url();

  // 1. Success / Dashboard
  if (url.includes('dashboard')) {
    return STATES.DASHBOARD;
  }
  if (await checkVisibility(page, 'text="registered successfully"') || 
      await checkVisibility(page, 'text="Registration successful"') ||
      await checkVisibility(page, 'text="updated successfully"')) {
    return STATES.SUCCESS;
  }

  // 2. OTP screen (can appear anywhere)
  const isOtpVisible = await checkVisibility(page, '.otp-input, input[autocomplete="one-time-code"], input[formcontrolname="otp"]') ||
                       await checkVisibility(page, 'text="Enter OTP"');
  if (isOtpVisible) {
    return STATES.REG_OTP;
  }

  // 3. ── FORGOT PASSWORD FLOW ────────────────────────────────────────────
  // IMPORTANT: Must be checked BEFORE the generic #/login check because the
  // portal may keep #/login in the URL briefly while transitioning to the
  // forgot-password screens.
  const isForgotPage = url.includes('forgot') ||
    await checkVisibility(page, 'text="Forgot Password"') ||
    await checkVisibility(page, '[class*="forgot"], [id*="forgot"]');

  if (isForgotPage) {
    // OTP choice screen (radio buttons: "Generate OTP" / "I already have an OTP")
    const hasGenerateOtp    = await checkVisibility(page, 'mat-radio-button:has-text("Generate OTP")');
    const hasAlreadyHaveOtp = await checkVisibility(page, 'mat-radio-button:has-text("I already have an OTP")');
    if (hasGenerateOtp || hasAlreadyHaveOtp) {
      return STATES.FORGOT_PASSWORD_OTP_CHOICE;
    }

    // Method selection screen (radio: "OTP on mobile registered with Aadhaar")
    if (await checkVisibility(page, 'mat-radio-button:has-text("OTP on mobile number registered with Aadhaar")')) {
      return STATES.FORGOT_PASSWORD_METHOD;
    }

    // PAN entry screen — check all known selectors the portal uses for User ID / PAN
    const panVisible = await checkVisibility(
      page,
      'input[formcontrolname*="pan" i], input[formcontrolname*="user" i], input[id*="pan" i], input[id*="user" i], input[placeholder*="User ID" i], input[placeholder*="PAN" i]'
    );
    if (panVisible) {
      return STATES.FORGOT_PASSWORD_PAN;
    }

    // We're on a forgot-password page but not yet sure which step — wait
    return STATES.FORGOT_PASSWORD_PAN; // safe fallback: try to fill PAN
  }

  // 4. ── LOGIN FLOW ──────────────────────────────────────────────────────
  if (url.includes('#/login/password') || await checkVisibility(page, 'input[formcontrolname="loginPassword"]')) {
    return STATES.LOGIN_PASSWORD_PAGE;
  }
  // Only match the bare login page — NOT forgot-password pages that briefly show #/login
  if ((url.includes('#/login') && !url.includes('forgot')) || await checkVisibility(page, 'input[id="panAdhaarUserId"]')) {
    return STATES.LOGIN_PAGE;
  }

  // 5. ── REGISTRATION FLOW ───────────────────────────────────────────────
  if (url.includes('#/pre-login/register')) {
    if (await checkVisibility(page, 'input[formcontrolname="confirmPassword"]')) {
      return STATES.SET_PASSWORD;
    }
    if (await checkVisibility(page, 'input[formcontrolname="primaryMobile"]')) {
      return STATES.REG_CONTACT_DETAILS;
    }
    if (await checkVisibility(page, 'input[formcontrolname="lastName"]')) {
      return STATES.REG_BASIC_DETAILS;
    }
    if (await checkVisibility(page, 'button:has-text("Others")') || await checkVisibility(page, 'input[formcontrolname="pan"]')) {
      return STATES.REGISTER_GET_STARTED;
    }
  }

  return STATES.UNKNOWN;
};
