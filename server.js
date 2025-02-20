const express = require('express');
const cors = require('cors');
const path = require('path');
const fileRoutes = require('./routes/fileRoutes');
const imgScrollRoutes = require('./routes/imgScrollRoutes');

const app = express();

// CORS 設定
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'https://justin20745413.github.io',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// 處理預檢請求
app.options('*', cors());

// JSON 解析
app.use(express.json());

// 設定靜態檔案（提供檔案下載）
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// 使用文件路由
app.use('/api', fileRoutes);

// 添加新的路由
app.use('/api', imgScrollRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
