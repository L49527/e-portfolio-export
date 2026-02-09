function analyzeHTML(raw) {
    try {
        let parser = new DOMParser();
        let doc = parser.parseFromString(raw, "text/html");
        let cleanText = doc.body.innerText.replace(/\s+/g, ' ');

        let item = {
            id: Math.random().toString(36).substr(2, 9),
            type: '評量表', department: '影像醫學科', title: doc.title || "評量表", date: '1900-01-01',
            scoreRaw: '', studentName: '未知', teacherName: '未註明',
            subScores: { knowledge: '', operation: '', attitude: '' },
            stationScores: [], feedbacks: [], showSubscores: false,
            isInternGeneralFeedback: false,
            opaScores: { opa1: '', opa2: '', opa3: '' },  // EPA OPA 分數
            instrument: '' // 新增儀器別
        };

        // --- 1. 偵測類型 (v5.2 Refined) ---
        const ut = item.title.toUpperCase();
        item.isInternGeneralFeedback = ut.includes('醫事放射實習生總回饋');
        const isEffectivenessFeedback = ut.includes('整體實習成效回饋');

        // 優先判定特殊回饋單
        if (ut.includes('醫事放射實習生總回饋') || ut.includes('整體實習成效回饋') || ut.includes('回饋單') || ut.includes('FEEDBACK') || ut.includes('反應表')) {
            item.type = '學員回饋單';
        }
        // 總評量表類
        else if (ut.includes('總評量表') || ut.includes('成績總評') || ut.includes('到職訓練') || ut.includes('職前自我評估') || ut.includes('學期測驗') || ut.includes('成績紀錄表')) {
            item.type = '實習總評量表';
        }
        // 標準評量
        else if (ut.includes('EPA')) item.type = 'EPA';
        else if (ut.includes('MILESTONE') || ut.includes('里程碑')) item.type = 'Milestone';
        else if (ut.includes('DOPS') || ut.includes('PROCEDURAL') || ut.includes('PROCEDURAL SKILLS') || ut.includes('操作技能直接觀察')) item.type = 'DOPS';
        else if (ut.includes('MINI-CEX') || ut.includes('MINI CEX') || ut.includes('CEX') || ut.includes('臨床演練')) item.type = 'Mini-CEX';
        else if (ut.includes('CBD') || ut.includes('案例討論')) item.type = 'CbD';
        else if (ut.includes('1.1') || ut.includes('基礎課程')) item.type = '基礎課程'; // 保留以相容舊邏輯
        else { item.type = '單站評量'; } // 預設

        let instrument = '';
        // v1.0: 嘗試從 radio button 選項提取 (操作項目)
        let radioMatch = raw.match(/操作項目[\s\S]*?checked[\s\S]*?value="([^"]+)"/i);
        if (radioMatch) { instrument = radioMatch[1].trim(); }
        // v1.0: 嘗試從評量類別 input 提取 (核子醫學科 DOPS 專用)
        if (!instrument) {
            let categoryMatch = raw.match(/評量類別[\s\S]*?value="([^"]+)"/i);
            if (categoryMatch) { instrument = categoryMatch[1].trim(); }
        }
        // v1.0: 嘗試從操作項目文字提取
        if (!instrument) {
            let opMatch = cleanText.match(/操作項目[:：\s]*([\u4e00-\u9fa5a-zA-Z0-9\-\s().]+)/);
            if (opMatch) { instrument = opMatch[1].trim(); }
        }

        // v1.0: 關鍵字標準化 (以標題或操作項目判定)
        const iTitle = (item.title + ' ' + instrument).toUpperCase();
        const iTitleOrig = item.title + ' ' + instrument; // 保留原始大小寫用於中文判定

        // 如果已經從 radio button 抓到 instrument，直接使用 (最優先)
        if (instrument && instrument !== '') {
            item.instrument = instrument;
        }
        // 心導管 (優先判定，避免被其他規則搶走)
        else if (iTitleOrig.includes('心導管') || iTitle.includes('CATH LAB') || iTitle.includes('CARDIAC CATH')) item.instrument = '心導管';
        // 模擬攝影 (放射治療專用)
        else if (iTitleOrig.includes('模擬攝影') || iTitleOrig.includes('模擬定位') || iTitle.includes('SIMULATOR') || iTitle.includes('CT SIM')) item.instrument = '模擬攝影';
        // PET/CT 與 PET 優先判定 (避免被 CT 搶走)
        else if (iTitle.includes('PET/CT') || iTitle.includes('PET-CT') || iTitle.includes('PETCT')) item.instrument = 'PET/CT';
        else if (iTitle.includes('PET') && !iTitle.includes('PET/CT')) item.instrument = 'PET';
        // SPECT/CT 與 SPECT
        else if (iTitle.includes('SPECT/CT') || iTitle.includes('SPECT-CT')) item.instrument = 'SPECT/CT';
        else if (iTitle.includes('SPECT')) item.instrument = 'SPECT';
        // CT (需使用 word boundary 避免匹配 'Direct' 等單字)
        else if (/\bCT\b/.test(iTitle) || iTitleOrig.includes('電腦斷層')) item.instrument = 'CT';
        else if (/\bMRI\b/.test(iTitle) || iTitleOrig.includes('磁振') || /\bMR\b/.test(iTitle)) item.instrument = 'MRI';
        // C-arm / 移動式X光機
        else if (iTitle.includes('C-ARM') || iTitle.includes('CARM') || iTitle.includes('C ARM')) item.instrument = 'C-arm';
        else if (iTitle.includes('ANGIO') || iTitleOrig.includes('血管') || iTitle.includes('DSA')) item.instrument = 'Angio';
        else if (iTitle.includes('MAMMO') || iTitleOrig.includes('乳房') || iTitleOrig.includes('乳攝')) item.instrument = 'Mammo';
        // BMD / DEXA / 骨密度
        else if (iTitle.includes('DEXA') || iTitle.includes('DXA') || iTitle.includes('BMD') || iTitleOrig.includes('骨密') || iTitleOrig.includes('骨質密度')) item.instrument = 'DEXA';
        else if (iTitle.includes('BONE') || iTitleOrig.includes('骨質')) item.instrument = 'Bone Scan';
        else if (iTitle.includes('FLUORO') || iTitleOrig.includes('透視') || /\bGI\b/.test(iTitle) || iTitle.includes('UGI') || iTitle.includes('LGI') || iTitleOrig.includes('鋇劑')) item.instrument = 'Fluoro';
        else if (iTitle.includes('ECHO') || iTitle.includes('ULTRASOUND') || iTitleOrig.includes('超音波') || iTitle.includes('SONO')) item.instrument = 'Echo';
        // Gamma Camera
        else if (iTitle.includes('GAMMA') || iTitleOrig.includes('伽瑪') || iTitleOrig.includes('閃爍')) item.instrument = 'Gamma Camera';
        // 核醫 (NM)
        else if (iTitle.includes('NUC') || iTitleOrig.includes('核醫') || /\bNM\b/.test(iTitle)) item.instrument = 'Nuc Med';
        // 放射治療相關
        else if (iTitle.includes('LINAC') || iTitleOrig.includes('直線加速器')) item.instrument = 'LINAC';
        else if (iTitle.includes('TOMO') || iTitleOrig.includes('螺旋斷層')) item.instrument = 'TomoTherapy';
        else if (iTitle.includes('BRACHY') || iTitleOrig.includes('近接')) item.instrument = 'Brachytherapy';
        else if (iTitle.includes('CYBER') || iTitleOrig.includes('電腦刀')) item.instrument = 'CyberKnife';
        else if (iTitle.includes('GAMMA KNIFE') || iTitleOrig.includes('加馬刀') || iTitleOrig.includes('伽瑪刀')) item.instrument = 'Gamma Knife';
        else if (iTitle.includes('PROTON') || iTitleOrig.includes('質子')) item.instrument = 'Proton';
        // 碎石機
        else if (iTitle.includes('LITHO') || iTitleOrig.includes('碎石') || iTitle.includes('ESWL')) item.instrument = 'Lithotripsy';
        // 牙科
        else if (iTitle.includes('DENTAL') || iTitleOrig.includes('牙') || iTitle.includes('PANO') || iTitle.includes('CEPH')) item.instrument = 'Dental';
        // 一般攝影 / X光
        else if (iTitle.includes('X-RAY') || iTitle.includes('XRAY') || iTitleOrig.includes('X光')) item.instrument = 'X-ray';
        else if (iTitle.includes('GENERAL') || /\bCR\b/.test(iTitle) || /\bDR\b/.test(iTitle) || iTitleOrig.includes('一般') || iTitle.includes('PORTABLE') || iTitleOrig.includes('移動式')) item.instrument = 'General';
        else { item.instrument = ''; }

        // --- 1.6 DOPS/Mini-CEX/CbD/Milestone/EPA 儀器別補充偵測 (從全文搜尋) ---
        const requiresInstrument = ['DOPS', 'Mini-CEX', 'CbD', 'Milestone', 'EPA'].includes(item.type);
        if (requiresInstrument && !item.instrument) {
            const fullText = cleanText.toUpperCase();
            // X-ray (一般診斷攝影)
            if (fullText.includes('一般診斷攝影') || fullText.includes('一般攝影') ||
                fullText.includes('X光') || fullText.includes('X 光') ||
                /\bX-RAY\b/.test(fullText) || /\bXRAY\b/.test(fullText) ||
                /\bBUCKY\b/.test(fullText)) {
                item.instrument = 'X-ray';
            }
            else if (/\bPET[\s\/\-]CT\b/.test(fullText)) item.instrument = 'PET/CT';
            else if (/\bSPECT[\s\/\-]CT\b/.test(fullText)) item.instrument = 'SPECT/CT';
            else if (fullText.includes('電腦斷層') || /\bCT\b/.test(fullText)) item.instrument = 'CT';
            else if (fullText.includes('磁振') || /\bMRI\b/.test(fullText)) item.instrument = 'MRI';
            else if (/\bC-ARM\b/.test(fullText)) item.instrument = 'C-arm';
            else if (fullText.includes('血管攝影') || /\bANGIO\b/.test(fullText) || /\bDSA\b/.test(fullText)) item.instrument = 'Angio';
            else if (fullText.includes('乳房攝影') || fullText.includes('乳攝') || /\bMAMMO\b/.test(fullText)) item.instrument = 'Mammo';
            else if (fullText.includes('骨密') || /\bDEXA\b/.test(fullText)) item.instrument = 'DEXA';
            else if (fullText.includes('透視') || fullText.includes('鋇劑') || /\bFLUORO\b/.test(fullText)) item.instrument = 'Fluoro';
            else if (fullText.includes('超音波') || /\bECHO\b/.test(fullText) || /\bSONO\b/.test(fullText)) item.instrument = 'Echo';
            else if (fullText.includes('核醫')) item.instrument = 'Nuc Med';
            else if (fullText.includes('直線加速器') || /\bLINAC\b/.test(fullText)) item.instrument = 'LINAC';
            else if (fullText.includes('放射治療')) item.instrument = 'RT';
            else if (/\bCR\b/.test(fullText) || /\bDR\b/.test(fullText)) item.instrument = 'General';
        }

        // --- 2. 精準科別判定 ---
        let codeMatch = item.title.match(/(\d+[.\-]\d+([.\-]\d+)?)/);
        let normCode = codeMatch ? codeMatch[0].replace(/-/g, '.') : "";
        if (normCode.startsWith('4.6') || normCode.startsWith('4.1')) item.department = '核子醫學科';
        else if (normCode.startsWith('3.6') || normCode.startsWith('3.1')) item.department = '放射治療科';
        else if (normCode.startsWith('2.1.5')) item.department = '心導管室';
        else if (normCode.startsWith('2.1') || normCode.startsWith('2.6') || normCode.startsWith('2.7')) item.department = '影像醫學科';

        let deptField = raw.match(/階段\/子階段[:：\s]*[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/i);
        if (deptField) {
            let d = deptField[1].trim();
            if (d.includes('心導管')) item.department = '心導管室';
            else if (d.includes('核子醫學')) item.department = '核子醫學科';
            else if (d.includes('放射治療') || d.includes('放射腫瘤')) item.department = '放射治療科';

            // v1.0: 從階段/子階段提取儀器別 (優先於標題判定)
            if (!item.instrument || item.instrument === '') {
                // 放射治療相關儀器
                if (d.includes('模擬攝影') || d.includes('模擬定位')) item.instrument = '模擬攝影';
                else if (d.includes('直線加速器') || d.includes('LINAC')) item.instrument = 'LINAC';
                else if (d.includes('模具製作')) item.instrument = '模具製作';
                else if (d.includes('治療計畫') || d.includes('TPS')) item.instrument = '治療計畫';
                else if (d.includes('劑量計算')) item.instrument = '劑量計算';
                else if (d.includes('近接治療') || d.includes('Brachy')) item.instrument = 'Brachytherapy';
                // 核醫相關儀器
                else if (d.includes('SPECT')) item.instrument = 'SPECT';
                else if (d.includes('PET')) item.instrument = 'PET';
                else if (d.includes('Gamma') || d.includes('伽瑪')) item.instrument = 'Gamma Camera';
                else if (d.includes('核醫藥物')) item.instrument = '核醫藥物';
                else if (d.includes('核醫治療')) item.instrument = '核醫治療';
                else if (d.includes('放射免疫')) item.instrument = '放射免疫';
                else if (d.includes('體內分析')) item.instrument = '體內分析';
                // 心導管
                else if (d.includes('心導管')) item.instrument = '心導管';
                // 影像醫學相關
                else if (d.includes('電腦斷層') || /\bCT\b/.test(d.toUpperCase())) item.instrument = 'CT';
                else if (d.includes('磁振') || /\bMRI\b/.test(d.toUpperCase())) item.instrument = 'MRI';
                else if (d.includes('血管攝影') || d.includes('Angio')) item.instrument = 'Angio';
                else if (d.includes('超音波')) item.instrument = 'Echo';
                else if (d.includes('乳房') || d.includes('乳攝')) item.instrument = 'Mammo';
                else if (d.includes('透視') || d.includes('Fluoro')) item.instrument = 'Fluoro';
                else if (d.includes('一般診斷') || d.includes('一般攝影')) item.instrument = 'X-ray';
                else if (d.includes('特殊攝影')) item.instrument = '特殊攝影';
            }
        }

        // --- 3. 師生名稱提取 (排除主持人) ---
        // 學員姓名 - 使用通用模式
        // 方法1: 從流程中抓取 (學員) 標記
        let flowStudentMatch = cleanText.match(/([\u4e00-\u9fa5]{2,10})\s*\(學員\)/);
        if (flowStudentMatch) item.studentName = flowStudentMatch[1];

        // 方法2: 從簽名檔抓取最後一個簽名（通常是學員）
        if (item.studentName === '未知') {
            let allSigs = [...raw.matchAll(/class="e_signature_name[^"]*">([\u4e00-\u9fa5]{2,10})<\/td>/gi)];
            if (allSigs.length > 0) item.studentName = allSigs[allSigs.length - 1][1];
        }

        // 方法3: 從「學員姓名」標籤抓取
        if (item.studentName === '未知') {
            let labelMatch = raw.match(/學員姓名[:：]\s*([\u4e00-\u9fa5]{2,10})/);
            if (labelMatch) item.studentName = labelMatch[1];
        }

        // 方法4: 從 SingleLineString input 抓取任意學員
        if (item.studentName === '未知') {
            let inputMatch = raw.match(/SingleLineString[^"]*[^>]*value="([\u4e00-\u9fa5]{2,10})"/i);
            if (inputMatch) item.studentName = inputMatch[1];
        }

        // 負責教師提取邏輯
        if (raw.includes('2.1.0') || ut.includes('職前自我評估')) {
            // 規則：2.1.0 或 職前自我評估 抓流程中的「計畫導師」
            // 尋找箭頭後方的姓名且緊跟著(計畫導師)
            let mentorMatch = cleanText.match(/(?:→|->)\s*([\u4e00-\u9fa5]{2,10})\s*\(計畫導師\)/);
            if (mentorMatch) item.teacherName = mentorMatch[1];
        }

        if (item.teacherName === '未註明') {
            // 抓取簽名檔中非學員且非主持人的第一個人
            let sigMatches = raw.matchAll(/class="e_signature_name">([\u4e00-\u9fa5]{2,10})<\/td>/gi);
            for (const m of sigMatches) {
                if (m[1] !== item.studentName && !m[1].includes('林國基')) {
                    item.teacherName = m[1];
                    break;
                }
            }
        }

        if (item.teacherName === '未註明') {
            // 備選流程抓取 (排除主持人)
            let flowMatch = cleanText.match(/([\u4e00-\u9fa5]{2,10})\s*\([^)]*(?:教師|導師|負責人|管理員)[^)]*\)\s*(?:→|->)\s*([\u4e00-\u9fa5]{2,10})\s*\(學員\)/i);
            if (flowMatch) item.teacherName = flowMatch[1];
        }

        // --- 4. 分數計算 ---
        const findValue = (key) => {
            let r = new RegExp(key + "[\\s\\S]*?<input[^>]*value=\"([\\d.]+)\"", "i");
            let m = raw.match(r); return m ? m[1] : "";
        };

        if (item.isInternGeneralFeedback) {
            item.scoreRaw = "";
        } else if (item.title.includes('到職訓練') || item.title.includes('職前自我評估')) {
            let pts = 0, count = 0;
            let matches = raw.matchAll(/checked[^>]*value="(\d+)"/gi);
            for (const m of matches) { let v = parseInt(m[1]); if (v >= 1 && v <= 5) { pts += v; count++; } }
            if (count > 0) {
                let final = (pts / (count * 5)) * 100;
                item.scoreRaw = (final > 100 ? 100 : final).toFixed(0);
            }
        } else if (isEffectivenessFeedback) {
            let scores = []; let matches = raw.matchAll(/checked[^>]*value="(\d+)"/gi);
            for (const m of matches) { if (parseInt(m[1]) <= 10) scores.push(parseInt(m[1])); }
            if (scores.length > 0) item.scoreRaw = ((scores.reduce((a, b) => a + b, 0) / scores.length) * 10).toFixed(0);
        } else {
            // v1.0: 擴充分數提取模式，支援更多評量表格式
            let totalMatch = cleanText.match(/(?:評量總分數|成績|平均分數|總分|整體評分|分數)[:：\s]*(\d{1,3}(?:\.\d+)?)/i);
            if (!totalMatch) {
                // 嘗試匹配 DOPS/Mini-CEX 格式 (1-10 量表)
                let scaleScores = [];
                let scaleMatches = raw.matchAll(/checked[\s\S]{0,50}?value="(\d+)"[\s\S]{0,100}?data-test="[\d.]+"/gi);
                for (const m of scaleMatches) {
                    let v = parseInt(m[1]);
                    if (v >= 1 && v <= 10) scaleScores.push(v);
                }
                if (scaleScores.length > 0) {
                    let avg = (scaleScores.reduce((a, b) => a + b, 0) / scaleScores.length) * 10;
                    totalMatch = [null, avg.toFixed(0)];
                }
            }
            item.scoreRaw = totalMatch ? totalMatch[1] : findValue("專業知識");
        }

        if (item.scoreRaw !== "" && item.scoreRaw !== "--" && !isNaN(parseFloat(item.scoreRaw))) {
            if (parseFloat(item.scoreRaw) > 100) item.scoreRaw = "100";
        }

        if (item.type === '實習總評量表') {
            let sms = ["一般診斷攝影與品保", "特殊攝影與介入性診療與品保", "血管攝影與品保", "超音波造影與品保", "心導管技術與品保", "磁振造影與品保", "電腦斷層造影與品保", "放射醫學影像品保", "核子醫學診斷", "放射免疫分析", "體內分析", "核子醫學藥物", "核子醫學治療", "放射治療技術", "模擬攝影", "模具製作", "放射治療計畫", "劑量計算", "品德操守"];
            sms.forEach(n => {
                let val = findValue(n);
                if (val) item.stationScores.push({ label: n, value: val });
            });
        }

        // 學期測驗及實務操作評核成績紀錄表 特殊處理
        if (item.title.includes('學期測驗') || item.title.includes('成績紀錄表')) {
            item.type = '實習總評量表'; // 歸類為總評量表

            // 定義所有欄位 - 使用更精確的匹配
            let fields = [
                { pattern: "臨床案例教學與討論\\(1\\)", label: "臨床案例教學與討論(1)" },
                { pattern: "臨床案例教學與討論\\(2\\)", label: "臨床案例教學與討論(2)" },
                { pattern: "臨床案例教學與討論\\(3\\)", label: "臨床案例教學與討論(3)" },
                { pattern: "臨床案例教學與討論\\(4\\)", label: "臨床案例教學與討論(4)" },
                { pattern: "筆試測驗\\(期初\\)", label: "筆試測驗(期初)" },
                { pattern: "筆試測驗\\(期末\\)", label: "筆試測驗(期末)" }
            ];

            let allScores = [];
            fields.forEach(f => {
                let r = new RegExp(f.pattern + "[\\s\\S]*?<input[^>]*value=\"([\\d.]+)\"", "i");
                let m = raw.match(r);
                if (m && m[1]) {
                    item.stationScores.push({ label: f.label, value: m[1] });
                    allScores.push(parseFloat(m[1]));
                }
            });

            // 口頭報告平均成績 - 可能有多筆
            let oralMatches = [...raw.matchAll(/口頭報告平均成績[\s\S]*?<input[^>]*value="([\d.]+)"/gi)];
            oralMatches.forEach((m, idx) => {
                let label = oralMatches.length > 1 ? `口頭報告(${idx + 1})` : "口頭報告";
                item.stationScores.push({ label: label, value: m[1] });
                allScores.push(parseFloat(m[1]));
            });

            // 書面報告平均成績 - 可能有多筆
            let writtenMatches = [...raw.matchAll(/書面報告平均成績[\s\S]*?<input[^>]*value="([\d.]+)"/gi)];
            writtenMatches.forEach((m, idx) => {
                let label = writtenMatches.length > 1 ? `書面報告(${idx + 1})` : "書面報告";
                item.stationScores.push({ label: label, value: m[1] });
                allScores.push(parseFloat(m[1]));
            });

            // 計算平均分數作為主要分數
            if (allScores.length > 0) {
                let avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
                item.scoreRaw = avg.toFixed(1);
            }
        }


        // --- EPA OPA 分數提取 (修正版) ---
        if (item.type === 'EPA') {
            // 使用「整體任務」分割區塊，解決 Regex 匹配問題
            // 注意：doc 已經是 parse 過的 DOM，但這裡我們用 raw string 做分割可能比較保險，或者直接用 DOM
            // 由於 EPA 結構複雜，維持使用 raw string 分割法 (Python 驗證成功)
            let opaBlocks = raw.split(/整體任務[：:]/i);
            // OPA1~3
            for (let i = 1; i <= 3; i++) {
                if (opaBlocks[i]) {
                    // 放寬 Regex 範圍 ({0,500}) 並支援多種分數格式
                    let checkedMatch = opaBlocks[i].match(/checked[\s\S]{0,500}?<label[^>]*>\s*(N\/A|[1-5]|[2-3][abc])\s*<\/label>/i);
                    if (checkedMatch) {
                        item.opaScores['opa' + i] = checkedMatch[1].trim();
                    } else {
                        // 嘗試找 input value (備用)
                        let valMatch = opaBlocks[i].match(/checked[\s\S]{0,100}?value="([^"]+)"/i);
                        if (valMatch) {
                            // 嘗試將 value 代碼轉換 (如果需要) - 但目前觀察 value 也是亂碼或 ID，直接顯示可能沒意義
                            // 這裡保留空值，依賴 Label 匹配
                        }
                    }
                }
            }
        }

        // --- 1.1 基礎課程 細項解析 (DOM 方式) ---
        if (item.title.includes('1.1') && item.title.includes('基礎課程')) {
            item.type = '基礎課程'; // 強制確保類型
            let passedCount = 0;
            let totalCount = 0;

            // 使用 DOM 查詢 (doc 由上方 new DOMParser().parseFromString(raw, "text/html") 產生)
            // 找出所有含有 "1. xxx" 形式的 label 所在的 form-group
            let formGroups = doc.querySelectorAll('.form-group');

            formGroups.forEach(group => {
                // 找題目 Label (通常在 label > p 或直接在 label 內)
                let labelEl = group.querySelector('label p') || group.querySelector('label');
                if (labelEl) {
                    let labelText = labelEl.innerText.trim();
                    // 檢查是否為題目 (e.g., "1.醫事放射相關法規")
                    if (/^\d+\./.test(labelText)) {
                        totalCount++;
                        // 找該題組內被 checked 的 radio
                        let checkedInput = group.querySelector('input[type="radio"]:checked');
                        let status = "未評";
                        if (checkedInput) {
                            // 找 checked input 對應的 label (通過/不通過)
                            // 根據 HTML 結構: <input id="xx"> <label for="xx">通過</label>
                            let statusLabel = group.querySelector(`label[for="${checkedInput.id}"]`);
                            if (statusLabel) {
                                status = statusLabel.innerText.trim();
                            }
                        }

                        // 加入細項成績 (顯示在卡片與 CSV 各站成績)
                        item.stationScores.push({ label: labelText, value: status });

                        if (status === '通過') {
                            passedCount++;
                        }
                    }
                }
            });

            if (totalCount > 0) {
                item.scoreRaw = `${passedCount}/${totalCount} <span class="text-[0.5em] font-sans">通過</span>`;
            }
        }

        // --- 5. 回饋內容完整提取 ---
        const extractPara = (key, label) => {
            let r = new RegExp(key + "[:：\\s]*[\\s\\S]*?<textarea[^>]*>([\\s\\S]*?)<\\/textarea>", "i");
            let m = raw.match(r);
            if (m && m[1].trim() && !["無", "沒有"].includes(m[1].trim())) {
                item.feedbacks.push({ label: label, content: m[1].trim(), type: label.includes('教師') || label.includes('評核') ? 'teacher' : 'student' });
            }
        };
        if (item.isInternGeneralFeedback) {
            extractPara("\\(1\\)訓練期間是否恰當", "心得：訓練期間");
            extractPara("\\(2\\)學習項目是否有無需要增減", "建議：學習項目");
            extractPara("\\(3\\)新進醫事放射師學習心得", "實習總心得");
            extractPara("\\(4\\)對臨床指導教師指導帶領方式", "對帶領方式建議");
            extractPara("\\(5\\)其它建議", "其它建議事項");
            extractPara("\\(1\\)給訓練學員的建議", "教師給予對策");
        } else {
            // v1.0 擴充：支援核子醫學科、放射治療科回饋欄位
            extractPara("(?:臨床指導教師評估與回饋|表現良好項目|評估者回饋|教師回饋意見|教師回饋[/／]意見)", "教師回饋");
            extractPara("(?:建議加強項目|改善項目|待加強)", "待加強項目");
            extractPara("(?:對於如何增進實習效果的建議|實習心得|學員職前期許|學生對實習醫院之建議|學生對學校之建議|受評者回饋意見|學員回饋[/／]意見|學員回饋)", "學員期許/心得");
        }

        let dateMatches = raw.match(/(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/);
        item.date = dateMatches ? dateMatches[1].replace(/\//g, '-') : "1900-01-01";

        return item;
    } catch (e) { return null; }
}
