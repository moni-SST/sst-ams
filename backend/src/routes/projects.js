const router = require('express').Router();
const { getAllProjects, getProjectById, createProject, updateProject, deleteProject, exportProjectExcel, exportProjectPDF } = require('../controllers/projectController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

router.get('/', getAllProjects);
router.get('/:id/export/excel', exportProjectExcel);
router.get('/:id/export/pdf',   exportProjectPDF);
router.get('/:id', getProjectById);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', authorize('admin'), deleteProject);

module.exports = router;
