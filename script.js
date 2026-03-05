// ==========================================
// STATE MANAGEMENT & SETTINGS
// ==========================================
let templates = [];
// Ambil pengaturan admin dari perangkat lokal (Token tidak boleh di-hardcode demi keamanan)
let adminSettings = JSON.parse(localStorage.getItem('pb_settings')) || { 
    driveUploadUrl: "", 
    githubRepo: "", 
    githubToken: "" 
};

let session = {
    template: null,
    photos: [], // Array of base64 images taken
    slotsAssigned: [], // Array mapping slot index to photo data URL
    timer: null,
    timeLeft: 300 // 5 minutes in seconds
};

// ==========================================
// DOM ELEMENTS
// ==========================================
const screens = document.querySelectorAll('.screen');
const video = document.getElementById('camera-feed');
const countdownOverlay = document.getElementById('countdown-overlay');
const audioShutter = new Audio('https://www.soundjay.com/camera/camera-shutter-click-03.mp3');

// ==========================================
// NAVIGATION UTILS
// ==========================================
function showScreen(screenId) {
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ==========================================
// INITIALIZATION (FETCH DARI GITHUB)
// ==========================================
async function init() {
    const select = document.getElementById('template-select');
    select.innerHTML = '<option value="">Loading templates...</option>';
    document.getElementById('btn-start').disabled = true;

    try {
        // Mengambil data dari file templates.json di hosting GitHub Pages
        // Ditambah Date.now() agar selalu mengambil versi terbaru (bypass cache browser)
        const response = await fetch('templates.json?t=' + Date.now());
        if (response.ok) {
            templates = await response.json();
        } else {
            // Fallback ke localStorage jika gagal fetch (misal saat testing di komputer lokal)
            templates = JSON.parse(localStorage.getItem('pb_templates')) || [];
        }
    } catch (error) {
        console.warn("Gagal fetch dari server, menggunakan data lokal.");
        templates = JSON.parse(localStorage.getItem('pb_templates')) || [];
    }

    select.innerHTML = '';
    if(templates.length === 0) {
        select.innerHTML = '<option value="">Belum ada template. Buka Admin Panel.</option>';
    } else {
        templates.forEach((t, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.innerText = t.name;
            select.appendChild(opt);
        });
        document.getElementById('btn-start').disabled = false;
    }
}
init();

// ==========================================
// ADMIN MODE LOGIC
// ==========================================
document.getElementById('btn-admin-login').addEventListener('click', () => {
    document.getElementById('drive-url').value = adminSettings.driveUploadUrl;
    showScreen('admin-screen');
});
document.getElementById('btn-admin-close').addEventListener('click', () => {
    init();
    showScreen('start-screen');
});


// Template Builder Logic
let adminImg = new Image();
let adminSlots = [];
let isDrawing = false;
let startX, startY;
const adminCanvas = document.getElementById('admin-canvas');
const actx = adminCanvas.getContext('2d');

document.getElementById('tpl-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        adminImg.src = event.target.result;
        adminImg.onload = () => {
            // Skala kanvas untuk UI (Maks lebar 800px)
            const scale = Math.min(800 / adminImg.width, 1);
            adminCanvas.width = adminImg.width * scale;
            adminCanvas.height = adminImg.height * scale;
            adminCanvas.dataset.scale = scale;
            drawAdminCanvas();
            adminSlots = [];
            updateSlotList();
        }
    };
    reader.readAsDataURL(file);
});

function drawAdminCanvas() {
    actx.clearRect(0, 0, adminCanvas.width, adminCanvas.height);
    actx.drawImage(adminImg, 0, 0, adminCanvas.width, adminCanvas.height);
    
    // Draw existing slots
    const scale = parseFloat(adminCanvas.dataset.scale);
    actx.strokeStyle = 'red';
    actx.lineWidth = 2;
    adminSlots.forEach(s => {
        actx.strokeRect(s.x * scale, s.y * scale, s.width * scale, s.height * scale);
        actx.fillStyle = 'rgba(255,0,0,0.3)';
        actx.fillRect(s.x * scale, s.y * scale, s.width * scale, s.height * scale);
    });
}

adminCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = adminCanvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
});

adminCanvas.addEventListener('mousemove', (e) => {
    if(!isDrawing) return;
    const rect = adminCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    drawAdminCanvas();
    actx.strokeStyle = 'blue';
    actx.strokeRect(startX, startY, currentX - startX, currentY - startY);
});

