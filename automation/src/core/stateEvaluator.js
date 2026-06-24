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

/**
 * Broad OTP-screen detection — covers both registration and forgot-password flows.
 * The income-tax portal uses different input patterns depending on the flow:
 *   - Registration OTP:         input.otp-input  /  input[autocomplete="one-time-code"]
 *   - Forgot-password OTP:      individual digit boxes (inputmode="numeric" maxlength="1")
 *                               OR formcontrolname like "otp1".."otp6" / "aadhaarOtp"
 * This helper centralises the check so we never fall through to FORGOT_PASSWORD_OTP_CHOICE
 * when we're actually on the OTP entry page.
 */
const isOtpScreen = async (page) => {
  // Standard patterns
  if (await checkVisibility(page,
    '.otp-input, input[autocomplete="one-time-code"], input[formcontrolname="otp"]'
  )) return true;

  // Income-tax portal forgot-password OTP: individual digit boxes
  if (await checkVisibility(page,
    'input[inputmode="numeric"][maxlength="1"], input[type="tel"][maxlength="1"]'
  )) return true;

  // formcontrolname-based OTP fields (otp1, otp2 … or aadhaarOtp)
  if (await checkVisibility(page,
    'input[formcontrolname^="otp"], input[formcontrolname*="Otp" i], input[formcontrolname*="aadhaar" i]'
  )) return true;

  // Heading text cues
  if (await checkVisibility(page, 'text="Enter OTP"') ||
      await checkVisibility(page, 'text="Verify OTP"') ||
      await checkVisibility(page, 'text="OTP Verification"')) return true;

  return false;
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

  // 2. OTP screen — checked GLOBALLY before any flow-specific logic so that the
  //    forgot-password OTP entry page is never misidentified as FORGOT_PASSWORD_OTP_CHOICE.
  if (await isOtpScreen(page)) {
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
    // ── Reset Password page (FINAL STEP after OTP verification) ──────────
    // Must be checked FIRST inside forgot flow — it has two password inputs
    // and no radio buttons, so it must not fall through to FORGOT_PASSWORD_PAN.
    const hasNewPassword     = await checkVisibility(page, 'input[formcontrolname="newPassword"], input[formcontrolname="password"], input[id*="newPassword" i], input[id*="password" i]');
    const hasConfirmPassword = await checkVisibility(page, 'input[formcontrolname="confirmPassword"], input[formcontrolname="reenterPassword"], input[id*="confirm" i]');
    const hasPasswordHeading = await checkVisibility(page, 'text="Reset Password", text="Set New Password"');

    if ((hasNewPassword && hasConfirmPassword) || hasPasswordHeading) {
      return STATES.SET_PASSWORD;
    }

    // ── OTP entry safety net inside forgot flow ───────────────────────────
    // Even if the global check above missed an OTP screen (e.g. page still
    // loading), catch it here before the radio-button check to prevent
    // FORGOT_PASSWORD_OTP_CHOICE from triggering on the OTP entry page.
    if (await isOtpScreen(page)) {
      return STATES.REG_OTP;
    }

    // OTP choice screen (radio buttons: "Generate OTP" / "I already have an OTP")
    // IMPORTANT: only match when radio buttons are VISIBLE — Angular may leave
    // hidden radio elements in the DOM on later screens.
    const hasGenerateOtp    = await checkVisibility(page, 'mat-radio-button:has-text("Generate OTP")');
    const hasAlreadyHaveOtp = await checkVisibility(page, 'mat-radio-button:has-text("I already have an OTP")');
    if (hasGenerateOtp || hasAlreadyHaveOtp) {
      return STATES.FORGOT_PASSWORD_OTP_CHOICE;
    }

    // Method selection screen (radio: "OTP on mobile registered with Aadhaar")
    if (await checkVisibility(page, 'mat-radio-button:has-text("OTP on mobile number registered with Aadhaar")')) {
      return STATES.FORGOT_PASSWORD_METHOD;
    }

    // PAN entry screen — only match if a non-password text input is visible
    const panVisible = await checkVisibility(
      page,
      'input[formcontrolname*="pan" i], input[formcontrolname*="user" i], input[id*="pan" i], input[id*="user" i], input[placeholder*="User ID" i], input[placeholder*="PAN" i]'
    );
    if (panVisible) {
      return STATES.FORGOT_PASSWORD_PAN;
    }

    // Unknown step within forgot-password — wait for next poll cycle
    return STATES.UNKNOWN;
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
