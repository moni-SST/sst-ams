const router = require('express').Router();
const { login, getMe, changePassword, changeUsername } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', authenticate, getMe);
router.put('/change-password', authenticate, changePassword);
router.put('/change-username', authenticate, changeUsername);

module.exports = router;
