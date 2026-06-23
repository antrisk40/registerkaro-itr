import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

let sequenceCounter = 1;

export const emitEvent = async (jobId, level, phase, message) => {
  try {
    const payload = {
      jobId,
      seq: sequenceCounter++,
      level,
      phase,
      message
    };
    
    await axios.post(process.env.WEBHOOK_URL, payload, {
      headers: {
        'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`
      }
    });
    
    console.log(`[Event Emitted] ${phase}: ${message}`);
  } catch (error) {
    console.error(`[Emitter Error] Failed to emit event ${phase}:`, error.message);
  }
};
