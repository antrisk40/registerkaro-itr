import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    // Reference back to the parent Job
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    // The exact sequence of the event (1, 2, 3...) for SSE ordering
    seq: {
      type: Number,
      required: true,
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error'],
      default: 'info',
    },
    phase: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
  },
  { 
    // We don't need Mongoose to manage timestamps here; the webhook provides them, 
    // but createdAt is useful for TTL or sweeping
    timestamps: { createdAt: true, updatedAt: false } 
  }
);

// --- THE CRITICAL ENGINEERING BAR ---
// This compound index ensures that when the UI reconnects via SSE and asks for
// "All events for Job X where seq > Y", MongoDB executes it instantly without scanning.
eventSchema.index({ jobId: 1, seq: 1 }, { unique: true });

// --- PII MASKING HOOK ---
// Ensure secrets never get written to the database logs
eventSchema.pre('save', async function () {
  if (this.message) {
    // Mask PANs (e.g., ABCDE1234F -> AXXXX1234X)
    this.message = this.message.replace(/[A-Z]{5}[0-9]{4}[A-Z]{1}/gi, 'XXXXX****X');
    // Mask OTPs (e.g., 6-digit numbers)
    this.message = this.message.replace(/\b\d{6}\b/g, '***XXX');
  }
});

export default mongoose.model('Event', eventSchema);
