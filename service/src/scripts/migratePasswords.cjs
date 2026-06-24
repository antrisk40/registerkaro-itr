const mongoose = require('mongoose');
const Job = mongoose.model('Job', new mongoose.Schema({ encryptedPassword: String }, { strict: false }));
const crypto = require('crypto');

function getKey(raw) {
  return crypto.createHash('sha256').update(raw || 'registerkaro_local_dev_key').digest();
}

const fallbackKey = getKey('');
const envKey = getKey('rk_enc_k3y_f0r_l0c4l_d3v_0nly_32b');
const ALGORITHM = 'aes-256-cbc';

function decryptFallback(encryptedText) {
  const [ivHex, ...rest] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = rest.join(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, fallbackKey, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptEnv(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, envKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

mongoose.connect('mongodb://127.0.0.1:27017/registerkaro').then(async () => {
  const jobs = await Job.find({ encryptedPassword: { $exists: true, $ne: null } });
  let migrated = 0;
  for (const job of jobs) {
    try {
      const plain = decryptFallback(job.encryptedPassword);
      const newEncrypted = encryptEnv(plain);
      job.encryptedPassword = newEncrypted;
      await job.save();
      migrated++;
      console.log('Migrated job', job._id.toString());
    } catch (e) {
      console.log('Could not decrypt job with fallback key:', job._id.toString(), e.message);
    }
  }
  console.log('Migrated', migrated, 'jobs.');
  process.exit(0);
});
