const router = require('express').Router();
const { updateStage, getStages } = require('../controllers/stageController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/:projectId', getStages);
router.patch('/:projectId/stage/:stageNumber', updateStage);

module.exports = router;
