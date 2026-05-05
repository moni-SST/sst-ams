const router = require('express').Router();
const { getPayments, createPayment, updatePayment, getPaymentSummary } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);
router.use(authorize('admin', 'manager'));

router.get('/:projectId', getPayments);
router.get('/:projectId/summary', getPaymentSummary);
router.post('/:projectId', createPayment);
router.put('/:id', updatePayment);

module.exports = router;
