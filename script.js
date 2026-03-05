// ==========================================
// 1. STATE MANAGEMENT & SETTINGS
// ==========================================
let templates = [];
// Ambil pengaturan admin dari localStorage
let adminSettings = JSON.parse(localStorage.getItem('pb_settings')) || { 
    driveUploadUrl: "", 
    githubRepo: "", 
    githubToken: "" 
};

let session = {
    template: null,
    photos: [], // Array foto base64 yang diambil
    slotsAssigned: [], // Array mapping slot ke foto
    timer: null,
    timeLeft: 300 // 5 menit dalam detik
};

// ==========================================
// 2. DOM ELEMENTS & UTILS
// ==========================================
const screens = document.querySelectorAll('.screen');
const video = document.getElementById('camera-feed');
const countdownOverlay = document.getElementById('countdown-overlay');
const audioShutter = new Audio('https://www.soundjay.com/camera/camera-shutter-click-03.mp3');

function showScreen(screenId) {
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ==========================================
// 3. INITIALIZATION (FETCH DARI GITHUB)
// ==========================================
async function init() {
    const select = document.getElementById('template-select');
    select.innerHTML = '<option value="">Loading templates...</option>';
    document.getElementById('btn-start').disabled = true;

    try {
        // Fetch dari GitHub Pages dengan cache-busting
        const response = await fetch('templates.json?t=' + Date.now());
        if (response.ok) {
            templates = await response.json();
        } else {
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
// 4. ADMIN PANEL: SETTINGS
// ==========================================
document.getElementById('btn-admin-login').addEventListener('click', () => {
    document.getElementById('drive-url').value = adminSettings.driveUploadUrl || '';
    document.getElementById('github-repo').value = adminSettings.githubRepo || '';
    document.getElementById('github-token').value = adminSettings.githubToken || '';
    showScreen('admin-screen');
});

document.getElementById('btn-admin-close').addEventListener('click', () => {
    init();
    showScreen('start-screen');
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
    adminSettings.driveUploadUrl = document.getElementById('drive-url').value;
    adminSettings.githubRepo = document.getElementById('github-repo').value;
    adminSettings.githubToken = document.getElementById('github-token').value;
    localStorage.setItem('pb_settings', JSON.stringify(adminSettings));
    alert('System Settings Saved!');
});

// ==========================================
// 5. ADMIN PANEL: TEMPLATE BUILDER (TOUCH & MOUSE)
// ==========================================
let adminImg = new Image();
let adminSlots = [];
let isDrawing = false;
let startX, startY;
const adminCanvas = document.getElementById('admin-canvas');
const actx = adminCanvas.getContext('2d');

function drawAdminCanvas() {
    if (!adminImg.src) return;
    
    // Canvas menggunakan resolusi murni gambar asli
    actx.clearRect(0, 0, adminCanvas.width, adminCanvas.height);
    actx.drawImage(adminImg, 0, 0, adminCanvas.width, adminCanvas.height);
    
    // Ketebalan garis disesuaikan resolusi gambar
    actx.lineWidth = Math.max(adminCanvas.width / 150, 4);
    actx.strokeStyle = 'red';
    
    adminSlots.forEach(s => {
        actx.strokeRect(s.x, s.y, s.width, s.height);
        actx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        actx.fillRect(s.x, s.y, s.width, s.height);
    });
}

document.getElementById('tpl-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;

    if(!file.type.match('image.*')) {
        alert("Pilih file gambar (PNG)!");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        adminImg.onload = () => {
            // Set canvas 100% ukuran asli gambar, biarkan CSS yang mengecilkan tampilannya di layar
            adminCanvas.width = adminImg.width;
            adminCanvas.height = adminImg.height;
            
            adminSlots = [];
            updateSlotList();
            drawAdminCanvas();
        };
        adminImg.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// Helper Kalkulasi Koordinat (Resolusi Layar vs Resolusi Asli Canvas)
function getPointerPos(e) {
    const rect = adminCanvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    }

    const scaleX = adminCanvas.width / rect.width;
    const scaleY = adminCanvas.height / rect.height;

    return {
        x: Math.round((clientX - rect.left) * scaleX),
        y: Math.round((clientY - rect.top) * scaleY)
    };
}

function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPointerPos(e);
    startX = pos.x;
    startY = pos.y;
}
adminCanvas.addEventListener('mousedown', startDrawing);
adminCanvas.addEventListener('touchstart', startDrawing, { passive: false });

function drawRect(e) {
    if(!isDrawing) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    
    drawAdminCanvas(); 
    actx.strokeStyle = 'blue'; 
    actx.lineWidth = Math.max(adminCanvas.width / 150, 4);
    actx.strokeRect(startX, startY, pos.x - startX, pos.y - startY);
}
adminCanvas.addEventListener('mousemove', drawRect);
adminCanvas.addEventListener('touchmove', drawRect, { passive: false });

function stopDrawing(e) {
    if(!isDrawing) return;
    isDrawing = false;
    e.preventDefault();
    
    const pos = getPointerPos(e);
    
    const newSlot = {
        x: Math.min(startX, pos.x),
        y: Math.min(startY, pos.y),
        width: Math.abs(pos.x - startX),
        height: Math.abs(pos.y - startY)
    };
    
    if(newSlot.width > 50 && newSlot.height > 50) {
        adminSlots.push(newSlot);
        updateSlotList();
    }
    
    drawAdminCanvas();
}
adminCanvas.addEventListener('mouseup', stopDrawing);
adminCanvas.addEventListener('touchend', stopDrawing);
adminCanvas.addEventListener('touchcancel', stopDrawing);

function updateSlotList() {
    const ul = document.getElementById('slot-list');
    ul.innerHTML = '';
    adminSlots.forEach((s, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>Slot ${i+1}</span>`;
        const btn = document.createElement('button');
        btn.innerText = 'X';
        btn.onclick = () => { adminSlots.splice(i, 1); drawAdminCanvas(); updateSlotList(); };
        li.appendChild(btn);
        ul.appendChild(li);
    });
}

// ==========================================
// 6. ADMIN PANEL: PUSH TEMPLATE KE GITHUB
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
    
    templates.push(newTpl);
    localStorage.setItem('pb_templates', JSON.stringify(templates));
    
    if(!adminSettings.githubRepo || !adminSettings.githubToken) {
        alert("Disimpan SECARA LOKAL. Untuk sinkronisasi, isi Repo & Token GitHub di System Settings.");
        resetAdminForm();
        return;
    }

    const btn = document.getElementById('btn-save-tpl');
    btn.innerText = "Saving to GitHub...";
    btn.disabled = true;

    try {
        const repo = adminSettings.githubRepo; 
        const token = adminSettings.githubToken;
        const path = "templates.json";
        const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

        let sha = "";
        const getRes = await fetch(apiUrl, { headers: { "Authorization": `token ${token}` } });
        if(getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
        }

        const contentStr = JSON.stringify(templates);
        // UTF-8 safe base64
        const contentBase64 = btoa(new Uint8Array(new TextEncoder().encode(contentStr)).reduce((data, byte) => data + String.fromCharCode(byte), ''));

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
            alert('Template berhasil di-push ke GitHub! Tunggu 1-2 menit untuk update di device lain.');
        } else {
            const errData = await putRes.json();
            alert(`Gagal upload: ${errData.message}`);
        }
    } catch(err) {
        console.error(err);
        alert("Terjadi kesalahan jaringan.");
    }

    btn.innerText = "Save & Push Template";
    btn.disabled = false;
    resetAdminForm();
});

document.getElementById('btn-reset-tpl').addEventListener('click', () => {
    if(confirm('Hapus semua template lokal? (Tidak menghapus dari GitHub)')) {
        templates = [];
        localStorage.removeItem('pb_templates');
        alert('Templates lokal direset.');
        init();
    }
});

function resetAdminForm() {
    document.getElementById('tpl-name').value = '';
    adminSlots = [];
    actx.clearRect(0, 0, adminCanvas.width, adminCanvas.height);
    document.getElementById('tpl-file').value = "";
    adminImg = new Image();
    updateSlotList();
}

// ==========================================
// 7. USER SESSION: KAMERA & TIMER
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
        alert("Akses kamera ditolak atau tidak tersedia.");
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
    
    countdownOverlay.style.background = 'white';
    setTimeout(() => { countdownOverlay.style.background = 'transparent'; }, 100);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Mirror gambar
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg');
    session.photos.push(dataUrl);
    
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
        alert("Kamu belum mengambil foto satupun!");
        showScreen('start-screen');
        return;
    }
    
    setupAssignmentScreen();
}

// ==========================================
// 8. USER SESSION: ASSIGNMENT (TAP TO ASSIGN)
// ==========================================
let selectedPhotoUrl = null;

function setupAssignmentScreen() {
    showScreen('assignment-screen');
    const picker = document.getElementById('picker-gallery');
    picker.innerHTML = '';
    selectedPhotoUrl = null; // Reset pilihan
    
    // Render Foto
    session.photos.forEach(photoUrl => {
        const img = document.createElement('img');
        img.src = photoUrl;
        img.onclick = () => {
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
                    div.classList.add('active-slot');
                    session.slotsAssigned[index] = selectedPhotoUrl;
                } else {
                    alert("Sentuh foto di sebelah kiri dulu, lalu sentuh slot ini.");
                }
            };
            slotsContainer.appendChild(div);
        });
    }
}

// ==========================================
// 9. PHOTOSTRIP GENERATION
// ==========================================
document.getElementById('btn-generate').addEventListener('click', () => {
    if(session.slotsAssigned.includes(null)) {
        alert("Harap isi semua slot foto sebelum generate!");
        return;
    }

    const tpl = session.template;
    const canvas = document.getElementById('final-canvas');
    canvas.width = tpl.canvasWidth;
    canvas.height = tpl.canvasHeight;
    const ctx = canvas.getContext('2d');
    
    // Background putih
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let loadedCount = 0;
    
    // Gambar foto (Center Crop Logic)
    tpl.slots.forEach((slot, i) => {
        const img = new Image();
        img.onload = () => {
            const imgRatio = img.width / img.height;
            const slotRatio = slot.width / slot.height;
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
    if(confirm('Yakin ingin membatalkan foto ini dan mengulang?')) {
        showScreen('start-screen');
    }
});

// ==========================================
// 10. DOWNLOAD, UPLOAD & QR CODE GENERATION
// ==========================================
document.getElementById('btn-download').addEventListener('click', () => {
    const canvas = document.getElementById('final-canvas');
    const dataURL = canvas.toDataURL("image/png");
    const filename = "Photobooth_" + Date.now() + ".png";

    // 1. Download Lokal ke Tablet (sebagai backup admin)
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    link.click();

    // 2. Proses Upload dan Generate QR
    if(adminSettings.driveUploadUrl) {
        const btn = document.getElementById('btn-download');
        const qrContainer = document.getElementById('qr-container');
        const qrImage = document.getElementById('qr-image');
        const qrText = document.getElementById('qr-status-text');

        btn.innerText = "UPLOADING...";
        btn.disabled = true;
        
        // Tampilkan kotak QR dengan status loading
        qrContainer.classList.remove('hidden');
        qrImage.style.display = 'none';
        qrText.innerText = "⏳ Sedang mengupload foto...";

        const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");

        fetch(adminSettings.driveUploadUrl, {
            method: "POST",
            body: JSON.stringify({
                filename: filename,
                image: base64Data
            })
        })
        .then(response => response.json()) // BACA RESPON SEBAGAI JSON
        .then(result => {
            if(result.status === "success" && result.url) {
                // Gunakan API publik untuk mengubah URL Drive menjadi Gambar QR Code
                const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(result.url)}`;
                
                qrImage.src = qrApiUrl;
                qrImage.onload = () => {
                    qrImage.style.display = 'block';
                    qrText.innerText = "✅ Scan menggunakan kamera HP!";
                };
                
                btn.innerText = "UPLOAD SELESAI";
            } else {
                throw new Error("Gagal mendapatkan link dari Google Drive.");
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            qrText.innerText = "❌ Gagal membuat QR. Cek koneksi internet.";
            btn.innerText = "COBA LAGI";
            btn.disabled = false;
        });
    } else {
        alert("Upload gagal: Google Drive URL belum diatur di Admin Panel.");
    }
});
