import jwt from 'jsonwebtoken';

const getBearerToken = (req) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (typeof req.query?.token === 'string') return req.query.token;
  return null;
};

export const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (header === `Bearer ${process.env.WEBHOOK_SECRET}`) {
    req.isBot = true;
    return next();
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-jwt-secret-change-me');
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (req.isBot) return next();
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};

export const requireUser = (req, res, next) => {
  if (req.isBot) return res.status(403).json({ error: 'Forbidden' });
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  return next();
};
