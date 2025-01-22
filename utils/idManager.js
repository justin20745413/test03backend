// utils/idManager.js
const fs = require('fs').promises;
const path = require('path');
const idCounterPath = path.join(__dirname, '../idCounter.json');

async function getNextId() {
    try {
        let data = { currentId: 0 };
        try {
            const fileContent = await fs.readFile(idCounterPath, 'utf8');
            data = JSON.parse(fileContent);
        } catch (error) {
        }
        
        const nextId = data.currentId + 1;
        await fs.writeFile(idCounterPath, JSON.stringify({ currentId: nextId }));
        return nextId;
    } catch (error) {
        throw new Error('獲取ID失敗');
    }
}

async function saveId(id) {
    try {
        await fs.writeFile(idCounterPath, JSON.stringify({ currentId: id }));
    } catch (error) {
        throw new Error('保存ID失敗');
    }
}

module.exports = { getNextId, saveId };