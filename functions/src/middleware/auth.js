const jwt = require('jsonwebtoken');
const { db, docToObj } = require('../config/firebase');

const JWT_SECRET = process.env.JWT_SECRET || 'sst_ams_super_secret_key_change_in_production_2024';

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const userDoc = await db.collection('users').doc(decoded.userId).get();
    const user = docToObj(userDoc);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { authenticate, JWT_SECRET };
