const express = require('express');
const router = express.Router();
const imgScrollController = require('../controllers/imgScrollController');

router.get('/imgscroll', imgScrollController.getData);
router.put('/imgscroll', imgScrollController.updateData);
router.post('/imgscroll/block', imgScrollController.addBlock);
router.delete('/imgscroll/block/:indexPartId', imgScrollController.deleteBlock);
router.post('/imgscroll/upload/:indexPartId/:style', imgScrollController.uploadStyleImage);

module.exports = router; 