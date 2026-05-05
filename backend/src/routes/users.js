const router = require('express').Router();
const { getAllUsers, getUserById, createUser, updateUser, deleteUser, getUserPerformance } = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

router.get('/', authorize('admin', 'manager'), getAllUsers);
router.get('/performance', authorize('admin', 'manager'), getUserPerformance);
router.get('/:id', getUserById);
router.post('/', authorize('admin'), createUser);
router.put('/:id', authorize('admin'), updateUser);
router.delete('/:id', authorize('admin'), deleteUser);

module.exports = router;
