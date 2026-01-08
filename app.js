/**
 * E-Portfolio Web App - 主應用程式
 * 處理檔案上傳、解析、預覽和匯出
 */

let parsedData = [];
const parser = new EPortfolioParser();

// DOM 元素
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const dataTable = document.getElementById('dataTable');
const exportBtn = document.getElementById('exportBtn');
const fileCount = document.getElementById('fileCount');
const statusMessage = document.getElementById('statusMessage');

/**
 * 初始化應用程式
 */
function init() {
    // 點擊上傳區域觸發檔案選擇
    dropZone.addEventListener('click', () => fileInput.click());

    // 檔案選擇處理
    fileInput.addEventListener('change', handleFileSelect);

    // 拖放處理
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFileSelect({ target: { files: e.dataTransfer.files } });
    });

    // 匯出按鈕
    exportBtn.addEventListener('click', exportToCSV);
}

/**
 * 處理檔案選擇
 */
async function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    const htmlFiles = files.filter(f => f.name.endsWith('.html') || f.name.endsWith('.htm'));
    const csvFiles = files.filter(f => f.name.endsWith('.csv'));

    if (htmlFiles.length === 0 && csvFiles.length === 0) {
        showStatus('請選擇 HTML 或 CSV 檔案', 'error');
        return;
    }

    const totalFiles = htmlFiles.length + csvFiles.length;
    showStatus(`正在解析 ${totalFiles} 個檔案...`, 'info');
    parsedData = [];

    // 解析 HTML 檔案
    for (const file of htmlFiles) {
        try {
            const content = await readFileAsText(file);
            // 使用 parseAuto 自動判斷檔案類型（評量表單或測驗資料）
            const results = parser.parseAuto(file.name, content);
            if (results && results.length > 0) {
                parsedData.push(...results);
            }
        } catch (e) {
            console.error(`讀取檔案 ${file.name} 失敗:`, e);
        }
    }

    // 解析 CSV 檔案
    for (const file of csvFiles) {
        try {
            const content = await readFileAsText(file);
            const results = parseCSV(file.name, content);
            if (results && results.length > 0) {
                parsedData.push(...results);
            }
        } catch (e) {
            console.error(`讀取 CSV 檔案 ${file.name} 失敗:`, e);
        }
    }

    if (parsedData.length > 0) {
        showStatus(`成功解析 ${parsedData.length} 筆資料（來自 ${totalFiles} 個檔案）`, 'success');
        renderPreview();
    } else {
        showStatus('未能解析任何檔案', 'error');
    }
}

/**
 * 解析 CSV 檔案內容
 */
function parseCSV(filename, content) {
    const results = [];

    // 移除 BOM 標記
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }

    // 分割行
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
        console.warn(`CSV 檔案 ${filename} 資料不足`);
        return results;
    }

    // 解析表頭
    const headers = parseCSVLine(lines[0]);

    // 解析資料行
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0) continue;

        const item = {
            "來源檔案": filename,
            "_dataType": "CSV"
        };

        // 將每個欄位對應到物件
        for (let j = 0; j < headers.length && j < values.length; j++) {
            const header = headers[j].trim();
            if (header) {
                item[header] = values[j];
            }
        }

        results.push(item);
    }

    console.log(`解析 CSV：${filename}，共 ${results.length} 筆`);
    return results;
}

/**
 * 解析 CSV 行（處理引號和逗號）
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // 跳脫的引號
                current += '"';
                i++;
            } else if (char === '"') {
                // 結束引號
                inQuotes = false;
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                // 開始引號
                inQuotes = true;
            } else if (char === ',') {
                // 分隔符
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }

    // 加入最後一個欄位
    result.push(current.trim());

    return result;
}

/**
 * 讀取檔案為文字
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
    });
}

/**
 * 顯示狀態訊息
 */
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';

    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
}

/**
 * 渲染預覽表格
 */
