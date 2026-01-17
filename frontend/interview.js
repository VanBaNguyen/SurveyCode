const BACKEND_URL = 'http://localhost:5001';

let socket;
let sessionId;
let mediaRecorder;
let isRecording = false;
let currentQuestion = null;
let currentTranscript = '';
let totalQuestions = 5;
let currentQuestionNumber = 0;
let interviewCompleted = false;  // Flag to prevent duplicate completion calls

// Initialize Socket.IO
socket = io(BACKEND_URL);

socket.on('connected', (data) => {
    console.log('Connected to server');
    playIntroduction();
});

async function playIntroduction() {
    const introText = "Hello! Thank you for submitting your code. Before we provide feedback, we'd like to ask you a few quick questions to get to know you better. This will only take a few minutes. Let's begin!";
    
    updateStatus('Welcome! Please listen to the introduction...');
    
    try {
        // Wait for intro to finish playing completely
        await playTTS(introText);
        // Add a pause after intro before starting questions
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Now start the interview
        await startInterview();
    } catch (error) {
        console.error('Intro playback error:', error);
        // If TTS fails, just start the interview
        await startInterview();
    }
}

socket.on('transcription', (data) => {
    console.log('Transcription received:', data);
    
    if (data.is_final) {
        currentTranscript = data.full_transcript;
        console.log('Final transcript:', currentTranscript);
    }
});

socket.on('reaction', async (data) => {
    const reactionCard = document.getElementById('reactionCard');
    const reactionText = document.getElementById('reactionText');
    
    reactionText.textContent = '💬 ' + data.reaction;
    reactionCard.style.display = 'block';
    
    console.log(`Reaction received. Current question: ${currentQuestionNumber}, Total: ${totalQuestions}`);
    
    // Play TTS and wait for it to finish
    if (data.has_audio) {
        try {
            await playTTS(data.reaction);
        } catch (error) {
            console.error('Reaction TTS error:', error);
        }
    }
    
    // Hide reaction
    setTimeout(() => {
        reactionCard.style.display = 'none';
        
        // Check if interview is already completed
        if (interviewCompleted) {
            console.log('Interview already completed, not calling getNextQuestion');
            return;
        }
        
        // Check if we just finished the last question
        if (currentQuestionNumber >= totalQuestions) {
            console.log(`Completed all ${totalQuestions} questions, moving to code review`);
            interviewCompleted = true;
            completeInterview();
        } else {
            console.log(`Moving to question ${currentQuestionNumber + 1}`);
            getNextQuestion();
        }
    }, 1000);
});

socket.on('auto_submit', (data) => {
    console.log('Auto-submit triggered by silence detection');
    console.log('Answer submitted:', data.answer);
    
    // Stop recording
    stopRecording();
    
    // Server detected silence and auto-submitted
    updateStatus('Answer recorded! AI is responding...');
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) recordBtn.disabled = true;
});

socket.on('error', (data) => {
    updateStatus(data.message, 'error');
});

async function startInterview() {
    try {
        console.log('Starting interview...');
        const response = await fetch(`${BACKEND_URL}/api/start`, { method: 'POST' });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Interview started:', data);
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        sessionId = data.session_id;
        updateStatus('Interview started! Preparing first question...');
        
        await getNextQuestion();
    } catch (error) {
        console.error('Failed to start interview:', error);
        updateStatus(`Failed to connect to server: ${error.message}. Please make sure the backend is running on port 5001.`, 'error');
    }
}

