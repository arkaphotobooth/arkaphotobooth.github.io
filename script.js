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
        y: Math.min(startY, pos.y
