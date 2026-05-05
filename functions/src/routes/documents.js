const router = require('express').Router();
const multer = require('multer');
const { uploadDocuments, getDocuments, downloadDocument, deleteDocument } = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/jpg','image/png','image/gif','image/webp','application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.use(authenticate);
router.get('/:projectId', getDocuments);
router.post('/:projectId', upload.array('files', 10), uploadDocuments);
router.get('/download/:id', downloadDocument);
router.delete('/:id', deleteDocument);

module.exports = router;
