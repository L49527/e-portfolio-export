/**
 * E-Portfolio Parser - 客戶端 HTML 解析引擎
 * 轉換自 Python 版本，完全在瀏覽器中運行
 */

class EPortfolioParser {
    constructor() {
        this.VERSION = "e-portfolio-export v1.0 Web";

        // 優先辨識的評分項目
        this.PRIORITY_SCORE_ITEMS = [
            '一般診斷攝影與品保', '特殊攝影與介入性診療與品保', '血管攝影與品保',
            '超音波造影與品保', '心導管技術與品保', '磁振造影與品保',
            '電腦斷層造影與品保', '放射醫學影像品保', '其它放射診斷技術與儀器設備品保',
            '品德操守'
        ];

        // 回饋相關欄位
        this.FEEDBACK_ITEM_KEYS = ['表現良好項目', '建議加強項目', '學員回饋意見'];

        // 表單關鍵字
        this.EPA_KEYWORDS = ['EPA'];
        this.MILESTONE_KEYWORDS = ['Milestone', '里程碑'];

        // EPA 特殊評分項目
        this.EPA_SPECIFIC_SCORE_ITEMS = [
            'OPA1：檢查前準備', 'OPA2：執行攝影檢查', 'OPA3：檢查後處置'
        ];
    }

    /**
     * 清洗字串中的多餘空白與特殊符號
     */
    cleanText(text) {
        if (!text) return "";
        return text.replace(/[:：\s\n*]/g, '').trim();
    }

    /**
     * 嘗試抓取表單定義的滿分
     */
    extractFullScore(doc, pageText, titleStr = "") {
        if (titleStr.includes("到職訓練評量表-影像醫學科")) {
            return "125";
        }
        if (titleStr.includes("職前自我評估表-影像醫學科")) {
            return "235";
        }

        const fullMatch = pageText.match(/滿分[：\s]*(\d+)/);
        if (fullMatch) return fullMatch[1];

        // 尋找包含滿分的文字
        const allText = doc.body.textContent;
        const hintMatch = allText.match(/\(滿分\s*(\d+)\s*\)/);
        if (hintMatch) return hintMatch[1];

        return "100";
    }

    /**
     * 擷取文字回饋內容
     */
    extractAllTextFeedbacks(doc) {
        const feedbacks = [];
        const textareas = doc.querySelectorAll('textarea');

        textareas.forEach(ta => {
            let content = ta.textContent.trim() || ta.value.trim();
            if (content && content.length > 1) {
                // 過濾無效內容
                if (content.includes("畫圖") || content.includes("BOM") ||
                    content.includes("template") || content.includes("圖檔")) {
                    return;
                }
                // 過濾純數字
                if (/^\d+(?:\s\d+)*$/.test(content)) return;
                // 過濾過短且無字母的內容
                if (content.length <= 2 && !/[a-zA-Z]/.test(content)) return;

                feedbacks.push(content);
            }
        });

        // 去重
        return [...new Set(feedbacks)];
    }

    /**
     * 解析 HTML 檔案
     */
    parseHTML(filename, htmlContent) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            const pageText = doc.body.textContent;

            // 取得標題
            const titleStr = doc.title || "未命名表單";

            // 表單類型判定
            const isDopsMiniCexCbdForm = titleStr.includes('DOPS') || titleStr.includes('mini-CEX') || titleStr.includes('CBD') || titleStr.includes('CbD');
            const isOverallFeedbackForm = titleStr.includes('整體實習成效');
            const isEpaForm = this.EPA_KEYWORDS.some(k => titleStr.includes(k));
            const isMilestoneForm = this.MILESTONE_KEYWORDS.some(k => titleStr.includes(k));

            // --- 儀器別擷取邏輯 ---
            let instrumentCategory = "";

            // A. 從標題抓取
            const instrumentMatch = titleStr.match(/\d+(?:\.\d+)*\.?\s*[-_—]*\s*(.+)$/);
            if (instrumentMatch) {
                instrumentCategory = instrumentMatch[1].replace(/^[-\s_—]+/, '');
            }

            // B. 從階段/子階段 fallback (特別針對 Milestone)
            if (!instrumentCategory || isMilestoneForm) {
                const stageDt = Array.from(doc.querySelectorAll('dt')).find(dt =>
                    dt.textContent.includes('階段/子階段')
                );
                if (stageDt) {
                    const stageDd = stageDt.nextElementSibling;
                    if (stageDd && stageDd.tagName === 'DD') {
                        const fullStage = stageDd.textContent.trim();
                        const rawInstrument = fullStage.includes('/') ?
                            fullStage.split('/').pop() : fullStage;
                        const m = rawInstrument.match(/\d+\.(.+)/);
                        instrumentCategory = m ? m[1].split('-')[0].trim() : rawInstrument;
                    }
                }
            }

