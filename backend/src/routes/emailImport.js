const express = require('express');
const router = express.Router();
const { fetchEmailAttachments, importAttachments } = require('../controllers/emailImportController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.post('/fetch', fetchEmailAttachments);
router.post('/import', importAttachments);

module.exports = router;
