import jwt from 'jsonwebtoken';

const JWT_SECRET         = process.env.JWT_SECRET         || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret';

// Access token: 4 hours — long enough to cover a full game day with warmup/post-game
const ACCESS_TOKEN_TTL = '4h';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.coachId = decoded.coachId;
    req.teamId  = decoded.teamId;
    req.email   = decoded.email;
    req.role    = decoded.role || 'coach';
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const generateToken = (payload, options = {}) => {
  const expiresIn = options.expiresIn || ACCESS_TOKEN_TTL;
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (err) {
    return null;
  }
};

export default authenticateToken;