async function getNextQuestion() {
    // Don't fetch if interview is already completed
    if (interviewCompleted) {
        console.log('Interview already completed, skipping getNextQuestion');
        return;
    }
    
    try {
        console.log('Fetching next question for session:', sessionId);
        const response = await fetch(`${BACKEND_URL}/api/question/${sessionId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Question data received:', data);
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        if (data.completed) {
            // All questions done, proceed to code review
            console.log('Backend says all questions completed');
            interviewCompleted = true;
            completeInterview();
            return;
        }
        
        currentQuestion = data;
        currentQuestionNumber = data.question_number;
        
        console.log(`Displaying question ${currentQuestionNumber} of ${totalQuestions}`);
        console.log(`Backend current_question_index is now: ${currentQuestionNumber}`);
        
        // Update progress
        const progress = (currentQuestionNumber / totalQuestions) * 100;
        document.getElementById('progressBar').style.width = progress + '%';
        
        // Display question
        document.getElementById('questionLabel').textContent = `QUESTION ${currentQuestionNumber}`;
        document.getElementById('questionText').textContent = data.question;
        document.getElementById('questionCard').classList.remove('hidden');
        document.getElementById('transcriptCard').classList.remove('hidden');
        document.getElementById('transcriptText').textContent = 'Click "Start Recording" to begin...';
        document.getElementById('transcriptText').classList.add('empty');
        
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) recordBtn.disabled = true;
        
        currentTranscript = '';
        
        updateStatus(`Question ${currentQuestionNumber} of ${totalQuestions}`);
        
        // Play question TTS and wait for it to finish before enabling recording
        console.log('Playing question TTS...');
        try {
            await playTTS(data.question);
            console.log('Question TTS finished');
            // Add a small pause after question finishes
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error('Question TTS error:', error);
            updateStatus('TTS failed, but continuing...', 'error');
        }
        
        // Enable recording button after question finishes
        updateStatus('Click "Start Recording" to answer');
        document.getElementById('transcriptText').textContent = 'Click "Start Recording" to begin...';
        if (recordBtn) {
            recordBtn.disabled = false;
            recordBtn.textContent = '🎤 Start Recording';
        }
    } catch (error) {
        console.error('Failed to get question:', error);
        updateStatus(`Failed to load question: ${error.message}`, 'error');
    }
}

async function playTTS(text) {
    try {
        console.log('Generating TTS for:', text.substring(0, 50) + '...');
        const response = await fetch(`${BACKEND_URL}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        if (!response.ok) {
            throw new Error(`TTS HTTP ${response.status}: ${response.statusText}`);
        }
        
        const audioBlob = await response.blob();
        console.log('TTS audio received, size:', audioBlob.size);
        
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // Return a promise that resolves when audio finishes playing
        return new Promise((resolve, reject) => {
            audio.onended = () => {
                console.log('TTS playback finished');
                resolve();
            };
            audio.onerror = (error) => {
                console.error('Audio playback error:', error);
                reject(error);
            };
            audio.play().catch(reject);
        });
    } catch (error) {
        console.error('TTS playback error:', error);
        throw error;
    }
}

async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        console.log('Microphone access granted');
        
        // Use AudioContext for proper audio processing
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        let chunkCount = 0;
        processor.onaudioprocess = (e) => {
            if (!isRecording) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Convert Float32Array to Int16Array (PCM 16-bit)
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            chunkCount++;
            if (chunkCount % 10 === 0) {
                console.log(`Sent ${chunkCount} audio chunks`);
            }
            
            // Send PCM data to server
            socket.emit('audio_chunk', {
                session_id: sessionId,
                audio: Array.from(pcmData)  // Convert to regular array for JSON
            });
        };
        
        // Store for cleanup
        window.audioStream = stream;
        window.audioContext = audioContext;
        window.audioProcessor = processor;
        
        isRecording = true;
        
        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = '🎤 Recording...';
        recordBtn.classList.add('recording');
        
        updateStatus('Recording... Speak your answer clearly');
        document.getElementById('transcriptText').textContent = 'Listening...';
        console.log('Recording started - speak now!');
        
    } catch (error) {
        console.error('Microphone access error:', error);
        alert('Could not access microphone. Please grant permission and try again.');
    }
}