function renderPreview() {
    previewSection.style.display = 'block';
    fileCount.textContent = parsedData.length;

    // 收集所有可能的欄位
    const allColumns = new Set();
    parsedData.forEach(item => {
        Object.keys(item).forEach(key => {
            if (key !== '各項評分詳情') {
                allColumns.add(key);
            }
        });

        // 展開各項評分詳情
        if (item['各項評分詳情']) {
            Object.keys(item['各項評分詳情']).forEach(key => {
                allColumns.add(key);
            });
        }
    });

    // 定義欄位順序（包含評量表單和測驗資料的欄位）
    const coreColumns = [
        // 通用欄位
        "來源檔案", "檔名",
        // 評量表單欄位
        "執行日期", "學員姓名", "教師/主持人", "科別", "儀器別",
        "總分", "滿分", "表單標題", "表現良好項目", "建議加強項目",
        "學員回饋意見", "評語/心得",
        // 測驗資料欄位
        "測驗目標", "試卷名稱", "出題教師", "應完成日", "分數"
    ];

    // 排序欄位
    const orderedColumns = [
        ...coreColumns.filter(col => allColumns.has(col)),
        ...Array.from(allColumns).filter(col => !coreColumns.includes(col))
    ];

    // 建立表格標題
    const thead = dataTable.querySelector('thead tr');
    thead.innerHTML = orderedColumns.map(col =>
        `<th>${escapeHtml(col)}</th>`
    ).join('');

    // 建立表格內容
    const tbody = dataTable.querySelector('tbody');
    tbody.innerHTML = parsedData.map(item => {
        const row = orderedColumns.map(col => {
            let value = item[col] || '';

            // 如果欄位在各項評分詳情中
            if (!value && item['各項評分詳情']) {
                value = item['各項評分詳情'][col] || '';
            }

            // 截斷過長的文字
            if (typeof value === 'string' && value.length > 100) {
                value = value.substring(0, 100) + '...';
            }

            return `<td title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</td>`;
        }).join('');

        return `<tr>${row}</tr>`;
    }).join('');

    // 啟用匯出按鈕
    exportBtn.disabled = false;
}

/**
 * 匯出為 CSV
 */
function exportToCSV() {
    if (parsedData.length === 0) {
        showStatus('沒有資料可匯出', 'error');
        return;
    }

    // 收集所有欄位
    const allColumns = new Set();
    parsedData.forEach(item => {
        Object.keys(item).forEach(key => {
            if (key !== '各項評分詳情') {
                allColumns.add(key);
            }
        });

        if (item['各項評分詳情']) {
            Object.keys(item['各項評分詳情']).forEach(key => {
                allColumns.add(key);
            });
        }
    });

    // 定義欄位順序（包含評量表單和測驗資料的欄位）
    const coreColumns = [
        // 通用欄位
        "來源檔案", "檔名",
        // 評量表單欄位
        "執行日期", "學員姓名", "教師/主持人", "科別", "儀器別",
        "總分", "滿分", "表單標題", "表現良好項目", "建議加強項目",
        "學員回饋意見", "評語/心得",
        // 測驗資料欄位
        "測驗目標", "試卷名稱", "出題教師", "應完成日", "分數"
    ];

    const orderedColumns = [
        ...coreColumns.filter(col => allColumns.has(col)),
        ...Array.from(allColumns).filter(col => !coreColumns.includes(col))
    ];

    // 建立 CSV 內容
    let csv = '\uFEFF'; // UTF-8 BOM
    csv += orderedColumns.map(col => `"${col}"`).join(',') + '\n';

    parsedData.forEach(item => {
        const row = orderedColumns.map(col => {
            let value = item[col] || '';

            if (!value && item['各項評分詳情']) {
                value = item['各項評分詳情'][col] || '';
            }

            // 轉換為字串並處理特殊字元
            value = String(value).replace(/"/g, '""');
            return `"${value}"`;
        });

        csv += row.join(',') + '\n';
    });

    // 建立下載連結
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `醫學影像部評量分析結果_${timestamp}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showStatus(`已匯出 ${parsedData.length} 筆資料至 ${filename}`, 'success');
}

/**
 * 跳脫 HTML 特殊字元
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// 初始化應用程式
document.addEventListener('DOMContentLoaded', init);