adminCanvas.addEventListener('mouseup', (e) => {
    if(!isDrawing) return;
    isDrawing = false;
    const rect = adminCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    const scale = parseFloat(adminCanvas.dataset.scale);
    const newSlot = {
        x: Math.round(Math.min(startX, endX) / scale),
        y: Math.round(Math.min(startY, endY) / scale),
        width: Math.round(Math.abs(endX - startX) / scale),
        height: Math.round(Math.abs(endY - startY) / scale)
    };
    
    if(newSlot.width > 20 && newSlot.height > 20) {
        adminSlots.push(newSlot);
        drawAdminCanvas();
        updateSlotList();
    }
});

function updateSlotList() {
    const ul = document.getElementById('slot-list');
    ul.innerHTML = '';
    adminSlots.forEach((s, i) => {
        const li = document.createElement('li');
        li.innerText = `Slot ${i+1}: ${s.width}x${s.height} px `;
        const btn = document.createElement('button');
        btn.innerText = 'X';
        btn.onclick = () => { adminSlots.splice(i, 1); drawAdminCanvas(); updateSlotList(); };
        li.appendChild(btn);
        ul.appendChild(li);
    });
}

document.getElementById('btn-save-tpl').addEventListener('click', () => {
    const name = document.getElementById('tpl-name').value;
    if(!name || !adminImg.src || adminSlots.length === 0) {
        alert("Please fill name, upload frame, and create at least 1 slot.");
        return;
    }
    const tpl = {
        name: name,
        frameData: adminImg.src,
        canvasWidth: adminImg.width,
        canvasHeight: adminImg.height,
        slots: adminSlots
    };
    templates.push(tpl);
    localStorage.setItem('pb_templates', JSON.stringify(templates));
    alert('Template Saved!');
    document.getElementById('tpl-name').value = '';
    adminSlots = [];
    drawAdminCanvas();
    updateSlotList();
});

document.getElementById('btn-reset-tpl').addEventListener('click', () => {
    if(confirm('Are you sure you want to delete all templates?')) {
        templates = [];
        localStorage.removeItem('pb_templates');
        alert('Templates reset.');
    }
});

// ==========================================
// ADMIN SETTINGS SAVE
// ==========================================
document.getElementById('btn-admin-login').addEventListener('click', () => {
    document.getElementById('drive-url').value = adminSettings.driveUploadUrl || '';
    document.getElementById('github-repo').value = adminSettings.githubRepo || '';
    document.getElementById('github-token').value = adminSettings.githubToken || '';
    showScreen('admin-screen');
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
    adminSettings.driveUploadUrl = document.getElementById('drive-url').value;
    adminSettings.githubRepo = document.getElementById('github-repo').value;
    adminSettings.githubToken = document.getElementById('github-token').value;
    localStorage.setItem('pb_settings', JSON.stringify(adminSettings));
    alert('System Settings Saved!');
});

// ==========================================
// PUSH TEMPLATE KE GITHUB API
// ==========================================
document.getElementById('btn-save-tpl').addEventListener('click', async () => {
    const name = document.getElementById('tpl-name').value;
    if(!name || !adminImg.src || adminSlots.length === 0) {
        alert("Mohon isi nama, upload frame, dan buat minimal 1 slot foto.");
        return;
    }

    const newTpl = {
        name: name,
        frameData: adminImg.src,
        canvasWidth: adminImg.width,
        canvasHeight: adminImg.height,
        slots: adminSlots
    };
    
    // Tambahkan ke array dan simpan sebagai backup lokal
    templates.push(newTpl);
    localStorage.setItem('pb_templates', JSON.stringify(templates));
    
    // Proses upload ke GitHub
    if(!adminSettings.githubRepo || !adminSettings.githubToken) {
        alert("Template disimpan SECARA LOKAL di perangkat ini. Untuk sinkronisasi, isi Repo & Token GitHub di System Settings.");
        resetAdminForm();
        return;
    }

    const btn = document.getElementById('btn-save-tpl');
    btn.innerText = "Saving to GitHub...";
    btn.disabled = true;

    try {
        const repo = adminSettings.githubRepo; // format: owner/repo
        const token = adminSettings.githubToken;
        const path = "templates.json";
        const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

        // 1. Dapatkan file SHA saat ini (GitHub wajibkan SHA untuk update file)
        let sha = "";
        const getRes = await fetch(apiUrl, { headers: { "Authorization": `token ${token}` } });
        if(getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
        }

        // 2. Encode array templates ke Base64 dengan aman untuk format Unicode/Gambar
        const contentStr = JSON.stringify(templates);
        // UTF-8 safe base64 encoding
        const contentBase64 = btoa(new Uint8Array(new TextEncoder().encode(contentStr)).reduce((data, byte) => data + String.fromCharCode(byte), ''));

        // 3. Update file di GitHub
        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                "Authorization": `token ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Add new template: ${name}`,
                content: contentBase64,
                sha: sha || undefined
            })
        });

        if(putRes.ok) {
            alert('Template berhasil di-push ke GitHub! Perangkat lain akan bisa melihatnya dalam 1-2 menit (menunggu proses deploy GitHub Pages).');
        } else {
            const errData = await putRes.json();
            alert(`Gagal upload ke GitHub: ${errData.message}`);
        }
    } catch(err) {
        console.error(err);
        alert("Terjadi kesalahan jaringan saat menghubungi GitHub API.");
    }

    btn.innerText = "Save Template";
    btn.disabled = false;
    resetAdminForm();
});

