const router = require('express').Router();
const { getPayments, createPayment, updatePayment, getPaymentSummary } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/:projectId', getPayments);
router.get('/:projectId/summary', getPaymentSummary);
router.post('/:projectId', createPayment);
router.put('/:id', updatePayment);

module.exports = router;
