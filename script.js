// ==========================================
// 1. STATE MANAGEMENT & SETTINGS
// ==========================================
let templates = [];
// Ambil pengaturan admin dari localStorage
let adminSettings = JSON.parse(localStorage.getItem('pb_settings')) || {};

// Failsafe properti
adminSettings.driveUploadUrl = adminSettings.driveUploadUrl || "";
adminSettings.githubRepo = adminSettings.githubRepo || "";
adminSettings.githubToken = adminSettings.githubToken || "";
adminSettings.sessionTime = adminSettings.sessionTime || 300;

let session = {
    template: null,
    photos: [],
    slotsAssigned: [],
    timer: null,
    timeLeft: 300
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
// 3. INITIALIZATION & CAROUSEL RENDERING
// ==========================================
async function init() {
    try {
        const response = await fetch('templates.json?t=' + Date.now());
        if (response.ok) {
            templates = await response.json();
        } else {
            templates = JSON.parse(localStorage.getItem('pb_templates')) || [];
        }
    } catch (error) {
        console.warn("Menggunakan data lokal.");
        templates = JSON.parse(localStorage.getItem('pb_templates')) || [];
    }

    renderCarousel();
}
init();

// ==========================================
// 3.5. KIOSK FLOW & RADAR LOGIC
// ==========================================

// Event Tombol Simulasi Pembayaran
document.getElementById('btn-mock-pay').addEventListener('click', () => {
    showScreen('carousel-screen');
    // Memaksa scroll ke awal dan memicu radar setelah layar tampil
    setTimeout(() => {
        const container = document.getElementById('customer-layout-container');
        if (container) {
            container.scrollLeft = 0;
            updateCenterCard();
        }
    }, 100);
});

// Fungsi Merender Frame ke Carousel
function renderCarousel() {
    const container = document.getElementById('customer-layout-container');
    container.innerHTML = '';

    if (templates.length === 0) {
        container.innerHTML = '<h3 style="text-align:center; width: 100%;">Belum ada template. Buka Admin Panel.</h3>';
        return;
    }

    templates.forEach((tpl, index) => {
        const card = document.createElement('div');
        card.className = 'carousel-card';
        card.dataset.index = index;

        // HANYA GAMBAR, TEKS DIHAPUS
        card.innerHTML = `
            <img src="${tpl.frameData}" alt="Frame ${index + 1}">
        `;

        card.onclick = () => {
            card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        };

        container.appendChild(card);
    });

    // Pasang Event Listener Radar ke kontainer
    container.addEventListener('scroll', () => {
        requestAnimationFrame(updateCenterCard);
    });
}

// Algoritma Radar Deteksi Tengah Layar
let selectedTemplateIndex = 0;

function updateCenterCard() {
    const container = document.getElementById('customer-layout-container');
    const cardsArray = document.querySelectorAll('.carousel-card');
    if (cardsArray.length === 0) return;

    // HAPUS BARIS INI:
    // const screenCenter = window.innerWidth / 2;

    // GANTI DENGAN KALIBRASI PRESISI INI:
    const containerRect = container.getBoundingClientRect();
    const screenCenter = containerRect.left + (containerRect.width / 2);

    let closestCard = null;
    let minDistance = Infinity;

    cardsArray.forEach(card => {
        const cardRect = card.getBoundingClientRect();
        const cardCenter = cardRect.left + (cardRect.width / 2);
        const distance = Math.abs(screenCenter - cardCenter);

        if (distance < minDistance) {
            minDistance = distance;
            closestCard = card;
        }
    });

    cardsArray.forEach(card => {
        if (card === closestCard) {
            card.classList.add('active-center');
            selectedTemplateIndex = card.dataset.index; // Simpan index yang terpilih
        } else {
            card.classList.remove('active-center');
        }
    });
}

// ==========================================
// 4. ADMIN PANEL: SETTINGS & NAVIGATION
// ==========================================
document.getElementById('btn-admin-login').addEventListener('click', () => {
    document.getElementById('drive-url').value = adminSettings.driveUploadUrl;
    document.getElementById('github-repo').value = adminSettings.githubRepo;
    document.getElementById('github-token').value = adminSettings.githubToken;
    document.getElementById('session-time').value = adminSettings.sessionTime;
    showScreen('admin-screen');
});

// KODE INI YANG SEBELUMNYA KEMUNGKINAN TERHAPUS
document.getElementById('btn-admin-close').addEventListener('click', () => {
    init(); // Refresh data template jika ada perubahan
    showScreen('start-screen'); // Kembali ke menu utama
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
    adminSettings.driveUploadUrl = document.getElementById('drive-url').value;
    adminSettings.githubRepo = document.getElementById('github-repo').value;
    adminSettings.githubToken = document.getElementById('github-token').value;

    let inputTime = parseInt(document.getElementById('session-time').value);
    adminSettings.sessionTime = isNaN(inputTime) ? 300 : inputTime;

    localStorage.setItem('pb_settings', JSON.stringify(adminSettings));
    alert('System Settings Saved! Waktu sesi diatur ke: ' + adminSettings.sessionTime + ' detik.');
});

// ==========================================
// 5. ADMIN PANEL: TEMPLATE BUILDER
// ==========================================
let adminImg = new Image();
let adminSlots = [];
let isDrawing = false;
let startX, startY;
const adminCanvas = document.getElementById('admin-canvas');
const actx = adminCanvas.getContext('2d');

function drawAdminCanvas() {
    if (!adminImg.src) return;
    actx.clearRect(0, 0, adminCanvas.width, adminCanvas.height);
    actx.drawImage(adminImg, 0, 0, adminCanvas.width, adminCanvas.height);

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
    if (!file) return;

    if (!file.type.match('image.*')) {
        alert("Pilih file gambar (PNG)!");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        adminImg.onload = () => {
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
    if (!isDrawing) return;
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
    if (!isDrawing) return;
    isDrawing = false;
    e.preventDefault();

    const pos = getPointerPos(e);
    const newSlot = {
        x: Math.min(startX, pos.x),
        y: Math.min(startY, pos.y),
        width: Math.abs(pos.x - startX),
        height: Math.abs(pos.y - startY)
    };

    if (newSlot.width > 50 && newSlot.height > 50) {
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
        li.innerHTML = `<span>Slot ${i + 1}</span>`;
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
    if (!name || !adminImg.src || adminSlots.length === 0) {
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

    if (!adminSettings.githubRepo || !adminSettings.githubToken) {
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
        if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
        }

        const contentStr = JSON.stringify(templates);
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

        if (putRes.ok) {
            alert('Template berhasil di-push ke GitHub!');
        } else {
            const errData = await putRes.json();
            alert(`Gagal upload: ${errData.message}`);
        }
    } catch (err) {
        console.error(err);
        alert("Terjadi kesalahan jaringan.");
    }

    btn.innerText = "Save & Push Template";
    btn.disabled = false;
    resetAdminForm();
});

document.getElementById('btn-reset-tpl').addEventListener('click', () => {
    if (confirm('Hapus semua template lokal? (Tidak menghapus dari GitHub)')) {
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
// 7. USER SESSION: HYBRID ENGINE + COUNTDOWN
// ==========================================
let isCameraReady = false;
const MAX_TAKES = 6;
let currentTake = 1;
let webCameraStream = null; // Variabel untuk fallback web
let imageCaptureAPI = null;

// 1. TRIGGER DARI CAROUSEL SCREEN
document.getElementById('btn-start-session').addEventListener('click', async () => {
    session.template = templates[selectedTemplateIndex];
    session.photos = [];
    session.slotsAssigned = new Array(session.template.slots.length).fill(null);

    showScreen('session-screen');
    startNativeHybridCamera();
});

// 2. INISIALISASI KAMERA & PEMANASAN
async function startNativeHybridCamera() {
    const curtain = document.getElementById('camera-curtain');
    const gallery = document.getElementById('thumbnail-gallery');
    const indicator = document.getElementById('btn-finish-session');
    const btnSnap = document.getElementById('btn-snap');
    const videoFallback = document.getElementById('camera-feed');

    curtain.classList.remove('hidden');
    gallery.innerHTML = '';
    currentTake = 1;
    indicator.innerText = `Take 1 / ${MAX_TAKES}`;
    btnSnap.disabled = false;
    btnSnap.style.opacity = '1';
    isCameraReady = false;

    try {
        // [FALLBACK WEB] Nyalakan kamera Chrome agar bisa ditest
        webCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        videoFallback.srcObject = webCameraStream;

        // Siapkan API Kamera High-Res jika didukung
        const track = webCameraStream.getVideoTracks()[0];
        if ('ImageCapture' in window) {
            imageCaptureAPI = new ImageCapture(track);
        }

        // PEMANASAN SENSOR: Jeda 1.5 detik
        setTimeout(async () => {
            if (imageCaptureAPI) {
                try { await imageCaptureAPI.takePhoto(); }
                catch (err) { console.log("Dummy capture skipped"); }
            }
            isCameraReady = true;
            curtain.classList.add('hidden'); // Buka Tirai!
        }, 1500);

    } catch (error) {
        alert("Gagal menyalakan kamera. Pastikan izin kamera diberikan.");
        showScreen('carousel-screen');
    }
}

// 3. FUNGSI HITUNG MUNDUR (PROMISE)
function doCountdown(seconds) {
    return new Promise(resolve => {
        let count = seconds;
        const overlay = document.getElementById('countdown-overlay');
        overlay.innerText = count;

        const cInt = setInterval(() => {
            count--;
            if (count > 0) {
                overlay.innerText = count;
            } else {
                clearInterval(cInt);
                overlay.innerText = ''; // Hilangkan angka
                resolve();
            }
        }, 1000);
    });
}

// 4. TOMBOL SNAP (AUTO LOOP SEQUENCE 6x)
document.getElementById('btn-snap').addEventListener('click', async () => {
    if (!isCameraReady) return;

    const btnSnap = document.getElementById('btn-snap');
    btnSnap.disabled = true;
    btnSnap.style.opacity = '0.5';

    // Looping 6 kali jepretan
    for (let i = currentTake; i <= MAX_TAKES; i++) {
        currentTake = i;

        // ==========================================
        // 1. DI DALAM LOOP FOR: Ganti 'take-indicator' menjadi 'btn-finish-session'
        // ==========================================
        document.getElementById('btn-finish-session').innerText = `Take ${currentTake} / ${MAX_TAKES}`;

        // KUNCI PERBAIKAN: Hitung mundur 3 detik sebelum setiap jepretan
        await doCountdown(3);

        // Kilat Flash Layar
        const screenBg = document.getElementById('session-screen');
        screenBg.style.backgroundColor = 'rgba(255,255,255,0.9)';
        audioShutter.play().catch(e => console.log('Audio error:', e));
        setTimeout(() => { screenBg.style.backgroundColor = 'transparent'; }, 100);

        try {
            let finalBase64 = "";

            // Tangkap Gambar Resolusi Tinggi via Web API
            if (imageCaptureAPI) {
                const blob = await imageCaptureAPI.takePhoto();
                const imageBitmap = await createImageBitmap(blob);

                const canvas = document.createElement('canvas');
                canvas.width = imageBitmap.width;
                canvas.height = imageBitmap.height;
                const ctx = canvas.getContext('2d');

                // Mirroring
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(imageBitmap, 0, 0);

                finalBase64 = canvas.toDataURL('image/jpeg', 0.95);
                imageBitmap.close(); // Bersihkan RAM
            } else {
                // Fallback jika API tidak didukung
                const video = document.getElementById('camera-feed');
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                finalBase64 = canvas.toDataURL('image/jpeg', 0.9);
            }

            session.photos.push(finalBase64);

            // Update UI Gallery Kiri
            const img = document.createElement('img');
            img.src = finalBase64;
            img.className = 'gallery-thumb';
            document.getElementById('thumbnail-gallery').appendChild(img);

        } catch (err) {
            console.error("Gagal menjepret:", err);
        }

        // Jeda santai 1 detik setelah jepretan sebelum hitung mundur selanjutnya
        if (i < MAX_TAKES) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } // <-- INI ADALAH PENUTUP LOOP FOR

    // ==========================================
    // 2. SETELAH LOOP SELESAI: Ubah teks tombol menjadi LANJUT
    // ==========================================
    document.getElementById('btn-finish-session').innerText = "LANJUT ➔";

});

// 5. TOMBOL SELESAI / LANJUT (KANAN ATAS)
document.getElementById('btn-finish-session').addEventListener('click', () => {
    // Hanya bisa ditekan jika sudah ada minimal 1 foto yang dijepret
    if (session.photos.length > 0) {
        // Matikan Kamera
        if (webCameraStream) {
            webCameraStream.getTracks().forEach(t => t.stop());
        }
        // Lanjut ke layar pilih foto
        setupAssignmentScreen();
    } else {
        alert("Silakan ambil foto terlebih dahulu!");
    }
});

// 6. TOMBOL BATAL (KIRI ATAS)
document.getElementById('btn-cancel').addEventListener('click', () => {
    if (webCameraStream) {
        webCameraStream.getTracks().forEach(t => t.stop());
    }
    showScreen('carousel-screen');
});

// ==========================================
// 8. USER SESSION: ASSIGNMENT
// ==========================================
let selectedPhotoUrl = null;

function setupAssignmentScreen() {
    showScreen('assignment-screen');
    const picker = document.getElementById('picker-gallery');
    picker.innerHTML = '';
    selectedPhotoUrl = null;

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
                if (selectedPhotoUrl) {
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
    if (session.slotsAssigned.includes(null)) {
        alert("Harap isi semua slot foto sebelum generate!");
        return;
    }

    const tpl = session.template;
    const canvas = document.getElementById('final-canvas');
    canvas.width = tpl.canvasWidth;
    canvas.height = tpl.canvasHeight;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let loadedCount = 0;

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
        if (loadedCount === tpl.slots.length) {
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
    if (confirm('Yakin ingin membatalkan foto ini dan mengulang?')) {
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

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    link.click();

    if (adminSettings.driveUploadUrl) {
        const btn = document.getElementById('btn-download');
        const qrContainer = document.getElementById('qr-container');
        const qrImage = document.getElementById('qr-image');
        const qrText = document.getElementById('qr-status-text');

        btn.innerText = "UPLOADING...";
        btn.disabled = true;

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
            .then(response => response.json())
            .then(result => {
                if (result.status === "success" && result.url) {
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

// ==========================================
// 11. KEMBALI KE HOME (NEW SESSION)
// ==========================================
document.getElementById('btn-home').addEventListener('click', () => {
    session.photos = [];
    session.slotsAssigned = [];
    session.template = null;

    document.getElementById('session-gallery').innerHTML = '';
    document.getElementById('picker-gallery').innerHTML = '';

    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');
    const qrText = document.getElementById('qr-status-text');
    const btnDownload = document.getElementById('btn-download');

    if (qrContainer) {
        qrContainer.classList.add('hidden');
        qrImage.style.display = 'none';
        qrImage.src = '';
        qrText.innerText = "Menunggu proses...";
    }

    if (btnDownload) {
        btnDownload.innerText = "UPLOAD & GET QR";
        btnDownload.disabled = false;
    }

    showScreen('start-screen');
});
