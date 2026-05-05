const router = require('express').Router();
const { getDashboardStats, getProjectAnalytics, getPaymentAnalytics, exportProjectsExcel, exportProjectsPDF } = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/dashboard', getDashboardStats);
router.get('/projects', getProjectAnalytics);
router.get('/payments', getPaymentAnalytics);
router.get('/export/excel', exportProjectsExcel);
router.get('/export/pdf', exportProjectsPDF);

module.exports = router;
