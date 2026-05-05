const router = require('express').Router();
const { getStages, updateStage } = require('../controllers/stageController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/:projectId', getStages);
router.patch('/:projectId/stage/:stageNumber', updateStage);

module.exports = router;
