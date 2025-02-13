const fs = require('fs').promises;
const path = require('path');
const dataPath = path.join(__dirname, '../data/imgScrollData.json');
const counterPath = path.join(__dirname, '../data/imgScrollCounter.json');
const multer = require('multer');

// 修改 storage 配置
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/imgStyles');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            cb(err);
        }
    },
    filename: async (req, file, cb) => {
        try {
            // 讀取當前計數器值
            const counterData = await fs.readFile(counterPath, 'utf8');
            const counter = JSON.parse(counterData);
            const { style } = req.params;
            
            if (!style) {
                throw new Error('缺少必要參數 style');
            }

            // 使用計數器的值作為檔案名稱
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `${counter.currentIndexPartId}_${style}${ext}`);

        } catch (error) {
            console.error('檔案命名錯誤:', error);
            cb(error);
        }
    }
});

// 設定檔案類型過濾
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('不支援的檔案類型。只允許 jpg、png、gif 和 svg 格式。'), false);
    }
};

const upload = multer({ 
    storage,
    fileFilter
});

const imgScrollController = {
    // 獲取所有數據
    getData: async (req, res) => {
        try {
            const data = await fs.readFile(dataPath, 'utf8');
            res.json(JSON.parse(data));
        } catch (error) {
            res.status(500).json({ error: '獲取數據失敗' });
        }
    },

    // 更新數據
    updateData: async (req, res) => {
        try {
            const newData = req.body;
            await fs.writeFile(dataPath, JSON.stringify(newData, null, 2));
            res.json({ success: true, message: '更新成功' });
        } catch (error) {
            res.status(500).json({ error: '更新數據失敗' });
        }
    },

    // 添加新區塊
    addBlock: async (req, res) => {
        try {
            const newBlock = req.body;
            
            // 讀取當前計數器值
            const counterData = await fs.readFile(counterPath, 'utf8');
            const counter = JSON.parse(counterData);
            
            // 使用當前計數器值作為新區塊的 ID
            newBlock.indexPartId = counter.currentIndexPartId;
            
            // 更新數據
            const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
            data.indexPartList.push(newBlock);
            await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
            
            // 增加計數器值
            counter.currentIndexPartId += 1;
            await fs.writeFile(counterPath, JSON.stringify(counter, null, 2));
            
            res.json({ 
                success: true, 
                message: '添加成功', 
                data 
            });
        } catch (error) {
            res.status(500).json({ error: '添加區塊失敗' });
        }
    },

    // 刪除區塊
    deleteBlock: async (req, res) => {
        try {
            const { indexPartId } = req.params;
            const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
            
            // 找到要刪除的區塊
            const blockToDelete = data.indexPartList.find(
                block => block.indexPartId === parseInt(indexPartId)
            );

            if (!blockToDelete) {
                return res.status(404).json({ error: '找不到指定區塊' });
            }

            // 刪除相關的圖片檔案
            const uploadsDir = path.join(__dirname, '../uploads/imgStyles');
            const styles = ['STYLE_A', 'STYLE_B'];
            
            for (const style of styles) {
                try {
                    // 嘗試刪除不同副檔名的圖片
                    const extensions = ['.jpg', '.png', '.gif', '.svg'];
                    for (const ext of extensions) {
                        const imagePath = path.join(uploadsDir, `${indexPartId}_${style}${ext}`);
                        try {
                            await fs.unlink(imagePath);
                            console.log(`成功刪除圖片: ${imagePath}`);
                        } catch (err) {
                            // 如果檔案不存在，繼續檢查下一個副檔名
                            if (err.code !== 'ENOENT') {
                                console.error(`刪除圖片失敗: ${imagePath}`, err);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`刪除 ${style} 圖片失敗:`, error);
                }
            }

            // 從列表中移除區塊
            data.indexPartList = data.indexPartList.filter(
                block => block.indexPartId !== parseInt(indexPartId)
            );
            
            await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
            res.json({ success: true, message: '刪除成功', data });
        } catch (error) {
            res.status(500).json({ error: '刪除區塊失敗' });
        }
    },

    // 上傳樣式圖片
    uploadStyleImage: [
        upload.single('image'),
        async (req, res) => {
            try {
                const { indexPartId, style } = req.params;
                
                if (!req.file) {
                    return res.status(400).json({ 
                        success: false, 
                        message: '未收到圖片文件' 
                    });
                }

                if (!indexPartId || !style) {
                    return res.status(400).json({
                        success: false,
                        message: '缺少必要參數 indexPartId 或 style'
                    });
                }

                res.json({
                    success: true,
                    message: '圖片上傳成功',
                    data: req.file.filename
                });
            } catch (error) {
                console.error('上傳圖片錯誤:', error);
                res.status(500).json({ 
                    success: false, 
                    message: '圖片上傳失敗',
                    error: error.message 
                });
            }
        }
    ]
};

module.exports = imgScrollController; 