function stopRecording() {
    if (isRecording) {
        isRecording = false;
        
        // Clean up audio resources
        if (window.audioProcessor) {
            window.audioProcessor.disconnect();
            window.audioProcessor = null;
        }
        if (window.audioContext) {
            window.audioContext.close();
            window.audioContext = null;
        }
        if (window.audioStream) {
            window.audioStream.getTracks().forEach(track => track.stop());
            window.audioStream = null;
        }
        
        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = '🎤 Start Recording';
        recordBtn.classList.remove('recording');
        recordBtn.disabled = true;
        
        updateStatus('Recording stopped. Review your answer and click Submit.');
        console.log('Recording stopped. Current transcript:', currentTranscript);
    }
}

async function submitAnswer() {
    if (!currentTranscript || currentTranscript.length < 10) {
        console.warn('Answer too short:', currentTranscript);
        alert('Please speak your answer first (minimum 10 characters)');
        return;
    }
    
    console.log('Submitting answer:', currentTranscript);
    stopRecording();
    
    socket.emit('submit_answer', {
        session_id: sessionId,
        answer: currentTranscript,
        question_number: currentQuestion.question_number,
        question: currentQuestion.question
    });
    
    updateStatus('Processing your answer...');
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('recordBtn').disabled = true;
}

async function completeInterview() {
    // Prevent duplicate calls
    if (interviewCompleted && document.getElementById('questionCard').classList.contains('hidden')) {
        console.log('completeInterview already running, skipping duplicate call');
        return;
    }
    
    console.log('Starting completeInterview()');
    interviewCompleted = true;
    
    // Hide interview UI
    document.getElementById('questionCard').classList.add('hidden');
    document.getElementById('transcriptCard').classList.add('hidden');
    
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) recordBtn.style.display = 'none';
    
    // Show processing status
    updateStatus('All questions completed! AI is reviewing your code...');
    document.getElementById('progressBar').style.width = '100%';
    
    // Get the submitted code from localStorage
    const submission = JSON.parse(localStorage.getItem('oa_last_submission') || '{}');
    const code = submission.code || '';
    
    if (!code) {
        updateStatus('No code found for review. Redirecting to feedback...');
        window.location.replace('feedback.html');
        return;
    }
    
    // Submit code for review
    try {
        console.log('Submitting code for AI review...');
        
        const response = await fetch(`${BACKEND_URL}/api/code_review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                session_id: sessionId, 
                code: code 
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('AI feedback received');
        
        // Store the AI feedback
        submission.ai_feedback = data.feedback;
        localStorage.setItem('oa_last_submission', JSON.stringify(submission));
        
        // Save session
        await fetch(`${BACKEND_URL}/api/save/${sessionId}`, { method: 'POST' });
        
        // Redirect immediately to feedback page where AI will speak
        updateStatus('Review complete! Moving to feedback...');
        console.log('Redirecting to feedback page...');
        
        // Force redirect
        window.location.replace('feedback.html');
        
    } catch (error) {
        console.error('Code review error:', error);
        updateStatus('Code review failed. Redirecting to feedback...');
        window.location.replace('feedback.html');
    }
}

function updateStatus(message, type = 'info') {
    const banner = document.getElementById('statusBanner');
    banner.textContent = message;
    
    if (type === 'error') {
        banner.style.background = '#fee2e2';
        banner.style.borderColor = '#ef4444';
        banner.style.color = '#991b1b';
    } else {
        banner.style.background = '#f0f4ff';
        banner.style.borderColor = '#4f46e5';
        banner.style.color = '#4f46e5';
    }
}

// Event listeners - buttons are now automatic/disabled
document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            if (!isRecording) {
                startRecording();
            }
        });
    }
});

// Check if we have a submission
window.addEventListener('DOMContentLoaded', () => {
    const submission = localStorage.getItem('oa_last_submission');
    if (!submission) {
        updateStatus('No code submission found. Please submit code first.', 'error');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    }
});
