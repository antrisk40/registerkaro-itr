import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Job from '../models/jobSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory map: jobId -> pid (for immediate lookups before the bot's first webhook)
const runningPids = new Map();

export const launchJob = async (req, res) => {
  try {
    const {
      pan, isOthers, category,
      lastName, middleName, firstName,
      dateOfBirth, gender, residentialStatus,
      email, mobile,
    } = req.body;

    if (!pan) return res.status(400).json({ error: 'PAN is required' });

    console.log(`[Orchestrator] Launching bot — PAN: ${pan}, Category: ${category}`);

    const automationDir = path.resolve(__dirname, '../../../automation');

    // Generate a fresh MongoDB-compatible ObjectId (24 hex characters)
    const jobId = crypto.randomBytes(12).toString('hex');

    const botProcess = spawn('node', ['src/index.js'], {
      cwd: automationDir,
      env: {
        ...process.env,
        TARGET_PAN:        pan,
        JOB_ID:            jobId,
        IS_OTHERS:         String(!!isOthers),
        TAXPAYER_CATEGORY: category        || 'Individual',
        REG_LAST_NAME:     lastName        || '',
        REG_MIDDLE_NAME:   middleName      || '',
        REG_FIRST_NAME:    firstName       || '',
        REG_DATE_OF_BIRTH: dateOfBirth     || '',
        REG_GENDER:        gender          || 'Male',
        REG_RESIDENTIAL:   residentialStatus || 'Resident',
        REG_EMAIL:         email           || '',
        REG_MOBILE:        mobile          || '',
      },
      detached: true,
      stdio: 'ignore',
    });

    botProcess.on('error', (err) => {
      console.error(`[Orchestrator] Failed to spawn bot process: ${err.message}`);
    });

    botProcess.unref();
    const pid = botProcess.pid;

    // Immediately create the Job document with the PID so Stop works instantly
    await Job.create({
      _id: jobId,
      maskedPan: `${pan.slice(0, 3)}***${pan.slice(-2)}`,
      status: 'INIT',
      pid: pid,
      registrationPayload: {
        isOthers, category, lastName, middleName, firstName, dateOfBirth, gender, residentialStatus, email, mobile
      }
    });

    console.log(`[Orchestrator] Bot spawned with PID: ${pid} and JobId: ${jobId}`);
    return res.status(200).json({ success: true, jobId, pid, message: 'Bot launched in background' });

  } catch (error) {
    console.error('[Orchestrator] Failed to launch bot:', error);
    return res.status(500).json({ error: 'Failed to launch automation bot' });
  }
};

/**
 * Stop a running bot by Job ID.
 * The bot stores its own PID in the Job document via the webhook on first emit.
 * We look up the PID from the DB and send SIGTERM.
 */
export const stopJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Kill the process tree if a PID exists
    if (job.pid) {
      try {
        process.kill(job.pid, 'SIGTERM');
      } catch (killErr) {
        if (killErr.code !== 'ESRCH') { // ESRCH = process not found (already dead)
          throw killErr;
        }
      }
    }

    // Mark job as FAILED in DB (clean up state even if PID was missing)
    await Job.findByIdAndUpdate(jobId, {
      $set: { status: 'FAILED', pid: null, outcomeMessage: 'Stopped by user' }
    });

    return res.status(200).json({ success: true, message: `Bot stopped successfully` });

  } catch (error) {
    console.error('[Orchestrator] Failed to stop bot:', error);
    return res.status(500).json({ error: 'Failed to stop automation bot' });
  }
};
