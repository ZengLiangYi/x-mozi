// API Base URL
const API_BASE = window.location.origin;

// State
let state = {
    faceFileId: null,
    audioFileId: null,
    isProcessing: false,
    eventSource: null
};

// DOM Elements
const faceInput = document.getElementById('faceInput');
const audioInput = document.getElementById('audioInput');
const faceUploadArea = document.getElementById('faceUploadArea');
const audioUploadArea = document.getElementById('audioUploadArea');
const facePreview = document.getElementById('facePreview');
const audioPreview = document.getElementById('audioPreview');
const faceInfo = document.getElementById('faceInfo');
const audioInfo = document.getElementById('audioInfo');
const generateBtn = document.getElementById('generateBtn');
const generateTTSBtn = document.getElementById('generateTTSBtn');
const ttsText = document.getElementById('ttsText');
const voiceSelect = document.getElementById('voiceSelect');
const ttsAudioPreview = document.getElementById('ttsAudioPreview');
const statusBar = document.getElementById('statusBar');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultCard = document.getElementById('resultCard');
const resultVideo = document.getElementById('resultVideo');
const downloadBtn = document.getElementById('downloadBtn');
const newGenerateBtn = document.getElementById('newGenerateBtn');
const realtimeMode = document.getElementById('realtimeMode');
const realtimePreviewCard = document.getElementById('realtimePreviewCard');
const realtimeCanvas = document.getElementById('realtimeCanvas');
const frameCounter = document.getElementById('frameCounter');
const fpsCounter = document.getElementById('fpsCounter');
const etaCounter = document.getElementById('etaCounter');
const previewStatus = document.getElementById('previewStatus');

// Canvas context
const ctx = realtimeCanvas.getContext('2d');

// Stats for real-time display
let realtimeStats = {
    startTime: 0,
    frameCount: 0,
    totalFrames: 0,
    lastFrameTime: 0,
    fpsValues: []
};

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const tabId = tab.dataset.tab + 'Tab';
        document.getElementById(tabId).classList.add('active');
    });
});

// File upload handlers
function setupUploadArea(area, input, type) {
    area.addEventListener('click', () => input.click());

    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('dragover');
    });

    area.addEventListener('dragleave', () => {
        area.classList.remove('dragover');
    });

    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0], type);
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0], type);
        }
    });
}

setupUploadArea(faceUploadArea, faceInput, 'face');
setupUploadArea(audioUploadArea, audioInput, 'audio');

async function handleFileUpload(file, type) {
    const formData = new FormData();
    formData.append('file', file);

    const uploadArea = type === 'face' ? faceUploadArea : audioUploadArea;
    const preview = type === 'face' ? facePreview : audioPreview;
    const info = type === 'face' ? faceInfo : audioInfo;

    try {
        uploadArea.style.opacity = '0.6';
        uploadArea.style.pointerEvents = 'none';

        const response = await fetch(`${API_BASE}/api/upload/${type}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload failed');
        }

        const data = await response.json();

        if (type === 'face') {
            state.faceFileId = data.file_id;

            // Show preview
            if (file.type.startsWith('image/')) {
                preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Face preview">`;
            } else if (file.type.startsWith('video/')) {
                preview.innerHTML = `<video src="${URL.createObjectURL(file)}" controls muted></video>`;
            }
        } else {
            state.audioFileId = data.file_id;
            audioPreview.src = URL.createObjectURL(file);
            audioPreview.style.display = 'block';
        }

        uploadArea.classList.add('has-file');
        info.textContent = `Uploaded: ${file.name} (${formatFileSize(file.size)})`;
        info.classList.add('show');

        updateGenerateButton();

    } catch (error) {
        alert(`Upload error: ${error.message}`);
    } finally {
        uploadArea.style.opacity = '1';
        uploadArea.style.pointerEvents = 'auto';
    }
}

