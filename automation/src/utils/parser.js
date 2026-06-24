/** Parse DOB and format as MMDDYYYY (portal expects month-day-year, no separators) */
export const parseDob = (raw) => {
  const s = String(raw).trim();
  let d, m, y;

  const mmddyyyy = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (mmddyyyy) {
    [, m, d, y] = mmddyyyy;
  } else if (dmy) {
    [, d, m, y] = dmy;
  } else if (ymd) {
    [, y, m, d] = ymd;
  } else {
    throw new Error(`Unrecognized DOB format "${raw}" — use MMDDYYYY (e.g. 01151990)`);
  }

  const month = String(parseInt(m, 10)).padStart(2, '0');
  const day = String(parseInt(d, 10)).padStart(2, '0');
  const year = String(parseInt(y, 10));

  return {
    day: parseInt(day, 10),
    month: parseInt(month, 10),
    year: parseInt(year, 10),
    formatted: `${month}${day}${year}`,
    digits: `${month}${day}${year}`,
  };
};

export const generateSecurePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const specialChars = '!@#$%^&*';
  const upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';

  let pwd = '';
  pwd += upperCase[Math.floor(Math.random() * upperCase.length)];
  pwd += lowerCase[Math.floor(Math.random() * lowerCase.length)];
  pwd += numbers[Math.floor(Math.random() * numbers.length)];
  pwd += specialChars[Math.floor(Math.random() * specialChars.length)];

  for (let i = 0; i < 10; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
};
