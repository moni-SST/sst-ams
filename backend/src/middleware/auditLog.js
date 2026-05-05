const db = require('../config/database');

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = async function (data) {
      if (res.statusCode < 400 && req.user) {
        try {
          await db.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              req.user.id,
              action,
              entityType,
              data?.id || req.params?.id || null,
              JSON.stringify(req.body || {}),
              req.ip,
              req.get('user-agent')
            ]
          );
        } catch (err) {
          console.error('Audit log error:', err.message);
        }
      }
      return originalJson(data);
    };
    next();
  };
};

module.exports = { auditLog };