            // 原有的編碼抓取
            const titleCodeMatch = titleStr.match(/^(\d+\.\d+)/);
            const titleCode = titleCodeMatch ? titleCodeMatch[1] : null;

            const item = {
                "來源檔案": filename,
                "表單標題": titleStr,
                "儀器別": instrumentCategory,
                "學員姓名": "未知",
                "教師/主持人": "未註明",
                "執行日期": "未知",
                "科別": "影像醫學科",
                "總分": "",
                "滿分": "",
                "各項評分詳情": {},
                "表現良好項目": "",
                "建議加強項目": "",
                "學員回饋意見": "",
                "評語/心得": ""
            };

            // 1. 姓名提取
            const sMatch = pageText.match(/([\u4e00-\u9fa5]{2,10})\s*\(學員\)/);
            if (sMatch) {
                item["學員姓名"] = sMatch[1];
            } else {
                const studentDt = Array.from(doc.querySelectorAll('dt, th, td')).find(el =>
                    /學員|受評人/.test(el.textContent)
                );
                if (studentDt) {
                    const target = studentDt.nextElementSibling ||
                        studentDt.closest('tr')?.querySelector('td:nth-child(2)');
                    if (target) item["學員姓名"] = target.textContent.trim();
                }
            }

            // 2. 教師提取 (改進版本以支援各種表單結構)
            // 方法 1: 尋找包含「臨床教師」等關鍵字的 label，然後找對應的 input 或 dd
            const mentorKeywords = /計畫導師|負責人員|主持人|臨床教師|評量教師/;
            let foundTeacher = false;

