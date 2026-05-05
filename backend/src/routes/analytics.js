const router = require('express').Router();
const {
  getDashboardStats, getProjectAnalytics, getPaymentAnalytics,
  exportProjectsExcel, exportProjectsPDF
} = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

router.get('/dashboard', getDashboardStats);
router.get('/projects', getProjectAnalytics);
router.get('/payments', getPaymentAnalytics);
router.get('/export/excel', authorize('admin', 'manager'), exportProjectsExcel);
router.get('/export/pdf', authorize('admin', 'manager'), exportProjectsPDF);

module.exports = router;
