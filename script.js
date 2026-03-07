// 1. STATE & SETTINGS
let templates = [];
let adminSettings = JSON.parse(localStorage.getItem('pb_settings')) || { sessionTime: 300 };
let session = { template: null, photos: [], slotsAssigned: [], timeLeft: 300, currentFilter: 'none' };

const screens = document.querySelectorAll('.screen');
const video = document.getElementById('camera-feed');
const audioShutter = new Audio('https://www.soundjay.com/camera/camera-shutter-click-03.mp3');

function showScreen(id) {
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// 2. INITIALIZATION
async function init() {
    const select = document.getElementById('template-select');
    try {
        const res = await fetch(`templates.json?t=${Date.now()}`);
        templates = res.ok ? await res.json() : (JSON.parse(localStorage.getItem('pb_templates')) || []);
    } catch {
        templates = JSON.parse(localStorage.getItem('pb_templates')) || [];
    }
    select.innerHTML = templates.map((t, i) => `<option value="${i}">${t.name}</option>`).join('') || '<option>No Template</option>';
    document.getElementById('btn-start').disabled = templates.length === 0;
}
init();

// 3. ADMIN LOGIC
document.getElementById('btn-admin-login').onclick = () => {
    document.getElementById('session-time').value = adminSettings.sessionTime || 300;
    document.getElementById('drive-url').value = adminSettings.driveUploadUrl || '';
    document.getElementById('github-repo').value = adminSettings.githubRepo || '';
    document.getElementById('github-token').value = adminSettings.githubToken || '';
    showScreen('admin-screen');
};

document.getElementById('btn-admin-close').onclick = () => { init(); showScreen('start-screen'); };

document.getElementById('btn-save-settings').onclick = () => {
    adminSettings = {
        sessionTime: parseInt(document.getElementById('session-time').value) || 300,
        driveUploadUrl: document.getElementById('drive-url').value,
        githubRepo: document.getElementById('github-repo').value,
        githubToken: document.getElementById('github-token').value
    };
    localStorage.setItem('pb_settings', JSON.stringify(adminSettings));
    alert('Settings Saved!');
};

// 4. TEMPLATE BUILDER
let adminImg = new Image(), adminSlots = [], isDrawing = false, startX, startY;
const adminCanvas = document.getElementById('admin-canvas'), actx = adminCanvas.getContext('2d');

document.getElementById('tpl-file').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
        adminImg.onload = () => {
            adminCanvas.width = adminImg.width; adminCanvas.height = adminImg.height;
            adminSlots = []; drawAdminCanvas();
        };
        adminImg.src = ev.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

function drawAdminCanvas() {
    actx.clearRect(0, 0, adminCanvas.width, adminCanvas.height);
    actx.drawImage(adminImg, 0, 0);
    actx.strokeStyle = 'red'; actx.lineWidth = 5;
    adminSlots.forEach(s => {
        actx.strokeRect(s.x, s.y, s.width, s.height);
        actx.fillStyle = 'rgba(255,0,0,0.3)'; actx.fillRect(s.x, s.y, s.width, s.height);
    });
}

function getPointer(e) {
    const rect = adminCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = adminCanvas.width / rect.width, scaleY = adminCanvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

adminCanvas.onmousedown = adminCanvas.ontouchstart = (e) => {
    if(!adminImg.src) return; isDrawing = true; const p = getPointer(e); startX = p.x; startY = p.y;
};
window.onmousemove = window.ontouchmove = (e) => {
    if(!isDrawing) return; drawAdminCanvas(); const p = getPointer(e);
    actx.strokeStyle = 'blue'; actx.strokeRect(startX, startY, p.x - startX, p.y - startY);
};
window.onmouseup = window.ontouchend = (e) => {
    if(!isDrawing) return; isDrawing = false; const p = getPointer(e);
    const s = { x: Math.min(startX, p.x), y: Math.min(startY, p.y), width: Math.abs(p.x - startX), height: Math.abs(p.y - startY) };
    if(s.width > 20) adminSlots.push(s); drawAdminCanvas();
};

document.getElementById('btn-save-tpl').onclick = async () => {
    const name = document.getElementById('tpl-name').value;
    if(!name || adminSlots.length === 0) return alert('Name & Slots required');
    const newTpl = { name, frameData: adminImg.src, canvasWidth: adminImg.width, canvasHeight: adminImg.height, slots: adminSlots };
    templates.push(newTpl);
    localStorage.setItem('pb_templates', JSON.stringify(templates));
    
    if(adminSettings.githubToken && adminSettings.githubRepo) {
        const btn = document.getElementById('btn-save-tpl'); btn.innerText = 'Pushing...';
        try {
            const url = `https://api.github.com/repos/${adminSettings.githubRepo}/contents/templates.json`;
            const getFile = await fetch(url, { headers: { Authorization: `token ${adminSettings.githubToken}` } });
            const sha = getFile.ok ? (await getFile.json()).sha : null;
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(templates))));
            await fetch(url, {
                method: 'PUT',
                headers: { Authorization: `token ${adminSettings.githubToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Update templates', content, sha })
            });
            alert('Synced to GitHub!');
        } catch (e) { alert('GitHub Sync Failed'); }
        btn.innerText = 'Save & Push Template';
    }
};

// 5. SESSION LOGIC
document.getElementById('btn-start').onclick = async () => {
    session = { template: templates[document.getElementById('template-select').value], photos: [], slotsAssigned: [], timeLeft: adminSettings.sessionTime, currentFilter: 'none' };
    document.getElementById('session-gallery').innerHTML = '';
    showScreen('session-screen');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    session.interval = setInterval(() => {
        session.timeLeft--;
        const m = Math.floor(session.timeLeft/60), s = session.timeLeft%60;
        document.getElementById('timer').innerText = `${m}:${s.toString().padStart(2,'0')}`;
        if(session.timeLeft <= 0) endSession();
    }, 1000);
};

document.querySelectorAll('.btn-filter').forEach(b => b.onclick = (e) => {
    document.querySelectorAll('.btn-filter').forEach(f => f.classList.remove('active'));
    e.target.classList.add('active');
    session.currentFilter = e.target.dataset.filter;
    video.style.filter = session.currentFilter;
});

document.getElementById('btn-take-photo').onclick = () => {
    let count = 3; const over = document.getElementById('countdown-overlay');
    const timer = setInterval(() => {
        over.innerText = count || '';
        if(count === 0) {
            clearInterval(timer); snap();
        }
        count--;
    }, 1000);
};

function snap() {
    audioShutter.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.filter = session.currentFilter;
    ctx.drawImage(video, 0, 0);
    const data = canvas.toDataURL('image/jpeg');
    session.photos.push(data);
    const img = document.createElement('img'); img.src = data;
    document.getElementById('session-gallery').appendChild(img);
}

function endSession() {
    clearInterval(session.interval);
    if(video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    setupAssignment();
}
document.getElementById('btn-end-session').onclick = endSession;

// 6. ASSIGNMENT & GENERATE
let selectedPhoto = null;
function setupAssignment() {
    showScreen('assignment-screen');
    const picker = document.getElementById('picker-gallery');
    picker.innerHTML = session.photos.map(p => `<img src="${p}" class="pick-img">`).join('');
    document.querySelectorAll('.pick-img').forEach(img => img.onclick = (e) => {
        document.querySelectorAll('.pick-img').forEach(i => i.classList.remove('selected'));
        e.target.classList.add('selected'); selectedPhoto = e.target.src;
    });
    const frameImg = document.getElementById('assign-frame-img');
    frameImg.src = session.template.frameData;
    frameImg.onload = () => {
        const ratio = frameImg.clientHeight / session.template.canvasHeight;
        const container = document.getElementById('assign-slots-container');
        container.innerHTML = session.template.slots.map((s, i) => `
            <div class="slot-target" data-i="${i}" style="left:${s.x * ratio}px; top:${s.y * ratio}px; width:${s.width * ratio}px; height:${s.height * ratio}px">Slot ${i+1}</div>
        `).join('');
        document.querySelectorAll('.slot-target').forEach(st => st.onclick = (e) => {
            if(!selectedPhoto) return;
            const i = e.target.dataset.i; session.slotsAssigned[i] = selectedPhoto;
            e.target.innerHTML = `<img src="${selectedPhoto}">`;
        });
    };
}

document.getElementById('btn-generate').onclick = () => {
    const t = session.template; const canvas = document.getElementById('final-canvas');
    canvas.width = t.canvasWidth; canvas.height = t.canvasHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height);
    let loaded = 0;
    t.slots.forEach((s, i) => {
        const img = new Image(); img.src = session.slotsAssigned[i];
        img.onload = () => {
            const iR = img.width/img.height, sR = s.width/s.height;
            let sw = img.width, sh = img.height, sx = 0, sy = 0;
            if(iR > sR) { sw = img.height * sR; sx = (img.width - sw)/2; }
            else { sh = img.width / sR; sy = (img.height - sh)/2; }
            ctx.drawImage(img, sx, sy, sw, sh, s.x, s.y, s.width, s.height);
            if(++loaded === t.slots.length) {
                const f = new Image(); f.src = t.frameData;
                f.onload = () => { ctx.drawImage(f, 0, 0); showScreen('preview-screen'); };
            }
        };
    });
};

// 7. DOWNLOAD & QR
document.getElementById('btn-download').onclick = async () => {
    const canvas = document.getElementById('final-canvas');
    const data = canvas.toDataURL('image/png');
    const a = document.createElement('a'); a.download = `Photo_${Date.now()}.png`; a.href = data; a.click();
    
    if(adminSettings.driveUploadUrl) {
        const qrBox = document.getElementById('qr-container'); qrBox.classList.remove('hidden');
        try {
            const res = await fetch(adminSettings.driveUploadUrl, {
                method: 'POST',
                body: JSON.stringify({ filename: `PB_${Date.now()}.png`, image: data.split(',')[1] })
            });
            const result = await res.json();
            if(result.url) {
                document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(result.url)}`;
                document.getElementById('qr-status-text').innerText = '✅ Ready to Scan!';
            }
        } catch { document.getElementById('qr-status-text').innerText = '❌ Upload Failed'; }
    }
};

document.getElementById('btn-home').onclick = () => location.reload();
document.getElementById('btn-retake').onclick = () => showScreen('start-screen');
