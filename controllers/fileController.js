const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { getNextId, saveId } = require('../utils/idManager');

// 確保目錄存在
const ensureDir = async (dirPath) => {
    try {
        await fs.access(dirPath);
    } catch {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            console.log('創建目錄成功:', dirPath);
        } catch (error) {
            console.error('創建目錄失敗:', dirPath, error);
            throw error;
        }
    }
};

// 確保文件存在
const ensureFile = async (filePath, defaultContent = '[]') => {
    try {
        await fs.access(filePath);
    } catch {
        try {
            // 確保父目錄存在
            await ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, defaultContent, 'utf8');
            console.log('創建文件成功:', filePath);
        } catch (error) {
            console.error('創建文件失敗:', filePath, error);
            throw error;
        }
    }
};

// 初始化必要的目錄和文件
const initializeSystem = async () => {
    const baseDir = path.join(__dirname, '..');
    const uploadsDir = path.join(baseDir, 'uploads');
    const logFile = path.join(baseDir, 'uploadLog.json');

    try {
        await ensureDir(uploadsDir);
        await ensureFile(logFile, '[]');
        console.log('系統初始化成功');
    } catch (error) {
        console.error('系統初始化失敗:', error);
        throw error;
    }
};

// 存儲配置
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadsDir = path.join(__dirname, '../uploads');
        try {
            await ensureDir(uploadsDir);
            cb(null, uploadsDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const originalName = decodeURIComponent(Buffer.from(file.originalname, 'latin1').toString('utf8'));
        const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${uniqueSuffix}-${sanitizedName}`);
    }
});

const uploadMiddleware = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10
    }
}).array('files', 10);

const fileController = {
    // 檢查檔案
    checkFile: async (req, res) => {
        try {
            res.json({ status: 'ok' })
        } catch (error) {
            res.status(500).json({ error: '檢查檔案失敗' })
        }
    },

    // 上傳檔案
    uploadFiles: async (req, res) => {
        const logPath = path.join(__dirname, '../uploadLog.json');
        const lockFile = path.join(__dirname, '../upload.lock');
        
        // 使用文件鎖來確保同步處理
        const acquireLock = async () => {
            try {
                await fs.writeFile(lockFile, 'locked', { flag: 'wx' });
                return true;
            } catch (error) {
                return false;
            }
        };

        const releaseLock = async () => {
            try {
                await fs.unlink(lockFile);
            } catch (error) {
                console.error('釋放鎖失敗:', error);
            }
        };

        try {
            // 初始化系統
            await initializeSystem();

            // 處理上傳
            await new Promise((resolve, reject) => {
                uploadMiddleware(req, res, function(err) {
                    if (err) {
                        console.error('上傳錯誤:', err);
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });

            if (!req.files || req.files.length === 0) {
                throw new Error('沒有收到文件');
            }

            console.log('收到的文件數量:', req.files.length);

            // 等待獲取文件鎖
            let locked = false;
            for (let i = 0; i < 10; i++) {
                locked = await acquireLock();
                if (locked) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (!locked) {
                throw new Error('無法獲取文件鎖，請稍後重試');
            }

            try {
                // 讀取日誌文件
                let logs = [];
                try {
                    const logContent = await fs.readFile(logPath, 'utf8');
                    logs = JSON.parse(logContent.trim() || '[]');
                    if (!Array.isArray(logs)) logs = [];
                } catch (error) {
                    console.error('讀取日誌失敗，創建新的日誌:', error);
                    logs = [];
                }

                // 處理文件
                const processedFiles = [];
                for (const file of req.files) {
                    try {
                        const id = await getNextId();
                        if (!id) {
                            console.error('獲取ID失敗');
                            continue;
                        }

                        const fileInfo = {
                            id,
                            fileName: file.filename,
                            originalName: decodeURIComponent(Buffer.from(file.originalname, 'latin1').toString('utf8')),
                            fileType: path.extname(file.filename).slice(1),
                            uploadDate: new Date().toISOString(),
                            fileSize: file.size,
                            uploaderName: 'System',
                            status: '完成'
                        };
                        processedFiles.push(fileInfo);
                        console.log('文件處理成功:', fileInfo.fileName);
                    } catch (error) {
                        console.error('處理文件失敗:', error);
                    }
                }

                if (processedFiles.length > 0) {
                    // 更新日誌
                    logs.push(...processedFiles);
                    await fs.writeFile(logPath, JSON.stringify(logs, null, 2), 'utf8');
                    console.log(`成功處理 ${processedFiles.length} 個文件`);
                }

                return res.json({
                    success: true,
                    files: processedFiles
                });

            } finally {
                // 確保釋放鎖
                await releaseLock();
            }

        } catch (error) {
            console.error('上傳文件失敗:', error);
            return res.status(500).json({
                success: false,
                error: '上傳文件失敗',
                detail: error.message
            });
        }
    },

    // 更新檔案
    updateFile: async (req, res) => {
        try {
            const { id } = req.params
            const { originalName, uploadDate, status } = req.body
            const newFile = req.file
            const logPath = path.join(__dirname, '../uploadLog.json')

            // 讀取日誌文件
            const logContent = await fs.readFile(logPath, 'utf8')
            let logs = JSON.parse(logContent)

            // 查找要更新的檔案
            const fileIndex = logs.findIndex(f => f.id === parseInt(id))
            
            if (fileIndex === -1) {
                return res.status(404).json({
                    success: false,
                    error: '找不到檔案'
                })
            }

            const oldFile = logs[fileIndex]

            // 如果有新檔案，刪除舊檔案並保存新檔案
            if (newFile) {
                const oldFilePath = path.join(__dirname, '../uploads', oldFile.fileName)
                try {
                    await fs.unlink(oldFilePath)
                } catch (error) {
                    console.error('刪除舊檔案失敗:', error)
                }

                logs[fileIndex] = {
                    ...oldFile,
                    fileName: newFile.filename,
                    originalName: originalName || oldFile.originalName,
                    fileSize: newFile.size,
                    fileType: path.extname(newFile.filename).slice(1),
                    uploadDate: uploadDate || new Date().toISOString(),
                    status: status || oldFile.status
                }
            } else {
                // 只更新檔案資訊
                logs[fileIndex] = {
                    ...oldFile,
                    originalName: originalName || oldFile.originalName,
                    uploadDate: uploadDate || oldFile.uploadDate,
                    status: status || oldFile.status
                }
            }

            // 保存更新後的日誌
            await fs.writeFile(logPath, JSON.stringify(logs, null, 2), 'utf8')

            res.json({
                success: true,
                file: logs[fileIndex]
            })
        } catch (error) {
            console.error('更新檔案失敗:', error)
            res.status(500).json({
                success: false,
                error: '更新檔案失敗',
                detail: error.message
            })
        }
    },

    // 獲取檔案列表
    getFileList: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1
            const perPage = parseInt(req.query.perPage) || 7
            const sortBy = req.query.sortBy || 'id'
            const sortOrder = req.query.sortOrder || 'desc'
            
            const logPath = path.join(__dirname, '../uploadLog.json')
            
            // 讀取並驗證 JSON 文件
            let logContent
            try {
                logContent = await fs.readFile(logPath, 'utf8')
                // 移除可能的 BOM 標記和多餘的空白字符
                logContent = logContent.trim().replace(/^\uFEFF/, '')
                
                // 如果文件為空，返回空數組
                if (!logContent) {
                    logContent = '[]'
                }
            } catch (error) {
                console.error('讀取日誌文件錯誤:', error)
                // 如果文件不存在或讀取失敗，創建新的空文件
                await fs.writeFile(logPath, '[]', 'utf8')
                logContent = '[]'
            }
            
            let files = []
            try {
                files = JSON.parse(logContent)
                if (!Array.isArray(files)) {
                    console.error('日誌文件格式錯誤，重置為空數組')
                    files = []
                    await fs.writeFile(logPath, '[]', 'utf8')
                }
            } catch (parseError) {
                console.error('JSON 解析錯誤:', parseError)
                console.error('問題文件內容:', logContent)
                // 重置文件為空數組
                await fs.writeFile(logPath, '[]', 'utf8')
                files = []
            }

            // 添加排序邏輯
            files.sort((a, b) => {
                if (sortOrder === 'desc') {
                    return b[sortBy] > a[sortBy] ? 1 : -1
                }
                return a[sortBy] > b[sortBy] ? 1 : -1
            })
            
            // 計算分頁
            const total = files.length
            const startIndex = (page - 1) * perPage
            const paginatedFiles = files.slice(startIndex, startIndex + perPage)
            
            res.json({
                files: paginatedFiles,
                total,
                page,
                perPage,
                totalPages: Math.ceil(total / perPage)
            })
        } catch (error) {
            console.error('獲取檔案列表錯誤:', error)
            res.status(500).json({ error: '獲取檔案列表失敗' })
        }
    },

    // 下載檔案
    downloadFile: async (req, res) => {
        try {
            const { filename } = req.params
            const filePath = path.join(__dirname, '../uploads', filename)
            
            // 檢查檔案是否存在
            await fs.access(filePath)
            res.download(filePath)
        } catch (error) {
            console.error('下載檔案錯誤:', error)
            res.status(404).json({ error: '檔案不存在或下載失敗' })
        }
    },

    // 刪除檔案
    deleteFile: async (req, res) => {
        try {
            const { id } = req.params
            const page = parseInt(req.query.page) || 1
            const perPage = parseInt(req.query.perPage) || 7
            const logPath = path.join(__dirname, '../uploadLog.json')
            
            // 讀取日誌文件
            const logContent = await fs.readFile(logPath, 'utf8')
            let logs = JSON.parse(logContent)
            
            // 查找要刪除的檔案
            const fileIndex = logs.findIndex(f => f.id === parseInt(id))
            
            if (fileIndex === -1) {
                return res.status(404).json({ 
                    error: '找不到檔案',
                    success: false 
                })
            }
            
            const file = logs[fileIndex]
            const filePath = path.join(__dirname, '../uploads', file.fileName)
            
            // 刪除實體檔案
            try {
                await fs.unlink(filePath)
            } catch (error) {
                console.error('刪除檔案錯誤:', error)
            }
            
            // 從日誌中移除檔案記錄
            logs.splice(fileIndex, 1)
            await fs.writeFile(logPath, JSON.stringify(logs, null, 2), 'utf8')
            
            // 按照 ID 降序排序
            logs.sort((a, b) => b.id - a.id)
            
            // 計算新的分頁資訊
            const total = logs.length
            const totalPages = Math.ceil(total / perPage)
            
            // 調整當前頁碼
            let currentPage = page
            if (currentPage > totalPages) {
                currentPage = totalPages > 0 ? totalPages : 1
            }
            
            // 計算分頁數據
            const startIndex = (currentPage - 1) * perPage
            const paginatedFiles = logs.slice(startIndex, startIndex + perPage)
            
            res.json({ 
                message: '檔案已成功刪除',
                success: true,
                data: {
                    files: paginatedFiles,
                    total,
                    page: currentPage,
                    perPage,
                    totalPages
                }
            })
        } catch (error) {
            console.error('刪除檔案錯誤:', error)
            res.status(500).json({ 
                error: '刪除檔案失敗',
                success: false,
                detail: error.message 
            })
        }
    },

    // 重置 ID 計數器
    resetId: async (req, res) => {
        try {
            await saveId(0)
            res.json({ message: 'ID 計數器已重置' })
        } catch (error) {
            res.status(500).json({ error: '重置 ID 計數器失敗' })
        }
    }
}

module.exports = fileController;
