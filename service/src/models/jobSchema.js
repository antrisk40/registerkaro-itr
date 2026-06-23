import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    // A masked PAN is required for the dashboard view
    maskedPan: { type: String, required: true, trim: true },

    // Full status lifecycle of the bot
    status: {
      type: String,
      enum: [
        'INIT',
        'REGISTERING',      // PAN not found — registration flow started
        'BASIC_DETAILS',    // Filling the Basic Details tab
        'CONTACT_DETAILS',  // Filling the Contact Details tab
        'OTP_GATE',         // Waiting for OTP from the human operator
        'ACCOUNT_RECOVERY', // Setting password / recovery question
        'CAPTCHA_GATE',     // Waiting for login OTP (existing PAN path)
        'ALREADY_EXISTS',   // PAN already registered — informational
        'SUCCESS',
        'FAILED',
      ],
      default: 'INIT',
    },

    // OTP submitted by the human operator via the dashboard
    suppliedOtp: { type: String, default: null },

    // Outcome message (success/failure details)
    outcomeMessage: { type: String, default: null },

    // PID of the spawned Playwright child process — used to stop the bot
    pid: { type: Number, default: null },

    // All registration form payload fields sent from the UI
    registrationPayload: {
      isOthers:          { type: Boolean, default: false },
      category:          { type: String, default: 'Individual' },
      lastName:          { type: String, default: '' },
      middleName:        { type: String, default: '' },
      firstName:         { type: String, default: '' },
      dateOfBirth:       { type: String, default: '' }, // DD/MM/YYYY
      gender:            { type: String, enum: ['Male', 'Female', 'Transgender', ''], default: '' },
      residentialStatus: { type: String, enum: ['Resident', 'Non Resident', ''], default: 'Resident' },
      email:             { type: String, default: '' },
      mobile:            { type: String, default: '' },
    },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model('Job', jobSchema);
