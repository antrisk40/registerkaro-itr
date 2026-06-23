import { EventEmitter } from 'events';
import Event from '../../../shared/eventSchema.js';
import Job from '../../../shared/jobSchema.js'; 

// Create a local Node.js Event Emitter. 
// This acts as our "Ring Buffer" to fan out live events to connected clients.
const liveStream = new EventEmitter();
liveStream.setMaxListeners(100); // Prevent memory leak warnings on high concurrency

/**
 * 1. THE WEBHOOK INGEST (Bot -> Server)
 * Endpoint: POST /webhook/events
 */
export const handleWebhookEvent = async (req, res) => {
  try {
    // Basic Auth Check (RegisterKaro demanded a webhook secret)
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized webhook payload' });
    }

    const { jobId, seq, level, phase, message } = req.body;

    if (!jobId || seq === undefined || !phase || !message) {
      return res.status(400).json({ error: 'Missing required event fields' });
    }

    // Save to the MongoDB Event collection (This triggers your PII masking hook)
    const newEvent = await Event.create({
      jobId,
      seq,
      level,
      phase,
      message
    });

    // Update the parent Job's phase so the Admin Dashboard table stays current
    await Job.findByIdAndUpdate(jobId, { 
        currentPhase: phase,
        updatedAt: Date.now() 
    });

    // Broadcast the event to any active SSE connections listening to this jobId
    liveStream.emit(`job-${jobId}`, newEvent);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] Error ingesting event:', error);
    // Fail-soft: Don't crash the server, just return 500
    return res.status(500).json({ error: 'Internal server error' });
  }
};


/**
 * 2. THE SSE STREAM (Server -> Next.js UI)
 * Endpoint: GET /api/stream/:jobId
 */
export const streamJobEvents = async (req, res) => {
  const { jobId } = req.params;

  // Set the mandatory SSE HTTP Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevents Nginx/Render from buffering the stream
  });

  try {
    // --- REPLAY LOGIC (No Gaps, No Dupes) ---
    // Read the Last-Event-ID header sent by the browser
    const lastEventId = parseInt(req.headers['last-event-id'], 10);
    
    let query = { jobId };
    
    // If the UI disconnected and reconnected, it will send the last seq it saw.
    // We instantly fetch anything greater than that seq using our compound index!
    if (!isNaN(lastEventId)) {
      query.seq = { $gt: lastEventId };
    }

    // Fetch missed backlog from the durable Mongo log
    const backlogEvents = await Event.find(query).sort({ seq: 1 });
    
    backlogEvents.forEach(event => {
      // The SSE protocol requires exactly this format:
      // id: [sequence_number]\n
      // data: [json_payload]\n\n
      res.write(`id: ${event.seq}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // --- LIVE FAN-OUT LOGIC ---
    // Listen for new events from the webhook via our EventEmitter
    const listener = (event) => {
      res.write(`id: ${event.seq}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    liveStream.on(`job-${jobId}`, listener);

    // --- BOUNDED MEMORY CLEANUP (CRITICAL) ---
    // If the operator closes the browser tab, the connection drops.
    // We MUST remove the listener, or the server will run out of RAM.
    req.on('close', () => {
      console.log(`[SSE] Client disconnected from job ${jobId}`);
      liveStream.removeListener(`job-${jobId}`, listener);
      res.end();
    });

  } catch (error) {
    console.error(`[SSE] Error streaming job ${jobId}:`, error);
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream failed' })}\n\n`);
    res.end();
  }
};
