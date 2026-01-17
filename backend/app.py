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
                    {"role": "system", "content": """You are a technical interviewer reviewing code written under time pressure and strict circumstances.
                    
                    Focus on:
                    1. Overall approach and logic
                    2. Algorithm correctness (does the logic make sense?)
                    3. Time and space complexity analysis
                    4. Potential optimizations
                    5. Problem-solving approach
                    
                    Be lenient about:
                    - Minor syntax errors (they're coding under pressure)
                    - Missing semicolons, brackets, or small typos
                    - Variable naming inconsistencies
                    
                    Be encouraging and constructive. Focus on the algorithmic thinking rather than perfect syntax.
                    Keep your feedback conversational and under 200 words."""},
                    {"role": "user", "content": f"Please review this code written under interview conditions:\n\n{code}"}
                ],
                max_tokens=400,
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
    session_id = str(time.time())
    sessions[session_id] = InterviewSession(session_id)
    return jsonify({"session_id": session_id, "status": "ready"})


@app.route('/api/question/<session_id>', methods=['GET'])
def get_question(session_id):
    """Get the next question"""
    if session_id not in sessions:
        return jsonify({"error": "Invalid session"}), 400
    
    interview = sessions[session_id]
    question = interview.get_next_question()
    
    if question is None:
        return jsonify({"question": None, "completed": True})
    
    # Generate TTS for question
    audio_bytes = generate_tts(question)
    
    return jsonify({
        "question": question,
        "question_number": interview.current_question_index,
        "has_audio": audio_bytes is not None,
        "completed": False
    })


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
        # Convert bytes to proper format for Vosk
        if isinstance(audio_data, str):
            # If it's base64 encoded
            import base64
            audio_bytes = base64.b64decode(audio_data)
        else:
            # If it's already bytes
            audio_bytes = bytes(audio_data)
        
        # Process audio with Vosk
        if interview.recognizer.AcceptWaveform(audio_bytes):
            result = json.loads(interview.recognizer.Result())
            text = result.get("text", "").strip()
            
            print(f"[Vosk Final] {text}")  # Debug log
            
            if text and len(text) > 2:
                interview.current_transcript += " " + text
                emit('transcription', {
                    'text': text,
                    'is_final': True,
                    'full_transcript': interview.current_transcript.strip()
                })
        else:
            partial = json.loads(interview.recognizer.PartialResult())
            text = partial.get("partial", "").strip()
            
            if text and len(text) > 2:
                print(f"[Vosk Partial] {text}")  # Debug log
                emit('transcription', {
                    'text': text,
                    'is_final': False,
                    'full_transcript': interview.current_transcript.strip()
                })
    except Exception as e:
        print(f"Audio processing error: {e}")
        emit('error', {'message': f'Audio processing error: {str(e)}'})


@socketio.on('submit_answer')
def handle_submit_answer(data):
    """Submit answer and get AI reaction"""
    session_id = data.get('session_id')
    answer = data.get('answer', '').strip()
    question_number = data.get('question_number')
    question = data.get('question')
    
    if session_id not in sessions:
        emit('error', {'message': 'Invalid session'})
        return
    
    interview = sessions[session_id]
    
    if not answer or len(answer) < 10:
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
    
    # Generate TTS for reaction
    audio_bytes = generate_tts(reaction)
    
    emit('reaction', {
        'reaction': reaction,
        'has_audio': audio_bytes is not None
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


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