            // 先檢查 form-group 結構（常見於 DOPS/Mini-CEX）
            const formGroups = doc.querySelectorAll('.form-group, tr');
            for (const group of formGroups) {
                const labels = group.querySelectorAll('label, th, dt');
                for (const lbl of labels) {
                    if (mentorKeywords.test(lbl.textContent)) {
                        // 找到相關標籤，現在尋找對應的值

                        // 優先找 input[type="text"] 元素（DOPS/Mini-CEX 的情況）
                        let inputField = group.querySelector('input[type="text"]');
                        if (inputField && inputField.value) {
                            const val = inputField.value.trim();
                            if (val && val !== item["學員姓名"] && !/^\d+$/.test(val) && val.length >= 2) {
                                item["教師/主持人"] = val;
                                foundTeacher = true;
                                break;
                            }
                        }

                        // 如果沒有 input，嘗試找 dd 或 td
                        if (!foundTeacher) {
                            let target = lbl.nextElementSibling;
                            if (target && (target.tagName === 'DD' || target.tagName === 'TD')) {
                                const sigName = target.querySelector('.e_signature_name');
                                let val = sigName ? sigName.textContent.trim() : target.textContent.trim();
                                val = val.split('\n')[0].trim();

                                if (val && val !== item["學員姓名"] && !/^\d+$/.test(val) && val.length >= 2) {
                                    item["教師/主持人"] = val;
                                    foundTeacher = true;
                                    break;
                                }
                            }
                        }

                        // 對於 table 結構，找同一行的第二個 td
                        if (!foundTeacher && group.tagName === 'TR') {
                            const cells = group.querySelectorAll('td');
                            if (cells.length >= 2) {
                                let val = cells[1].textContent.trim();
                                val = val.split('\n')[0].trim();
                                if (val && val !== item["學員姓名"] && !/^\d+$/.test(val) && val.length >= 2) {
                                    item["教師/主持人"] = val;
                                    foundTeacher = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (foundTeacher) break;
            }

            // 方法 2: 備用方案 - 從文字中提取包含「教師」等關鍵字的姓名
            if (!foundTeacher) {
                const tMatches = pageText.match(/([\u4e00-\u9fa5]{2,10})\s*\([^)]*(?:教師|師資|導師|負責人|主持人|醫師|評定者|評估者)[^)]*\)/g);
                if (tMatches) {
                    for (const match of tMatches) {
                        const name = match.match(/([\u4e00-\u9fa5]{2,10})/)[1];
                        if (name !== item["學員姓名"] && !/^\d+$/.test(name)) {
                            item["教師/主持人"] = name;
                            break;
                        }
                    }
                }
            }

            // 3. 日期與滿分偵測
            const dateMatch = pageText.match(/(評量日期|測驗日期|執行日期|日期)[：\s]*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
            if (dateMatch) {
                item["執行日期"] = dateMatch[2].replace(/\//g, '-');
            } else {
                const simpleDate = pageText.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
                if (simpleDate) item["執行日期"] = simpleDate[1].replace(/\//g, '-');
            }

            item["滿分"] = this.extractFullScore(doc, pageText, titleStr);
            const maxLimit = parseFloat(item["滿分"]) || 100.0;

            // 判斷是否為需要手動計算總分的表單類型
            const isTrainingEvalForm = titleStr.includes("到職訓練評量表");
            const isSelfAssessForm = titleStr.includes("職前自我評估表");

            // 4. 總分抓取
            if (isEpaForm || isOverallFeedbackForm || isMilestoneForm) {
                item["總分"] = "";
            } else if (isTrainingEvalForm || isSelfAssessForm) {
                // 到職訓練評量表 和 職前自我評估表：手動計算所有 ScaleType 選項的總分
                let totalScore = 0;
                const scaleRadios = doc.querySelectorAll('input[type="radio"][name^="ScaleType"]:checked');
                for (const radio of scaleRadios) {
                    const val = parseFloat(radio.value);
                    if (!isNaN(val)) {
                        totalScore += val;
                    }
                }
                if (totalScore > 0) {
                    item["總分"] = totalScore.toString();
                }
            } else {
                let foundTotal = false;
                const inputs = doc.querySelectorAll('input[value]');

                for (const inp of inputs) {
                    const parentText = inp.parentElement?.textContent || "";
                    if (/總成績|總分|平均分數/.test(parentText)) {
                        const val = inp.value;
                        if (/^\d+\.?\d*$/.test(val)) {
                            const fVal = parseFloat(val);
                            if ((!titleCode || val !== titleCode) &&
                                fVal > 0 && fVal <= maxLimit && fVal > 10) {
                                item["總分"] = val;
                                foundTotal = true;
                                break;
                            }
                        }
                    }
                }

                if (!foundTotal) {
                    const tags = doc.querySelectorAll('label, td, th, span, b');
                    for (const tag of tags) {
                        const textContent = tag.textContent.trim();
                        if (/總成績|總分|平均分數/.test(textContent)) {
                            const valMatch = textContent.match(/(\d{2,3}(?:\.\d+)?)/);
                            if (valMatch) {
                                const val = valMatch[1];
                                if ((!titleCode || val !== titleCode) && parseFloat(val) <= maxLimit) {
                                    item["總分"] = val;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // 5. 各項評分抓取
            if (isMilestoneForm) {
                // --- Milestone 專屬 Level 抓取邏輯 ---
                const formGroups = doc.querySelectorAll('.form-group');
                for (const group of formGroups) {
                    if (group.textContent.includes("Level")) {
                        const labelTag = group.querySelector('label.col-sm-2');
                        if (labelTag) {
                            const question = labelTag.textContent.trim();
                            const checkedRadio = group.querySelector('input[type="radio"]:checked');
                            if (checkedRadio) {
                                const ansId = checkedRadio.id;
                                const ansLabel = group.querySelector(`label[for="${ansId}"]`);
                                const scoreVal = ansLabel ? ansLabel.textContent.trim() :
                                    checkedRadio.nextSibling?.textContent?.trim() || '';
                                item["各項評分詳情"][question] = scoreVal;
                            }
                        }
                    }
                }
            } else if (isEpaForm) {
                // --- EPA 邏輯 ---
                const formGroups = doc.querySelectorAll('.form-group');
                let currentOpa = null;

                for (const group of formGroups) {
                    const questionLabelTag = group.querySelector('label.col-sm-2');
                    const questionText = questionLabelTag ? questionLabelTag.textContent.trim() : "";
                    const checkedInput = group.querySelector('input[type="radio"]:checked');

                    if (checkedInput) {
                        const inputId = checkedInput.id;
                        const optionLabelTag = group.querySelector(`label[for="${inputId}"]`);
                        if (optionLabelTag) {
                            const optionText = optionLabelTag.textContent.trim();
                            if (optionText.includes("OPA")) {
                                const match = optionText.match(/(OPA\d+)/);
                                if (match) currentOpa = match[1];
                            }
                            if (currentOpa && questionText.includes("整體任務")) {
                                let keyToUse = currentOpa;
                                for (const definedItem of this.EPA_SPECIFIC_SCORE_ITEMS) {
                                    if (definedItem.startsWith(currentOpa)) {
                                        keyToUse = definedItem;
                                        break;
                                    }
                                }
                                item["各項評分詳情"][keyToUse] = optionText;
                            }
                        }
                    }
                }
            } else if (isDopsMiniCexCbdForm) {
                // --- DOPS/mini-CEX/CBD 邏輯 ---
                const feedbackMapping = {
                    '表現良好項目': ["表現良好", "表現優良", "良好項目"],
                    '建議加強項目': ["建議加強", "建議改善", "加強項目"],
                    '學員回饋意見': ["學員回饋", "學員意見"]
                };

                // 方法：遍歷所有 form-group，檢查其中的 label/p 是否包含關鍵字
                const allGroups = doc.querySelectorAll('.form-group, tr, fieldset');

                for (const group of allGroups) {
                    // 在這個 group 中找所有的 label, p, th, td
                    const labels = group.querySelectorAll('label, p, th, td');

                    for (const lbl of labels) {
                        const labelText = lbl.textContent.trim();

                        // 跳過太長的文字（避免抓到整段內容）
                        if (labelText.length > 100) continue;

                        // 檢查每個欄位
                        for (const [fieldName, keywords] of Object.entries(feedbackMapping)) {
                            // 如果已經找到這個欄位，跳過
                            if (item[fieldName]) continue;

                            // 檢查是否匹配關鍵字
                            const matched = keywords.some(keyword => labelText.includes(keyword));

                            if (matched) {
                                // 在這個 group 中找 textarea
                                const textarea = group.querySelector('textarea');
                                if (textarea) {
                                    const content = textarea.textContent.trim() || textarea.value.trim();
                                    if (content && content.length > 5) {
                                        item[fieldName] = content;
                                        break; // 找到後跳出關鍵字循環
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // --- 一般表單邏輯 ---
                const blacklist = [
                    '姓名', '學號', '日期', '職稱', '科別', '醫院', '年', '月', '日', '序號', 'ID',
                    '覆蓋舊檔案', '刪除', '下載', '圖檔', '畫圖', '地點', '代碼', '滿分', '及格分數',
                    '臨床教師對本次評量滿意程度', '觀察時間', '回饋時間', '組別', '職級'
                ];

                const containers = doc.querySelectorAll('tr, .form-group, .question-row');
                for (const container of containers) {
                    const lblCandidates = container.querySelectorAll('td, th, label');
                    if (lblCandidates.length === 0) continue;

                    let lblToUse = null;
                    const cleanedLbls = Array.from(lblCandidates)
                        .map(lc => this.cleanText(lc.textContent))
                        .filter(t => t);

                    // 優先檢查
                    for (const pItem of this.PRIORITY_SCORE_ITEMS) {
                        if (cleanedLbls.includes(pItem)) {
                            lblToUse = pItem;
                            break;
                        }
                    }

                    if (!lblToUse) {
                        const firstLblTxt = this.cleanText(lblCandidates[0].textContent);
                        if (/^\d+$/.test(firstLblTxt) && firstLblTxt.length > 3) continue;
                        if (!firstLblTxt || blacklist.some(b => firstLblTxt.includes(b)) ||
                            firstLblTxt.length < 2) continue;
                        lblToUse = firstLblTxt;
                    }

                    let scoreVal = null;
                    const checkedRadio = container.querySelector('input[type="radio"]:checked');
                    if (checkedRadio) {
                        scoreVal = this.cleanText(checkedRadio.parentElement?.textContent ||
                            checkedRadio.value);
                    }

                    if (!scoreVal) {
                        const inp = container.querySelector('input[value]');
                        if (inp) {
                            const val = inp.value;
                            if (/^\d+\.?\d*$/.test(val) && val.length < 5 && val !== titleCode) {
                                scoreVal = val;
                            }
                        }
                    }

                    if (scoreVal && lblToUse) {
                        item["各項評分詳情"][lblToUse] = scoreVal;
                    }
                }
            }

            // 6. 文字評語 (通用)
            if (isOverallFeedbackForm) {
                const overallFeedbacks = this.extractAllTextFeedbacks(doc);
                if (overallFeedbacks.length > 0) {
                    item["評語/心得"] = overallFeedbacks.join(" | ");
                }
            } else if (!isDopsMiniCexCbdForm && !isEpaForm && !item['評語/心得']) {
                const generalFeedbacks = this.extractAllTextFeedbacks(doc);
                if (generalFeedbacks.length > 0) {
                    item["評語/心得"] = generalFeedbacks.join(" | ");
                }
            }

            // 7. 科別判定
            if (titleStr.includes("核子") || titleStr.includes("4.")) {
                item["科別"] = "核子醫學科";
            } else if (titleStr.includes("放射") || titleStr.includes("3.") || titleStr.includes("3-")) {
                item["科別"] = "放射治療科";
            }

            // 嘗試從表單資訊區塊更正科別
            const infoDl = doc.querySelector('dl.dl-horizontal');
            if (infoDl) {
                const dtTags = infoDl.querySelectorAll('dt');
                for (const dt of dtTags) {
                    if (/科別|階段/.test(dt.textContent)) {
                        const dd = dt.nextElementSibling;
                        if (dd) {
                            const deptText = this.cleanText(dd.textContent);
                            if (deptText.includes("核子")) {
                                item["科別"] = "核子醫學科";
                            } else if (deptText.includes("放射") && !deptText.includes("影像")) {
                                item["科別"] = "放射治療科";
                            }
                            break;
                        }
                    }
                }
            }

            return item;
        } catch (e) {
            console.error(`解析失敗 ${filename}:`, e);
            return null;
        }
    }
}