// TTS Generation
generateTTSBtn.addEventListener('click', async () => {
    const text = ttsText.value.trim();
    if (!text) {
        alert('Please enter text to convert to speech');
        return;
    }

    const voiceId = voiceSelect.value;
    const locale = voiceSelect.selectedOptions[0].dataset.locale;

    try {
        setButtonLoading(generateTTSBtn, true);

        const response = await fetch(`${API_BASE}/api/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voice_id: voiceId,
                locale: locale
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'TTS failed');
        }

        const data = await response.json();
        state.audioFileId = data.file_id;

        // Update audio preview
        ttsAudioPreview.src = `${API_BASE}/api/video/${data.file_id}`;
        ttsAudioPreview.style.display = 'block';

        audioUploadArea.classList.add('has-file');
        audioInfo.textContent = `Generated audio from TTS`;
        audioInfo.classList.add('show');

        updateGenerateButton();

    } catch (error) {
        alert(`TTS error: ${error.message}`);
    } finally {
        setButtonLoading(generateTTSBtn, false);
    }
});

// Generate Video
generateBtn.addEventListener('click', async () => {
    if (!state.faceFileId || !state.audioFileId) {
        alert('Please upload both face and audio files');
        return;
    }

    if (state.isProcessing) return;

    state.isProcessing = true;

    // Check if real-time mode is enabled
    if (realtimeMode.checked) {
        await generateVideoRealtime();
    } else {
        await generateVideoBatch();
    }
});

// Frame streaming mode - Canvas + Web Audio
let frameBuffer = [];       // Buffer of frames waiting to be drawn
let audioContext = null;    // Web Audio API context
let audioSource = null;     // Audio source node
let audioBuffer = null;     // Decoded audio buffer
let audioStartTime = 0;     // When audio started playing
let isAudioPlaying = false;
let animationFrameId = null;
let targetFps = 25;
let frameInterval = 1000 / 25;
let lastFrameTime = 0;
let currentFrameIndex = 0;
let totalFrames = 0;
let audioUrl = null;
let audioReady = false;         // 音频是否已加载
let minFramesBeforeStart = 30;  // 至少有多少帧才开始播放（约1秒缓冲）
let generationComplete = false; // 生成是否已完成
let lastDrawnFrame = null;      // 最后绘制的帧（用于跳帧时保持画面）

// Real-time streaming video generation (frame-based with Canvas + Web Audio)
async function generateVideoRealtime() {
    try {
        setButtonLoading(generateBtn, true);
        setStatus('processing', 'Starting frame streaming...');
        showProgress(true);

        // Show real-time preview card
        realtimePreviewCard.style.display = 'block';
        realtimePreviewCard.scrollIntoView({ behavior: 'smooth' });

        // Reset frame buffer and playback state
        frameBuffer = [];
        currentFrameIndex = 0;
        totalFrames = 0;
        isAudioPlaying = false;
        lastFrameTime = 0;
        audioReady = false;
        generationComplete = false;
        lastDrawnFrame = null;

        // Stop any existing animation
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Stop any existing audio
        if (audioSource) {
            try { audioSource.stop(); } catch(e) {}
            audioSource = null;
        }
        if (audioContext) {
            try { audioContext.close(); } catch(e) {}
            audioContext = null;
        }

        // Show canvas
        realtimeCanvas.style.display = 'block';

        // Reset stats
        realtimeStats = {
            startTime: Date.now(),
            frameCount: 0,
            totalFrames: 0,
            lastFrameTime: Date.now(),
            fpsValues: []
        };

        updatePreviewStatus('processing', 'Initializing...');

        const formData = new FormData();
        formData.append('face_file_id', state.faceFileId);
        formData.append('audio_file_id', state.audioFileId);
        formData.append('batch_size', '16');
        formData.append('output_fps', '25');     // Frame rate for canvas playback
        formData.append('jpeg_quality', '75');   // JPEG quality (lower = smaller = faster)

        // Get quality/resize setting
        const qualitySelect = document.getElementById('qualitySelect');
        const resizeFactor = qualitySelect ? qualitySelect.value : '1.0';
        formData.append('resize_factor', resizeFactor);

        // Use frame streaming endpoint
        const response = await fetch(`${API_BASE}/api/generate/frames`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || error.error || 'Generation failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr.trim()) {
                        try {
                            const event = JSON.parse(jsonStr);
                            handleStreamEvent(event);
                        } catch (e) {
                            console.error('Parse error:', e, jsonStr);
                        }
                    }
                }
            }
        }

    } catch (error) {
        setStatus('error', `Error: ${error.message}`);
        updatePreviewStatus('error', `Error: ${error.message}`);
        alert(`Generation error: ${error.message}`);
    } finally {
        setButtonLoading(generateBtn, false);
        state.isProcessing = false;
    }
}

// Handle stream events (frame-based)
function handleStreamEvent(event) {
    switch (event.type) {
        case 'start':
            updatePreviewStatus('processing', event.message);
            break;

        case 'status':
            setStatus('processing', event.message);
            updatePreviewStatus('processing', event.message);
            break;

        case 'info':
            // Setup canvas size
            totalFrames = event.total_frames;
            targetFps = event.fps;
            frameInterval = 1000 / targetFps;
            audioUrl = API_BASE + event.audio_url;

            // 根据帧率计算最小缓冲帧数（约1秒）
            minFramesBeforeStart = Math.min(Math.ceil(targetFps * 1), 30);

            realtimeCanvas.width = event.width;
            realtimeCanvas.height = event.height;

            frameCounter.textContent = `Frame: 0/${totalFrames}`;
            fpsCounter.textContent = `FPS: ${targetFps}`;
            etaCounter.textContent = `Duration: ${event.audio_duration.toFixed(1)}s`;
            updatePreviewStatus('processing', `Generating ${totalFrames} frames...`);

            // Preload audio - 加载完成后会尝试开始播放
            loadAudio(audioUrl);
            break;

        case 'frame':
            // New frame received - store in buffer
            frameBuffer[event.index] = event.data;
            setProgress(event.progress);
            frameCounter.textContent = `Frame: ${event.index + 1}/${totalFrames} (buffered: ${getBufferedFrameCount()})`;

            // 实时预览：如果还没开始播放，显示当前生成的帧
            if (!isAudioPlaying) {
                drawFrame(event.data);
            }

            // 🔥 关键：检查是否可以开始播放（音频已加载 + 有足够帧）
            tryStartPlayback();
            break;

        case 'complete':
            generationComplete = true;
            setProgress(100);
            setStatus('ready', 'Video generated successfully!');
            updatePreviewStatus('complete', `Complete! ${event.total_frames} frames in ${event.total_time}s (${event.fps_actual} fps)`);

            // 如果还没开始播放（极端情况：生成太快或缓冲太小），立即开始
            if (!isAudioPlaying && frameBuffer.length > 0) {
                console.log('Generation complete, ensuring playback starts...');
                tryStartPlayback();
            }

            setTimeout(() => showProgress(false), 2000);
            break;

        case 'error':
            setStatus('error', event.message);
            updatePreviewStatus('error', event.message);
            break;
    }
}

// 获取已缓冲的帧数
function getBufferedFrameCount() {
    let count = 0;
    for (let i = 0; i < frameBuffer.length; i++) {
        if (frameBuffer[i]) count++;
    }
    return count;
}

// 尝试开始播放（满足条件时自动开始）
function tryStartPlayback() {
    // 已经在播放了，不重复启动
    if (isAudioPlaying) return;

    // 音频还没准备好
    if (!audioReady || !audioBuffer || !audioContext) {
        return;
    }

    // 检查是否有足够的帧（或者生成已完成）
    const bufferedCount = getBufferedFrameCount();
    if (bufferedCount >= minFramesBeforeStart || generationComplete) {
        console.log(`Starting playback: ${bufferedCount} frames buffered, generation complete: ${generationComplete}`);
        startPlayback();
    }
}

// Load and decode audio for Web Audio API
async function loadAudio(url) {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        console.log('Audio loaded:', audioBuffer.duration, 'seconds');

        // 标记音频已准备好，然后尝试开始播放
        audioReady = true;
        tryStartPlayback();
    } catch (e) {
        console.error('Failed to load audio:', e);
    }
}

// Start synchronized playback
function startPlayback() {
    if (isAudioPlaying) return;
    if (!audioBuffer || !audioContext) {
        console.warn('Audio not ready');
        return;
    }

    isAudioPlaying = true;
    currentFrameIndex = 0;

    // Start audio
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);
    audioSource.start(0);
    audioStartTime = audioContext.currentTime;

    console.log('🎬 Playback started! Audio + video synchronized.');
    updatePreviewStatus('processing', '▶ Playing (streaming)...');

    // Start frame rendering loop
    renderFrame();
}

// Render frames synchronized with audio
function renderFrame() {
    if (!isAudioPlaying) return;

    // Calculate which frame should be showing based on audio time
    const audioElapsed = audioContext.currentTime - audioStartTime;
    const targetFrame = Math.floor(audioElapsed * targetFps);

    // Draw frame if available
    if (targetFrame < frameBuffer.length && frameBuffer[targetFrame]) {
        if (currentFrameIndex !== targetFrame) {
            drawFrame(frameBuffer[targetFrame]);
            lastDrawnFrame = frameBuffer[targetFrame];
            currentFrameIndex = targetFrame;
        }
    } else if (targetFrame >= frameBuffer.length && !generationComplete) {
        // 帧还没生成到，显示等待状态（但不暂停音频）
        // 继续显示最后一帧，等待新帧到达
        if (lastDrawnFrame && currentFrameIndex !== targetFrame) {
            // 可选：在画面上显示缓冲提示
            // drawFrame(lastDrawnFrame);
        }
    }

    // 更新帧计数器显示
    const bufferedCount = getBufferedFrameCount();
    const bufferStatus = generationComplete ? '' : ` (buffer: ${bufferedCount})`;
    frameCounter.textContent = `Frame: ${Math.min(currentFrameIndex + 1, totalFrames)}/${totalFrames}${bufferStatus}`;

    // Continue loop or stop at end
    if (targetFrame < totalFrames) {
        animationFrameId = requestAnimationFrame(renderFrame);
    } else {
        console.log('🎬 Playback complete');
        isAudioPlaying = false;
        updatePreviewStatus('complete', 'Playback finished');
    }
}

// Draw a single frame to canvas
function drawFrame(base64Data) {
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, realtimeCanvas.width, realtimeCanvas.height);
    };
    img.src = 'data:image/jpeg;base64,' + base64Data;
}

// Update preview status
function updatePreviewStatus(type, message) {
    previewStatus.className = 'preview-status ' + type;
    previewStatus.textContent = message;
}

// Format time in seconds to readable string
function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s`;
    }
}

// Batch mode video generation (original)
async function generateVideoBatch() {
    try {
        setButtonLoading(generateBtn, true);
        setStatus('processing', 'Processing video...');
        showProgress(true);

        // Simulate progress (actual progress tracking would require WebSocket)
        const progressInterval = simulateProgress();

        const formData = new FormData();
        formData.append('face_file_id', state.faceFileId);
        formData.append('audio_file_id', state.audioFileId);

        const response = await fetch(`${API_BASE}/api/generate`, {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Generation failed');
        }

        const data = await response.json();

        setProgress(100);
        setStatus('ready', 'Video generated successfully!');

        // Show result
        resultVideo.src = data.download_url;
        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth' });

        // Setup download button
        downloadBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = data.download_url;
            a.download = data.video_id;
            a.click();
        };

    } catch (error) {
        setStatus('error', `Error: ${error.message}`);
        alert(`Generation error: ${error.message}`);
    } finally {
        setButtonLoading(generateBtn, false);
        state.isProcessing = false;
        setTimeout(() => showProgress(false), 2000);
    }
}

// New Generation
newGenerateBtn.addEventListener('click', () => {
    // Reset state
    state = {
        faceFileId: null,
        audioFileId: null,
        isProcessing: false,
        eventSource: null
    };

    // Reset UI
    faceUploadArea.classList.remove('has-file');
    audioUploadArea.classList.remove('has-file');
    facePreview.innerHTML = '';
    audioPreview.style.display = 'none';
    audioPreview.src = '';
    ttsAudioPreview.style.display = 'none';
    ttsAudioPreview.src = '';
    faceInfo.classList.remove('show');
    audioInfo.classList.remove('show');
    ttsText.value = '';
    resultCard.style.display = 'none';

    // Reset real-time preview
    realtimePreviewCard.style.display = 'none';
    realtimeCanvas.style.display = 'block';
    ctx.clearRect(0, 0, realtimeCanvas.width, realtimeCanvas.height);
    frameCounter.textContent = 'Frame: 0/0';
    fpsCounter.textContent = 'FPS: --';
    etaCounter.textContent = 'Duration: --';
    updatePreviewStatus('', 'Waiting to start...');

    // Reset frame streaming state
    frameBuffer = [];
    currentFrameIndex = 0;
    totalFrames = 0;
    isAudioPlaying = false;
    audioReady = false;
    generationComplete = false;
    lastDrawnFrame = null;

    // Stop animation
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Clean up audio
    if (audioSource) {
        try { audioSource.stop(); } catch(e) {}
        audioSource = null;
    }
    if (audioContext) {
        try { audioContext.close(); } catch(e) {}
        audioContext = null;
    }
    audioBuffer = null;

    setStatus('ready', 'Ready to generate');
    updateGenerateButton();

    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Utility functions
function updateGenerateButton() {
    generateBtn.disabled = !state.faceFileId || !state.audioFileId;
    if (state.faceFileId && state.audioFileId) {
        setStatus('ready', 'Ready to generate');
    }
}

function setButtonLoading(btn, loading) {
    const textEl = btn.querySelector('.btn-text');
    const loadingEl = btn.querySelector('.btn-loading');

    if (loading) {
        textEl.style.display = 'none';
        loadingEl.style.display = 'inline';
        btn.disabled = true;
    } else {
        textEl.style.display = 'inline';
        loadingEl.style.display = 'none';
        btn.disabled = false;
    }
}

function setStatus(type, text) {
    statusBar.className = 'status-bar ' + type;
    statusBar.querySelector('.status-text').textContent = text;
}

function showProgress(show) {
    progressContainer.style.display = show ? 'flex' : 'none';
    if (!show) {
        setProgress(0);
    }
}

function setProgress(percent) {
    progressFill.style.width = percent + '%';
    progressText.textContent = Math.round(percent) + '%';
}

function simulateProgress() {
    let progress = 0;
    return setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 5;
            setProgress(Math.min(progress, 90));
        }
    }, 500);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Initialize
setStatus('ready', 'Ready to generate');
