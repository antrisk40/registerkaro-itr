export const STATUS_COLORS = {
  INIT:             'bg-blue-500/20 text-blue-300 border-blue-500/40',
  REGISTERING:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  BASIC_DETAILS:    'bg-purple-500/20 text-purple-300 border-purple-500/40',
  CONTACT_DETAILS:  'bg-purple-500/20 text-purple-300 border-purple-500/40',
  OTP_GATE:         'bg-orange-500/20 text-orange-300 border-orange-500/40',
  CAPTCHA_GATE:     'bg-orange-500/20 text-orange-300 border-orange-500/40',
  ACCOUNT_RECOVERY: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  ALREADY_EXISTS:   'bg-gray-500/20 text-gray-300 border-gray-500/40',
  SUCCESS:          'bg-green-500/20 text-green-300 border-green-500/40',
  FAILED:           'bg-red-500/20 text-red-300 border-red-500/40',
  STOPPED:          'bg-red-500/20 text-red-300 border-red-500/40',
};

export const LOG_COLORS = {
  info:  'text-green-400',
  warn:  'text-yellow-400',
  error: 'text-red-400',
};

export const TERMINAL_STATUSES = ['SUCCESS', 'FAILED', 'ALREADY_EXISTS'];

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

export function isActiveStatus(status) {
  return !isTerminalStatus(status);
}

export function getStatusClass(status) {
  return STATUS_COLORS[status] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
}

export function formatJobDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString();
}

export function summarizeJobs(jobs) {
  const total = jobs.length;
  const active = jobs.filter((j) => isActiveStatus(j.status)).length;
  const success = jobs.filter((j) => j.status === 'SUCCESS').length;
  const failed = jobs.filter((j) => j.status === 'FAILED').length;
  return { total, active, success, failed };
}
