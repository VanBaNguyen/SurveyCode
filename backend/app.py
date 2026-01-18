#!/usr/bin/env python3
"""
Flask WebSocket server for AI Voice Interview
"""

from flask import Flask, render_template, request, jsonify, session, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import json
import time
import os
from dotenv import load_dotenv
from openai import OpenAI
from elevenlabs.client import ElevenLabs
from vosk import Model, KaldiRecognizer
import wave
import io

load_dotenv()

app = Flask(__name__, static_folder='../frontend', template_folder='../frontend')
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=10000000)

# Initialize AI clients
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
elevenlabs_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API"))
VOICE_ID = "hzLyDn3IrvrdH83BdqUu"

# Initialize Vosk model
print("Loading Vosk model...")
vosk_model = Model("model")
print("Model loaded!")

# Store active sessions
sessions = {}


class InterviewSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.questions = self.load_questions()
        self.current_question_index = 0
        self.responses = []
        self.recognizer = KaldiRecognizer(vosk_model, 16000)
        self.recognizer.SetWords(True)
        self.current_transcript = ""
        self.code_review = None
        self.last_speech_time = time.time()
        self.is_speaking = False
        self.silence_threshold = 0.6  # seconds of silence to auto-submit
        self.min_answer_length = 10
        self.answer_submitted = False  # Prevent duplicate submissions
        
    def load_questions(self):
        try:
            with open("interview_questions.json", 'r') as f:
                data = json.load(f)
                return data.get("questions", [])
        except FileNotFoundError:
            return [
                "Can you tell me a little about yourself?",
                "What are you currently working on?",
                "What are your main interests?",
                "What's a recent accomplishment you're proud of?",
                "Where do you see yourself in the future?"
            ]
    
    def get_next_question(self):
        if self.current_question_index < len(self.questions):
            question = self.questions[self.current_question_index]
            self.current_question_index += 1
            # Reset submission flag for new question
            self.answer_submitted = False
            return question
        return None
    
    def generate_reaction(self, answer):
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a friendly interviewer. Give a brief, natural 1-sentence reaction to what the person just said. Be encouraging and conversational. Don't ask questions. Keep it under 15 words."},
                    {"role": "user", "content": f"They said: {answer}"}
                ],
                max_tokens=30,
                temperature=0.7
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Reaction error: {e}")
            return "That's interesting!"
    
    def generate_code_feedback(self, code):
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": """You are a technical interviewer reviewing code written under time pressure.
                    
                    CRITICAL: Only comment on what you actually see in the code. Do not assume or hallucinate features that aren't there.
                    
                    If the code is incomplete or just a template with 'pass' or empty return:
                    - Acknowledge it's incomplete or not implemented
                    - Explain what would be needed to solve the Two Sum problem
                    - Suggest the optimal approach (hash map for O(n) time)
                    
                    If the code has an actual implementation:
                    - Analyze the specific approach used
                    - Discuss time and space complexity of THEIR solution
                    - Suggest optimizations if applicable
                    
                    IMPORTANT: For Big O notation, write it phonetically for text-to-speech:
                    - Write "O(n)" as "O of N"
                    - Write "O(n^2)" as "O of N squared"
                    - Write "O(log n)" as "O of log N"
                    - Write "O(1)" as "O of one"
                    
                    Be honest, constructive, and encouraging. Focus on algorithmic thinking.
                    Keep feedback under 150 words and conversational."""},
                    {"role": "user", "content": f"Review this Two Sum solution written under interview conditions:\n\n{code}"}
                ],
                max_tokens=300,
                temperature=0.7
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Feedback error: {e}")
            return "Unable to generate feedback at this time."
    
    def save_responses(self):
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"interview_responses_{timestamp}.json"
        
        output = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total_questions": len(self.responses),
            "responses": self.responses,
            "code_review": self.code_review
        }
        
        try:
            with open(filename, 'w') as f:
                json.dump(output, f, indent=2)
            return filename
        except Exception as e:
            print(f"Save error: {e}")
            return None


def generate_tts(text):
    """Generate TTS audio and return bytes"""
    try:
        audio_stream = elevenlabs_client.text_to_speech.convert(
            voice_id=VOICE_ID,
            text=text,
            model_id="eleven_turbo_v2_5",
            optimize_streaming_latency=4
        )
        # Collect audio bytes
        audio_bytes = b''.join(audio_stream)
        return audio_bytes
    except Exception as e:
        print(f"TTS error: {e}")
        return None


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)


@app.route('/api/start', methods=['POST'])
def start_interview():
    """Initialize a new interview session"""
    try:
        session_id = str(time.time())
        interview = InterviewSession(session_id)
        sessions[session_id] = interview
        print(f"Started new interview session: {session_id}")
        return jsonify({
            "session_id": session_id, 
            "status": "ready",
            "total_questions": len(interview.questions)
        })
    except Exception as e:
        print(f"Error starting interview: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/question/<session_id>', methods=['GET'])
def get_question(session_id):
    """Get the next question"""
    try:
        if session_id not in sessions:
            print(f"Error: Invalid session {session_id}")
            return jsonify({"error": "Invalid session"}), 400
        
        interview = sessions[session_id]
        question = interview.get_next_question()
        
        if question is None:
            print("All questions completed")
            return jsonify({"question": None, "completed": True})
        
        print(f"Sending question {interview.current_question_index}: {question}")
        
        return jsonify({
            "question": question,
            "question_number": interview.current_question_index,
            "has_audio": True,  # TTS will be generated on frontend
            "completed": False
        })
    except Exception as e:
        print(f"Error in get_question: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """Generate TTS audio for given text"""
    data = request.json
    text = data.get('text', '')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    audio_bytes = generate_tts(text)
    
    if audio_bytes:
        return audio_bytes, 200, {'Content-Type': 'audio/mpeg'}
    else:
        return jsonify({"error": "TTS generation failed"}), 500


@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    emit('connected', {'status': 'ready'})


@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")


@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    """Process incoming audio chunks for transcription"""
    session_id = data.get('session_id')
    audio_data = data.get('audio')
    
    if session_id not in sessions:
        emit('error', {'message': 'Invalid session'})
        return
    
    interview = sessions[session_id]
    
    try:
        # Convert array to bytes
        if isinstance(audio_data, list):
            # Convert list of integers to bytes
            import struct
            audio_bytes = struct.pack(f'{len(audio_data)}h', *audio_data)
        elif isinstance(audio_data, str):
            import base64
            audio_bytes = base64.b64decode(audio_data)
        else:
            audio_bytes = bytes(audio_data)
        
        # Validate audio data
        if len(audio_bytes) < 100:
            return  # Skip too-short chunks
        
        # Process audio with Vosk
        if interview.recognizer.AcceptWaveform(audio_bytes):
            result = json.loads(interview.recognizer.Result())
            text = result.get("text", "").strip()
            
            if text and len(text) > 2:
                print(f"[Vosk Final] {text}")
                interview.current_transcript += " " + text
                interview.last_speech_time = time.time()
                interview.is_speaking = True
                
                emit('transcription', {
                    'text': text,
                    'is_final': True,
                    'full_transcript': interview.current_transcript.strip()
                })
        
        # Check for silence (auto-submit)
        current_time = time.time()
        silence_duration = current_time - interview.last_speech_time
        
        if interview.is_speaking and not interview.answer_submitted and silence_duration > interview.silence_threshold:
            transcript = interview.current_transcript.strip()
            if len(transcript) >= interview.min_answer_length:
                print(f"[Auto-submit] Silence detected, submitting: {transcript}")
                
                # Mark as submitted to prevent duplicates
                interview.answer_submitted = True
                
                # Get current question info
                q_num = interview.current_question_index
                question = interview.questions[q_num - 1] if q_num > 0 else ""
                
                # Generate reaction
                reaction = interview.generate_reaction(transcript)
                
                # Store response
                interview.responses.append({
                    "question_number": q_num,
                    "question": question,
                    "answer": transcript,
                    "ai_reaction": reaction
                })
                
                # Reset for next question
                interview.current_transcript = ""
                interview.is_speaking = False
                
                # Notify client
                emit('auto_submit', {'answer': transcript})
                emit('reaction', {
                    'reaction': reaction,
                    'has_audio': True
                })
                
    except Exception as e:
        print(f"Audio processing error: {e}")
        # Don't emit error for every chunk, just log it


@socketio.on('submit_answer')
def handle_submit_answer(data):
    """Submit answer and get AI reaction (deprecated - now using auto-submit)"""
    session_id = data.get('session_id')
    answer = data.get('answer', '').strip()
    question_number = data.get('question_number')
    question = data.get('question')
    
    if session_id not in sessions:
        emit('error', {'message': 'Invalid session'})
        return
    
    interview = sessions[session_id]
    
    if not answer or len(answer) < interview.min_answer_length:
        emit('error', {'message': 'Answer too short'})
        return
    
    # Generate reaction
    reaction = interview.generate_reaction(answer)
    
    # Store response
    interview.responses.append({
        "question_number": question_number,
        "question": question,
        "answer": answer,
        "ai_reaction": reaction
    })
    
    # Reset transcript for next question
    interview.current_transcript = ""
    interview.is_speaking = False
    
    emit('reaction', {
        'reaction': reaction,
        'has_audio': True
    })


@app.route('/api/code_review', methods=['POST'])
def code_review():
    """Submit code for review"""
    data = request.json
    session_id = data.get('session_id')
    code = data.get('code', '')
    
    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400
    
    if not code:
        return jsonify({"error": "No code provided"}), 400
    
    interview = sessions[session_id]
    
    # Generate feedback
    feedback = interview.generate_code_feedback(code)
    
    # Store code review
    interview.code_review = {
        "code_source": "web_submission",
        "code": code,
        "feedback": feedback
    }
    
    # Generate TTS for feedback
    audio_bytes = generate_tts(feedback)
    
    return jsonify({
        "feedback": feedback,
        "has_audio": audio_bytes is not None
    })


@app.route('/api/save/<session_id>', methods=['POST'])
def save_session(session_id):
    """Save interview responses to file"""
    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400
    
    interview = sessions[session_id]
    filename = interview.save_responses()
    
    if filename:
        return jsonify({"filename": filename, "status": "saved"})
    else:
        return jsonify({"error": "Failed to save"}), 500


@app.route('/api/segment_feedback', methods=['POST'])
def segment_feedback():
    """Generate AI feedback for a code segment"""
    try:
        data = request.json
        code = data.get('code', '')
        segment_index = data.get('segment_index', 0)
        total_segments = data.get('total_segments', 1)
        language = data.get('language', 'python')
        
        if not code:
            return jsonify({"feedback": "No code provided for this segment."}), 200
        
        # Generate AI feedback for this specific segment
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": """You are a code reviewer providing specific feedback on a code segment.
                
                Analyze ONLY the provided code segment and give specific, actionable feedback:
                - What does this segment do?
                - Is the logic correct?
                - Are there any issues or improvements?
                - How does it contribute to solving the problem?
                
                Be specific to the actual code shown. Keep feedback under 60 words."""},
                {"role": "user", "content": f"Review this code segment ({segment_index + 1} of {total_segments}) from a Two Sum solution:\n\n{code}"}
            ],
            max_tokens=150,
            temperature=0.7
        )
        
        feedback = response.choices[0].message.content.strip()
        return jsonify({"feedback": feedback})
        
    except Exception as e:
        print(f"Segment feedback error: {e}")
        return jsonify({"feedback": "Unable to generate feedback for this segment."}), 500


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
