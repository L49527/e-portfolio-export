let historyData = [];
let currentFilter = 'all';
let currentStudentFilter = 'all';
let currentDeptFilter = 'all';
let sortDirection = 'asc';

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('expanded');
    document.getElementById('sidebarIcon').className = sb.classList.contains('expanded') ? 'fas fa-angles-left text-xl' : 'fas fa-angles-right text-xl';
    document.getElementById('sidebarBtnLabel').innerText = sb.classList.contains('expanded') ? '收合匯入區' : '開啟匯入區';
}

function getDeptStyle(dept) {
    if (dept === '核子醫學科') return 'dept-nm';
    if (dept === '放射治療科') return 'dept-rt';
    if (dept === '心導管室') return 'dept-heart';
    return 'dept-rad';
}

async function handleFiles(files) {
    if (!files || files.length === 0) return;
    document.getElementById('progressOverlay').classList.remove('hidden');
    for (let i = 0; i < files.length; i++) {
        const text = await files[i].text();
        const result = analyzeHTML(text);
        if (result) historyData.push(result);
        document.getElementById('progressBar').style.width = ((i + 1) / files.length * 100) + '%';
    }
    document.getElementById('progressOverlay').classList.add('hidden'); updateFilterOptions(); renderCards();
}

function renderCards() {
    const container = document.getElementById('historyContainer');
    let filtered = getFilteredData();
    filtered.sort((a, b) => sortDirection === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    if (filtered.length === 0) { container.innerHTML = `<div class="h-full flex flex-col items-center justify-center text-slate-200 opacity-40">無資料</div>`; return; }

    container.innerHTML = filtered.map(d => `
                <div class="bg-white rounded-3xl p-6 mb-6 shadow-xl border border-slate-200 slide-up relative group">
                    <button onclick="deleteItem('${d.id}')" class="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><i class="fas fa-circle-xmark text-xl"></i></button>
                    <div class="flex justify-between items-start gap-4 mb-4">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-2 text-xs">
                                <span class="font-black px-2 py-0.5 rounded bg-slate-800 text-white shadow-sm">${d.type}</span>
                                ${d.instrument ? `<span class="font-black px-2 py-0.5 rounded bg-cyan-700 text-white shadow-sm">${d.instrument}</span>` : ''}
                                <span class="font-bold text-slate-500 font-mono">${d.date}</span>
                                <span class="font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">學員：${d.studentName}</span>
                            </div>
                            <h3 class="adaptive-title text-slate-900 mb-2 font-black">${d.title}</h3>
                            <div class="mb-3 text-[11px] font-black text-indigo-700 italic">${d.type === '輔導紀錄' ? '負責導師' : '負責教師'}：${d.teacherName || '未註明'}</div>
                            <div class="dept-badge ${getDeptStyle(d.department)}"><i class="fas fa-hospital-user mr-1"></i>${d.department}</div>
                        </div>
                        ${d.scoreRaw ? `
                        <div class="text-right ml-4">
                            <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest">評分</div>
                            <div class="adaptive-score text-blue-700 font-mono font-black">${d.scoreRaw}</div>
                        </div>` : ''}
                    </div>

                    ${d.type === 'EPA' && d.opaScores ? `
                    <div class="grid grid-cols-3 gap-2 mb-4">
                        <div class="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                            <div class="text-[10px] text-emerald-600 font-black uppercase mb-1">OPA 1</div>
                            <div class="text-xl font-black text-emerald-800 font-mono">${d.opaScores.opa1 || '-'}</div>
                        </div>
                        <div class="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                            <div class="text-[10px] text-emerald-600 font-black uppercase mb-1">OPA 2</div>
                            <div class="text-xl font-black text-emerald-800 font-mono">${d.opaScores.opa2 || '-'}</div>
                        </div>
                        <div class="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
                            <div class="text-[10px] text-emerald-600 font-black uppercase mb-1">OPA 3</div>
                            <div class="text-xl font-black text-emerald-800 font-mono">${d.opaScores.opa3 || '-'}</div>
                        </div>
                    </div>` : ''}

                    ${d.stationScores.length > 0 ? `<div class="summary-grid mb-4">${d.stationScores.map(s => `<div class="summary-item"><span class="summary-label">${s.label}</span><span class="summary-val">${s.value}</span></div>`).join('')}</div>` : ''}

                    ${d.type === 'Milestone' && d.milestoneLevels && Object.keys(d.milestoneLevels).length > 0 ? `<div class="summary-grid mb-4">${Object.entries(d.milestoneLevels).map(([label, level]) => `<div class="summary-item"><span class="summary-label">${label}</span><span class="summary-val">Level ${level}</span></div>`).join('')}</div>` : ''}

                    <div class="feedback-container">
                        ${d.feedbacks.map(fb => `<div class="feedback-item ${fb.type === 'student' ? 'fb-student' : 'fb-teacher'}"><span class="fb-label">${fb.label}</span>${fb.content}</div>`).join('')}
                    </div>
                </div>`).join('');
}

function setFilter(f) { currentFilter = f; document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active-filter')); document.getElementById('f_' + (f === 'Summary' ? 'summary' : f === 'Feedback' ? 'feedback' : f === 'DOPS' ? 'dops' : 'all')).classList.add('active-filter'); renderCards(); }
function setStudentFilter(val) { currentStudentFilter = val; renderCards(); }
function setDeptFilter(val) { currentDeptFilter = val; renderCards(); }
function toggleSort() { sortDirection = sortDirection === 'desc' ? 'asc' : 'desc'; document.getElementById('sortText').innerText = sortDirection === 'desc' ? '日期：新到舊' : '日期：舊到新'; renderCards(); }
function getFilteredData() {
    let d = historyData;
    if (currentFilter === 'Summary') d = d.filter(i => i.type === '實習總評量表');
    if (currentFilter === 'Feedback') d = d.filter(i => i.type === '學員回饋單');
    if (currentFilter === 'DOPS') d = d.filter(i => ['單站評量', 'DOPS', 'Mini-CEX', 'CbD', 'EPA', 'Milestone', '基礎課程'].includes(i.type));
    if (currentStudentFilter !== 'all') d = d.filter(i => i.studentName === currentStudentFilter);
    if (currentDeptFilter !== 'all') d = d.filter(i => i.department === currentDeptFilter);
    return d;
}
function updateFilterOptions() {
    const students = [...new Set(historyData.map(d => d.studentName))].sort();
    const depts = [...new Set(historyData.map(d => d.department))].sort();
    document.getElementById('studentFilter').innerHTML = '<option value="all">所有學員</option>' + students.map(s => `<option value="${s}">${s}</option>`).join('');
    document.getElementById('deptFilter').innerHTML = '<option value="all">所有科別</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
}
function showClearConfirm() { document.getElementById('customModal').style.display = 'flex'; }
function hideModal() { document.getElementById('customModal').style.display = 'none'; }
function clearHistory() { historyData = []; updateFilterOptions(); hideModal(); renderCards(); }
function deleteItem(id) { historyData = historyData.filter(i => i.id !== id); updateFilterOptions(); renderCards(); }
function exportToCSV() {
    if (historyData.length === 0) return;
    // 欄位名稱與 評量展示助手 v1.0 完全相容
    const milestoneHeaders = [
        "一、醫學影像及放射科學知識 1",
        "一、醫學影像及放射科學知識 2",
        "二、醫病關係及團隊溝通能力 1",
        "二、醫病關係及團隊溝通能力 2",
        "三、病人照護 1",
        "三、病人照護 2",
        "三、病人照護 3",
        "三、病人照護 4",
        "三、病人照護 5",
        "四、提升本職技能 1",
        "五、專業素養 1",
        "五、專業素養 2"
    ];

    let hs = [
        "執行日期", "學員姓名", "教師/主持人", "類型", "科別", "表單標題", "總分",
        "OPA1", "OPA1回饋", "OPA2", "OPA2回饋", "OPA3", "OPA3回饋",
        "表現良好項目", "建議加強項目", "學員回饋意見", "訓練別編號", "儀器別", "各站成績",
        ...milestoneHeaders
    ];

    let rows = [hs.join(',')];

    historyData.forEach(i => {
        let stationText = i.stationScores.map(s => s.label + ':' + s.value).join('; ');

        // 分離回饋內容
        let feedbackGood = '';
        let feedbackNeeds = '';
        let studentFeedback = '';
        i.feedbacks.forEach(f => {
            if (f.label.includes('良好') || f.label.includes('表現')) feedbackGood = f.content;
            else if (f.label.includes('加強') || f.label.includes('改善')) feedbackNeeds = f.content;
            else if (f.label.includes('學員') || f.label.includes('心得')) studentFeedback = f.content;
        });

        // 總分輸出
        let scoreOutput = (i.type === 'EPA' || i.type === 'Milestone' || i.title.toUpperCase().includes('EPA') || i.title.toUpperCase().includes('里程碑')) ? '' : i.scoreRaw;

        // 里程碑等級欄位資料
        let mLevels = milestoneHeaders.map(h => i.milestoneLevels ? (i.milestoneLevels[h] || '') : '');

        let rowData = [
            i.date,
            i.studentName,
            i.teacherName,
            i.type,
            i.department,
            i.title,
            scoreOutput,
            i.opaScores ? i.opaScores.opa1 : '',
            i.opaFeedbacks ? i.opaFeedbacks.opa1 : '',
            i.opaScores ? i.opaScores.opa2 : '',
            i.opaFeedbacks ? i.opaFeedbacks.opa2 : '',
            i.opaScores ? i.opaScores.opa3 : '',
            i.opaFeedbacks ? i.opaFeedbacks.opa3 : '',
            feedbackGood,
            feedbackNeeds,
            studentFeedback,
            i.department, // 訓練別編號
            i.instrument, // 儀器別
            stationText,
            ...mLevels
        ];

        rows.push(rowData.map(v => `"${(v || '').toString().replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '')}"`).join(','));
    });
    const b = new Blob(["\ufeff" + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const l = document.createElement("a"); l.href = URL.createObjectURL(b); l.download = `ePortfolio_Export_v1.2.csv`; l.click();
}
// 處理拖曳事件（僅支援檔案）
function handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        handleFiles(files);
    }
}

window.onload = function () {
    const dropZone = document.getElementById('dropZone');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => dropZone.addEventListener(e, (evt) => { evt.preventDefault(); evt.stopPropagation(); }, false));
    dropZone.addEventListener('drop', handleDrop);
    dropZone.onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = (e) => handleFiles(e.target.files);

    // 資料夾選擇處理
    const folderInput = document.getElementById('folderInput');
    folderInput.onchange = (e) => {
        const files = e.target.files;
        console.log('folderInput onchange triggered, files:', files, 'length:', files ? files.length : 0);

        if (!files || files.length === 0) {
            alert('未能讀取資料夾內容，請再試一次或改用拖曳方式匯入');
            e.target.value = ''; // 重設以便重新選擇
            return;
        }

        const allFiles = Array.from(files).filter(f => f.name.match(/\.(html|htm)$/i));
        console.log('Filtered HTML files:', allFiles.length);

        if (allFiles.length > 0) {
            handleFiles(allFiles);
        } else {
            alert('資料夾中未找到 HTML 檔案（共掃描 ' + files.length + ' 個檔案）');
        }
        e.target.value = ''; // 重設以便重新選擇同一資料夾
    };

    // 確保選擇資料夾按鈕正確運作
    document.querySelector('button[onclick*="folderInput"]').onclick = (e) => {
        e.stopPropagation();
        folderInput.value = ''; // 先清空再點擊，確保 onchange 會觸發
        folderInput.click();
    };
};