function resetAdminForm() {
    document.getElementById('tpl-name').value = '';
    adminSlots = [];
    actx.clearRect(0, 0, adminCanvas.width, adminCanvas.height);
    updateSlotList();
}

// ==========================================
// USER SESSION LOGIC
// ==========================================
document.getElementById('btn-start').addEventListener('click', async () => {
    const selIndex = document.getElementById('template-select').value;
    session.template = templates[selIndex];
    session.photos = [];
    session.slotsAssigned = new Array(session.template.slots.length).fill(null);
    session.timeLeft = 300;
    
    document.getElementById('session-gallery').innerHTML = '';
    updateTimerDisplay();
    
    showScreen('session-screen');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = stream;
        
        session.timer = setInterval(() => {
            session.timeLeft--;
            updateTimerDisplay();
            if(session.timeLeft <= 0) {
                endSession();
            }
        }, 1000);
    } catch (err) {
        alert("Camera access denied or unavailable.");
        showScreen('start-screen');
    }
});

function updateTimerDisplay() {
    const m = Math.floor(session.timeLeft / 60).toString().padStart(2, '0');
    const s = (session.timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timer').innerText = `${m}:${s}`;
}

document.getElementById('btn-take-photo').addEventListener('click', () => {
    const btn = document.getElementById('btn-take-photo');
    btn.disabled = true;
    let count = 3;
    countdownOverlay.innerText = count;
    
    const cInt = setInterval(() => {
        count--;
        if(count > 0) {
            countdownOverlay.innerText = count;
        } else {
            clearInterval(cInt);
            countdownOverlay.innerText = '';
            snapPhoto();
            btn.disabled = false;
        }
    }, 1000);
});

function snapPhoto() {
    audioShutter.play().catch(e => console.log('Audio error:', e));
    
    // Flash effect
    countdownOverlay.style.background = 'white';
    setTimeout(() => { countdownOverlay.style.background = 'transparent'; }, 100);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Mirror the image
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg');
    session.photos.push(dataUrl);
    
    // Add to strip
    const img = document.createElement('img');
    img.src = dataUrl;
    document.getElementById('session-gallery').appendChild(img);
}

document.getElementById('btn-end-session').addEventListener('click', endSession);

function endSession() {
    clearInterval(session.timer);
    const stream = video.srcObject;
    if(stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    
    if(session.photos.length === 0) {
        alert("You didn't take any photos!");
        showScreen('start-screen');
        return;
    }
    
    setupAssignmentScreen();
}

// ==========================================
// ASSIGNMENT LOGIC (Tap to Assign)
// ==========================================
let selectedPhotoUrl = null;

function setupAssignmentScreen() {
    showScreen('assignment-screen');
    const picker = document.getElementById('picker-gallery');
    picker.innerHTML = '';
    
    // Render Photos
    session.photos.forEach(photoUrl => {
        const img = document.createElement('img');
        img.src = photoUrl;
        img.onclick = () => {
            // Remove selection from others
            document.querySelectorAll('.photo-picker img').forEach(el => el.classList.remove('selected'));
            img.classList.add('selected');
            selectedPhotoUrl = photoUrl;
        };
        picker.appendChild(img);
    });

    // Render Frame & Slots
    const frameImg = document.getElementById('assign-frame-img');
    const slotsContainer = document.getElementById('assign-slots-container');
    
    frameImg.src = session.template.frameData;
    slotsContainer.innerHTML = '';
    
    // Hitung rasio untuk preview HTML (berdasarkan tinggi yang dibatasi CSS 90%)
    frameImg.onload = () => {
        const renderedHeight = frameImg.clientHeight;
        const nativeHeight = session.template.canvasHeight;
        const ratio = renderedHeight / nativeHeight;

        session.template.slots.forEach((slot, index) => {
            const div = document.createElement('div');
            div.className = 'slot-target';
            div.style.left = (slot.x * ratio) + 'px';
            div.style.top = (slot.y * ratio) + 'px';
            div.style.width = (slot.width * ratio) + 'px';
            div.style.height = (slot.height * ratio) + 'px';
            div.innerText = `Slot ${index + 1}`;
            
            div.onclick = () => {
                if(selectedPhotoUrl) {
                    div.innerHTML = `<img src="${selectedPhotoUrl}">`;
                    session.slotsAssigned[index] = selectedPhotoUrl;
                } else {
                    alert("Tap a photo on the left first, then tap this slot.");
                }
            };
            slotsContainer.appendChild(div);
        });
    }
}

// ==========================================
// PHOTOSTRIP GENERATION
// ==========================================
document.getElementById('btn-generate').addEventListener('click', () => {
    // Cek apakah semua slot terisi
    if(session.slotsAssigned.includes(null)) {
        alert("Please fill all photo slots before generating!");
        return;
    }

    const tpl = session.template;
    const canvas = document.getElementById('final-canvas');
    canvas.width = tpl.canvasWidth;
    canvas.height = tpl.canvasHeight;
    const ctx = canvas.getContext('2d');
    
    // Isi background putih
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let loadedCount = 0;
    
    // Gambar foto di setiap slot
    tpl.slots.forEach((slot, i) => {
        const img = new Image();
        img.onload = () => {
            // Object fit cover logic (center crop)
            const imgRatio = img.width / img.height;
            const slotRatio = slot.width / slot.height;
            let drawW = slot.width;
            let drawH = slot.height;
            let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

            if (imgRatio > slotRatio) {
                sWidth = img.height * slotRatio;
                sx = (img.width - sWidth) / 2;
            } else {
                sHeight = img.width / slotRatio;
                sy = (img.height - sHeight) / 2;
            }

            ctx.drawImage(img, sx, sy, sWidth, sHeight, slot.x, slot.y, slot.width, slot.height);
            loadedCount++;
            checkFinish();
        };
        img.src = session.slotsAssigned[i];
    });

    function checkFinish() {
        if(loadedCount === tpl.slots.length) {
            // Gambar Frame Overlay terakhir di atas
            const overlay = new Image();
            overlay.onload = () => {
                ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
                showScreen('preview-screen');
            };
            overlay.src = tpl.frameData;
        }
    }
});

document.getElementById('btn-retake').addEventListener('click', () => {
    if(confirm('Are you sure you want to discard this and retake?')) {
        showScreen('start-screen');
    }
});

// ==========================================
// DOWNLOAD & UPLOAD LOGIC
// ==========================================
document.getElementById('btn-download').addEventListener('click', () => {
    const canvas = document.getElementById('final-canvas');
    const dataURL = canvas.toDataURL("image/png");
    const filename = "Photobooth_" + Date.now() + ".png";

    // 1. Local Download
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    link.click();

    // 2. Google Drive Upload (Background process)
    if(adminSettings.driveUploadUrl) {
        const btn = document.getElementById('btn-download');
        btn.innerText = "UPLOADING...";
        btn.disabled = true;

        const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");

        fetch(adminSettings.driveUploadUrl, {
            method: "POST",
            body: JSON.stringify({
                filename: filename,
                image: base64Data
            })
        })
        .then(response => response.text())
        .then(result => {
            alert("Download & Upload Complete!");
            btn.innerText = "DOWNLOAD & UPLOAD";
            btn.disabled = false;
        })
        .catch(error => {
            console.error('Upload error:', error);
            alert("Downloaded locally, but failed to upload to Drive.");
            btn.innerText = "DOWNLOAD & UPLOAD";
            btn.disabled = false;
        });
    } else {
        alert("Downloaded! (Google Drive not configured)");
    }
});
