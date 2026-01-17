const BACKEND_URL = 'http://localhost:5001';

let socket;
let sessionId;
let mediaRecorder;
let isRecording = false;
let currentQuestion = null;
let currentTranscript = '';
let totalQuestions = 5;
let currentQuestionNumber = 0;

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
    const transcriptEl = document.getElementById('transcriptText');
    transcriptEl.classList.remove('empty');
    
    if (data.is_final) {
        currentTranscript = data.full_transcript;
        transcriptEl.innerHTML = currentTranscript;
    } else {
        transcriptEl.innerHTML = currentTranscript + ' <span class="partial-text">' + data.text + '</span>';
    }
});

socket.on('reaction', async (data) => {
    const reactionCard = document.getElementById('reactionCard');
    const reactionText = document.getElementById('reactionText');
    
    reactionText.textContent = '💬 ' + data.reaction;
    reactionCard.style.display = 'block';
    
    // Play TTS and wait for it to finish
    if (data.has_audio) {
        try {
            await playTTS(data.reaction);
        } catch (error) {
            console.error('Reaction TTS error:', error);
        }
    }
    
    // Move to next question after reaction finishes playing
    setTimeout(() => {
        reactionCard.style.display = 'none';
        getNextQuestion();
    }, 1500);
});

socket.on('error', (data) => {
    updateStatus(data.message, 'error');
});

async function startInterview() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/start`, { method: 'POST' });
        const data = await response.json();
        
        sessionId = data.session_id;
        updateStatus('Interview started! Preparing first question...');
        
        await getNextQuestion();
    } catch (error) {
        console.error('Failed to start interview:', error);
        updateStatus('Failed to connect to server. Please make sure the backend is running.', 'error');
    }
}

async function getNextQuestion() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/question/${sessionId}`);
        const data = await response.json();
        
        if (data.completed) {
            // All questions done, proceed to code review
            completeInterview();
            return;
        }
        
        currentQuestion = data;
        currentQuestionNumber = data.question_number;
        
        // Update progress
        const progress = (currentQuestionNumber / totalQuestions) * 100;
        document.getElementById('progressBar').style.width = progress + '%';
        
        // Display question
        document.getElementById('questionLabel').textContent = `QUESTION ${currentQuestionNumber}`;
        document.getElementById('questionText').textContent = data.question;
        document.getElementById('questionCard').classList.remove('hidden');
        document.getElementById('transcriptCard').classList.remove('hidden');
        document.getElementById('transcriptText').textContent = 'Click "Start Recording" and speak your answer...';
        document.getElementById('transcriptText').classList.add('empty');
        
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('submitBtn').disabled = true;
        
        currentTranscript = '';
        
        updateStatus(`Question ${currentQuestionNumber} of ${totalQuestions}`);
        
        // Play question TTS and wait for it to finish before enabling recording
        if (data.has_audio) {
            try {
                await playTTS(data.question);
                // Add a small pause after question finishes
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error('Question TTS error:', error);
            }
        }
    } catch (error) {
        console.error('Failed to get question:', error);
        updateStatus('Failed to load question', 'error');
    }
}

async function playTTS(text) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // Return a promise that resolves when audio finishes playing
        return new Promise((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onerror = (error) => reject(error);
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                const reader = new FileReader();
                reader.onload = () => {
                    socket.emit('audio_chunk', {
                        session_id: sessionId,
                        audio: reader.result
                    });
                };
                reader.readAsArrayBuffer(event.data);
            }
        };
        
        mediaRecorder.start(1000);
        isRecording = true;
        
        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = '⏹️ Stop Recording';
        recordBtn.classList.add('recording');
        document.getElementById('submitBtn').disabled = false;
        
        updateStatus('Recording... Speak your answer clearly');
        
    } catch (error) {
        console.error('Microphone access error:', error);
        alert('Could not access microphone. Please grant permission and try again.');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        
        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = '🎤 Start Recording';
        recordBtn.classList.remove('recording');
        
        updateStatus('Recording stopped. Review your answer and click Submit.');
    }
}

async function submitAnswer() {
    if (!currentTranscript || currentTranscript.length < 10) {
        alert('Please speak your answer first (minimum 10 characters)');
        return;
    }
    
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
    updateStatus('All questions completed! Preparing code review...');
    document.getElementById('progressBar').style.width = '100%';
    document.getElementById('questionCard').classList.add('hidden');
    document.getElementById('transcriptCard').classList.add('hidden');
    document.getElementById('recordBtn').style.display = 'none';
    document.getElementById('submitBtn').style.display = 'none';
    
    // Get the submitted code from localStorage
    const submission = JSON.parse(localStorage.getItem('oa_last_submission') || '{}');
    const code = submission.code || '';
    
    if (!code) {
        updateStatus('No code found for review. Redirecting to feedback...');
        setTimeout(() => {
            window.location.href = 'feedback.html';
        }, 2000);
        return;
    }
    
    // Submit code for review
    try {
        updateStatus('AI is reviewing your code...');
        
        const response = await fetch(`${BACKEND_URL}/api/code_review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                session_id: sessionId, 
                code: code 
            })
        });
        
        const data = await response.json();
        
        // Store the AI feedback
        submission.ai_feedback = data.feedback;
        localStorage.setItem('oa_last_submission', JSON.stringify(submission));
        
        // Play feedback TTS and wait for it to finish
        if (data.has_audio) {
            updateStatus('Playing AI feedback...');
            try {
                await playTTS(data.feedback);
            } catch (error) {
                console.error('Feedback TTS error:', error);
            }
        }
        
        // Save session
        await fetch(`${BACKEND_URL}/api/save/${sessionId}`, { method: 'POST' });
        
        updateStatus('Interview complete! Redirecting to feedback page...');
        
        setTimeout(() => {
            window.location.href = 'feedback.html';
        }, 2000);
        
    } catch (error) {
        console.error('Code review error:', error);
        updateStatus('Code review failed. Redirecting to feedback...');
        setTimeout(() => {
            window.location.href = 'feedback.html';
        }, 2000);
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

// Event listeners
document.getElementById('recordBtn').addEventListener('click', toggleRecording);
document.getElementById('submitBtn').addEventListener('click', submitAnswer);

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
