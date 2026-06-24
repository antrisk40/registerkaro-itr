import dotenv from 'dotenv';
import path from 'path';

// Note: Ensure dotenv is configured to load from the correct directory if needed
dotenv.config();

export const config = {
  API_URL: process.env.API_URL,
  DUMMY_PAN: process.env.DUMMY_PAN,
  TARGET_PAN: process.env.TARGET_PAN,
  JOB_ID: process.env.JOB_ID,
  DUMMY_JOB_ID: process.env.DUMMY_JOB_ID,
  IS_OTHERS: process.env.IS_OTHERS === 'true',
  TAXPAYER_CATEGORY: process.env.TAXPAYER_CATEGORY || 'Individual',

  // Registration Defaults
  regData: {
    lastName: process.env.REG_LAST_NAME || 'DOE',
    middleName: process.env.REG_MIDDLE_NAME || '',
    firstName: process.env.REG_FIRST_NAME || 'JOHN',
    dateOfBirth: process.env.REG_DATE_OF_BIRTH || '01011990',
    gender: process.env.REG_GENDER || 'Male',
    residentialStatus: process.env.REG_RESIDENTIAL || 'Resident',
    email: process.env.REG_EMAIL || '',
    emailBelongsTo: process.env.REG_EMAIL_BELONGS || 'Self',
    mobile: process.env.REG_MOBILE || '',
    mobileBelongsTo: process.env.REG_MOBILE_BELONGS || 'Self',
    country: process.env.REG_COUNTRY || 'India',
    flat: process.env.REG_FLAT || '',
    road: process.env.REG_ROAD || '',
    pincode: process.env.REG_PINCODE || '',
    postOffice: process.env.REG_POST_OFFICE || '',
    area: process.env.REG_AREA || '',
    town: process.env.REG_TOWN || '',
    state: process.env.REG_STATE || '',
  }
};
