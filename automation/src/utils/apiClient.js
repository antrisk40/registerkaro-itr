import axios from 'axios';

const botHeaders = () => ({
  Authorization: `Bearer ${process.env.WEBHOOK_SECRET || ''}`,
});

export const botGet = (url) => axios.get(url, { headers: botHeaders() });
export const botPost = (url, data) => axios.post(url, data, { headers: botHeaders() });
export const botPatch = (url, data) => axios.patch(url, data, { headers: botHeaders() });
