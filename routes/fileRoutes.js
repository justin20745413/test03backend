const express = require('express');
const multer = require('multer');
const path = require('path');
const fileController = require('../controllers/fileController');

const router = express.Router();

// 設定 Multer 儲存空間
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        const encodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, encodedName);
    }
});
const upload = multer({ storage });

// 路由設定
router.post('/upload/check', fileController.checkFile);
router.post('/upload', fileController.uploadFiles);
router.put('/files/:fileName', upload.single('file'), fileController.updateFile);
router.get('/files', fileController.getFileList);
router.get('/download/:filename', fileController.downloadFile);
router.delete('/files/:id', fileController.deleteFile);
router.post('/reset-id', fileController.resetId);
router.get('/test', (req, res) => res.json({ message: 'API 服務器正常運行' }));

module.exports = router;
