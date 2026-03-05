const video = document.getElementById("video")
const countdownEl = document.getElementById("countdown")
const flash = document.querySelector(".flash")

let photos = []
let selectedFrame = "frames/frame1.png"

/* CAMERA */

navigator.mediaDevices.getUserMedia({video:true})
.then(stream=>{
video.srcObject = stream
})

/* FRAME SELECTOR */

document.querySelectorAll(".frameOption").forEach(frame=>{

frame.addEventListener("click",()=>{

document.querySelectorAll(".frameOption")
.forEach(f=>f.classList.remove("active"))

frame.classList.add("active")

selectedFrame = frame.src

updatePreview()

})

})

/* COUNTDOWN */

function startCountdown(){

if(photos.length >= 4) return

let count = 3

countdownEl.innerText = count

let timer = setInterval(()=>{

count--

if(count>0){

countdownEl.innerText = count

}else{

countdownEl.innerText = ""

clearInterval(timer)

capturePhoto()

}

},1000)

}

/* CAPTURE */

function capturePhoto(){

flash.style.opacity="1"

setTimeout(()=>{
flash.style.opacity="0"
},100)

const canvas=document.createElement("canvas")

canvas.width=video.videoWidth
canvas.height=video.videoHeight

const ctx=canvas.getContext("2d")

ctx.drawImage(video,0,0)

photos.push(canvas.toDataURL("image/png"))

updatePreview()

updateCounter()

}

/* COUNTER */

function updateCounter(){

document.getElementById("photoCount").innerText =
photos.length+" / 4 Photos"

}

/* PREVIEW */

function updatePreview(){

const canvas=document.getElementById("previewCanvas")
const ctx=canvas.getContext("2d")

ctx.clearRect(0,0,canvas.width,canvas.height)

const scale = canvas.width / 1200

const positions=[
{ x:95.2,y:222.9 },
{ x:95.2,y:871.4 },
{ x:95.2,y:1520 },
{ x:95.2,y:2168.6 }
]

photos.forEach((photo,index)=>{

const img=new Image()

img.onload=function(){

const pos=positions[index]

ctx.drawImage(
img,
pos.x*scale,
pos.y*scale,
1000*scale,
600*scale
)

drawPreviewFrame()

}

img.src=photo

})

}

/* PREVIEW FRAME */

function drawPreviewFrame(){

const canvas=document.getElementById("previewCanvas")
const ctx=canvas.getContext("2d")

const frame=new Image()

frame.onload=function(){

ctx.drawImage(frame,0,0,canvas.width,canvas.height)

}

frame.src=selectedFrame

}

/* RETAKE */

function retakeAll(){

photos=[]

updatePreview()

updateCounter()

}

/* GENERATE STRIP */

function generateStrip(){

if(photos.length!==4){
alert("Take 4 photos first")
return
}

const canvas=document.getElementById("canvas")
const ctx=canvas.getContext("2d")

const positions=[
{ x:95.2,y:222.9 },
{ x:95.2,y:871.4 },
{ x:95.2,y:1520 },
{ x:95.2,y:2168.6 }
]

photos.forEach((photo,index)=>{

const img=new Image()

img.onload=function(){

const pos=positions[index]

ctx.drawImage(img,pos.x,pos.y,1000,600)

if(index===3){
drawFrame()
}

}

img.src=photo

})

}

function drawFrame(){

const canvas=document.getElementById("canvas")
const ctx=canvas.getContext("2d")

const frame=new Image()

frame.onload=function(){

ctx.drawImage(frame,0,0,canvas.width,canvas.height)

download()

}

frame.src=selectedFrame

}

/* DOWNLOAD */

function download(){

const canvas=document.getElementById("canvas")

const link=document.getElementById("downloadLink")

link.href=canvas.toDataURL("image/png")

link.click()

setTimeout(resetBooth,2000)

}

/* AUTO RESET */

function resetBooth(){

photos=[]

updatePreview()

updateCounter()

}
