import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    // A masked PAN is required for the dashboard view
    maskedPan: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['INIT', 'CAPTCHA_GATE', 'PENDING_INPUT', 'SUCCESS', 'FAILED'],
      default: 'INIT',
    },
    // The bot will poll this field to see if the human supplied the OTP
    suppliedOtp: {
      type: String,
      default: null,
    },
    outcomeMessage: {
      type: String,
      default: null,
    },
  },
  { 
    timestamps: true // Automatically gives us createdAt and updatedAt
  }
);

// We add an index on status and updatedAt so the Admin dashboard can sort quickly
jobSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model('Job', jobSchema);
