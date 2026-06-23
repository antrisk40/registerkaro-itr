import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
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
      email, emailBelongsTo, mobile, mobileBelongsTo,
      country, flat, road, pincode, postOffice, area, town, state
    } = req.body;

    if (!pan) return res.status(400).json({ error: 'PAN is required' });

    console.log(`[Orchestrator] Launching bot — PAN: ${pan}, Category: ${category}`);

    const automationDir = path.resolve(__dirname, '../../../automation');
    const botScript = path.join(automationDir, 'src/index.js');

    if (!fs.existsSync(botScript)) {
      console.error(`[Orchestrator] Bot script not found: ${botScript}`);
      return res.status(500).json({ error: 'Automation script not found on server' });
    }

    // Generate a fresh MongoDB-compatible ObjectId (24 hex characters)
    const jobId = crypto.randomBytes(12).toString('hex');

    const logsDir = path.join(automationDir, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, `bot-${jobId}.log`);
    const logFd = fs.openSync(logFile, 'a');

    const botEnv = {
      ...process.env,
      TARGET_PAN:         pan,
      JOB_ID:             jobId,
      IS_OTHERS:          String(!!isOthers),
      TAXPAYER_CATEGORY:  category        || 'Individual',
      REG_LAST_NAME:      lastName        || '',
      REG_MIDDLE_NAME:    middleName      || '',
      REG_FIRST_NAME:     firstName       || '',
      REG_DATE_OF_BIRTH:  dateOfBirth     || '',
      REG_GENDER:         gender          || 'Male',
      REG_RESIDENTIAL:    residentialStatus || 'Resident',
      REG_EMAIL:          email           || '',
      REG_EMAIL_BELONGS:  emailBelongsTo  || 'Self',
      REG_MOBILE:         mobile          || '',
      REG_MOBILE_BELONGS: mobileBelongsTo || 'Self',
      REG_COUNTRY:        country         || 'India',
      REG_FLAT:           flat            || '',
      REG_ROAD:           road            || '',
      REG_PINCODE:        pincode         || '',
      REG_POST_OFFICE:    postOffice      || '',
      REG_AREA:           area            || '',
      REG_TOWN:           town            || '',
      REG_STATE:          state           || '',
      API_URL:            process.env.API_URL            || 'http://127.0.0.1:4000/api',
      WEBHOOK_URL:        process.env.WEBHOOK_URL        || 'http://127.0.0.1:4000/webhook/events',
      WEBHOOK_SECRET:     process.env.WEBHOOK_SECRET     || '',
    };

    const botProcess = spawn(process.execPath, [botScript], {
      cwd: automationDir,
      env: botEnv,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });

    botProcess.on('error', (err) => {
      console.error(`[Orchestrator] Failed to spawn bot process: ${err.message}`);
      fs.appendFileSync(logFile, `\n[Spawn Error] ${err.message}\n`);
    });

    botProcess.unref();
    const pid = botProcess.pid;

    if (!pid) {
      fs.closeSync(logFd);
      return res.status(500).json({ error: 'Failed to start bot process' });
    }

    // Immediately create the Job document with the PID so Stop works instantly
    await Job.create({
      _id: jobId,
      maskedPan: `${pan.slice(0, 3)}***${pan.slice(-2)}`,
      originalPan: pan,
      status: 'INIT',
      pid: pid,
      registrationPayload: {
        isOthers, category, lastName, middleName, firstName, dateOfBirth, gender, residentialStatus, 
        email, emailBelongsTo, mobile, mobileBelongsTo,
        country, flat, road, pincode, postOffice, area, town, state
      }
    });

    console.log(`[Orchestrator] Bot spawned with PID: ${pid}, JobId: ${jobId}, log: ${logFile}`);
    return res.status(200).json({ success: true, jobId, pid, logFile, message: 'Bot launched in background' });

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

/**
 * Clone a failed/stopped job and restart it
 */
export const cloneJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { pan: fallbackPan } = req.body;
    const existingJob = await Job.findById(jobId);
    
    if (!existingJob) return res.status(404).json({ error: 'Original job not found' });
    
    const panToUse = existingJob.originalPan || fallbackPan;
    if (!panToUse) {
      return res.status(400).json({ error: 'PAN_REQUIRED', message: 'Original PAN is missing from DB. Please provide it.' });
    }

    const payload = existingJob.registrationPayload || {};
    
    // Simulate req.body for launchJob using the stored data
    req.body = {
      pan: panToUse,
      isOthers: payload.isOthers,
      category: payload.category,
      lastName: payload.lastName,
      middleName: payload.middleName,
      firstName: payload.firstName,
      dateOfBirth: payload.dateOfBirth,
      gender: payload.gender,
      residentialStatus: payload.residentialStatus,
      email: payload.email,
      emailBelongsTo: payload.emailBelongsTo,
      mobile: payload.mobile,
      mobileBelongsTo: payload.mobileBelongsTo,
      country: payload.country,
      flat: payload.flat,
      road: payload.road,
      pincode: payload.pincode,
      postOffice: payload.postOffice,
      area: payload.area,
      town: payload.town,
      state: payload.state
    };
    
    // Simply delegate to launchJob
    return launchJob(req, res);
    
  } catch (error) {
    console.error('[Orchestrator] Failed to clone job:', error);
    return res.status(500).json({ error: 'Failed to restart job' });
  }
};
