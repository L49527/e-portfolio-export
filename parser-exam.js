/**
 * 測驗資料解析器擴展
 * 處理 Excel 轉出的 HTML 表格資料
 */

// 擴展 EPortfolioParser 類別，增加測驗資料解析功能
EPortfolioParser.prototype.isExcelTable = function (doc) {
    // 檢查是否有 Excel 的 meta 標籤
    const excelMeta = doc.querySelector('meta[name="ProgId"][content*="Excel"]') ||
        doc.querySelector('meta[name="Generator"][content*="Excel"]');

    // 檢查是否有表格且標題包含「測驗」「成績」等關鍵字
    const hasTable = doc.querySelector('table');
    const title = doc.title || '';
    const hasExamKeywords = title.includes('測驗') || title.includes('成績') || title.includes('考試');

    return (excelMeta || hasExamKeywords) && hasTable;
};

EPortfolioParser.prototype.parseExamTable = function (filename, htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const results = [];

    // 檢查是否為 Excel 表格
    if (!this.isExcelTable(doc)) {
        return results;
    }

    // 找到表格
    const table = doc.querySelector('table');
    if (!table) {
        console.warn('找不到表格');
        return results;
    }

    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) {
        console.warn('表格資料不足');
        return results;
    }

    // 從第二行開始解析資料（第一行是表頭）
    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length < 6) continue; // 至少需要6個欄位

        const item = {
            "檔名": filename,
            "測驗目標": cells[0] ? cells[0].textContent.trim() : "",
            "試卷名稱": cells[1] ? cells[1].textContent.trim() : "",
            "出題教師": cells[3] ? cells[3].textContent.trim() : "",
            "學員姓名": cells[4] ? cells[4].textContent.trim() : "",
            "應完成日": cells[5] ? cells[5].textContent.trim() : "",
            "分數": cells[6] ? cells[6].textContent.trim() : "",
            // 標記為測驗資料
            "_dataType": "EXAM"
        };

        // 過濾掉空白列
        if (item["學員姓名"] && item["學員姓名"].length > 0) {
            results.push(item);
        }
    }

    return results;
};

// 支援自動檢測檔案類型並選擇對應的解析器
EPortfolioParser.prototype.parseAuto = function (filename, htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 判斷是否為測驗資料表格
    if (this.isExcelTable(doc)) {
        const examData = this.parseExamTable(filename, htmlContent);
        console.log(`解析測驗資料：${filename}，共 ${examData.length} 筆`);
        return examData;
    }

    // 否則使用原有的評量表單解析
    const formData = this.parseHTML(filename, htmlContent);
    if (formData) {
        formData._dataType = "EVALUATION";
        return [formData];
    }

    return [];
};
