#!/usr/bin/env python3
"""
AI Voice Interview System
Uses Vosk for speech-to-text and OpenAI for generating questions
Detects when user finishes speaking using silence detection
"""

import pyaudio
import json
from vosk import Model, KaldiRecognizer
import sys
import time
from openai import OpenAI
from dotenv import load_dotenv
import os
from elevenlabs.client import ElevenLabs
from elevenlabs import stream

load_dotenv()


class AIInterviewer:
    def __init__(self, model_path="model"):
        # Initialize OpenAI
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Initialize ElevenLabs
        self.elevenlabs = ElevenLabs(api_key=os.getenv("ELEVENLABS_API"))
        self.voice_id = "hzLyDn3IrvrdH83BdqUu"
        
        # Initialize Vosk
        print(f"Loading Vosk model from '{model_path}'...")
        try:
            self.vosk_model = Model(model_path)
            print("Model loaded!\n")
        except Exception as e:
            print(f"Error loading model: {e}")
            print("Please download vosk-model-en-us-0.22 and extract to 'model/' directory")
            sys.exit(1)
        
        # Audio settings
        self.CHUNK = 4000
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 16000
        
        # Silence detection settings
        self.SILENCE_THRESHOLD = 2.5  # seconds of silence to consider answer complete
        self.MIN_ANSWER_LENGTH = 10  # minimum characters for a valid answer
        self.last_speech_time = time.time()
        
        self.pyaudio = pyaudio.PyAudio()
        self.recognizer = KaldiRecognizer(self.vosk_model, self.RATE)
        self.recognizer.SetWords(True)
        
        # Interview state
        self.conversation_history = []
        self.responses = []
        
    def speak(self, text):
        """Use ElevenLabs to speak text"""
        try:
            audio = self.elevenlabs.text_to_speech.convert(
                voice_id=self.voice_id,
                text=text,
                model_id="eleven_monolingual_v1"
            )
            stream(audio)
        except Exception as e:
            print(f"⚠️  TTS Error: {e}")
    
    def ask_question(self, context=""):
        """Generate next question using OpenAI"""
        print("\n🤖 AI: Thinking...")
        
        # Build conversation context
        messages = [
            {"role": "system", "content": """You are a friendly AI interviewer conducting a casual conversation. 
            Ask one question at a time. Keep questions natural and conversational.
            Ask about the person's background, interests, goals, or experiences.
            Build on their previous answers."""}
        ]
        
        # Add conversation history
        for qa in self.responses:
            messages.append({"role": "assistant", "content": qa["question"]})
            messages.append({"role": "user", "content": qa["answer"]})
        
        # Generate next question
        response = self.client.chat.completions.create(
            model="gpt-4o-mini",  # Fast model
            messages=messages,
            max_tokens=100,
            temperature=0.7
        )
        
        question = response.choices[0].message.content.strip()
        return question
    
    def listen_for_answer(self):
        """Listen to user's answer and detect when they're done speaking"""
        stream = self.pyaudio.open(
            format=self.FORMAT,
            channels=self.CHANNELS,
            rate=self.RATE,
            input=True,
            frames_per_buffer=self.CHUNK
        )
        
        print("🎤 Listening... (speak your answer)\n")
        
        current_answer = ""
        self.last_speech_time = time.time()
        is_speaking = False
        last_partial = ""
        
        try:
            while True:
                data = stream.read(self.CHUNK, exception_on_overflow=False)
                
                if self.recognizer.AcceptWaveform(data):
                    # Final result (end of phrase)
                    result = json.loads(self.recognizer.Result())
                    text = result.get("text", "").strip()
                    
                    # Ignore very short words (likely noise)
                    if text and len(text) > 2:
                        current_answer += " " + text
                        print(f"   {text}")
                        self.last_speech_time = time.time()
                        is_speaking = True
                        last_partial = ""
                else:
                    # Partial result
                    partial = json.loads(self.recognizer.PartialResult())
                    text = partial.get("partial", "").strip()
                    
                    # Only update if partial is meaningful and different
                    if text and len(text) > 2 and text != last_partial:
                        self.last_speech_time = time.time()
                        is_speaking = True
                        last_partial = text
                        print(f"\r💬 {text}...", end="", flush=True)
                
                # Check for silence (user finished speaking)
                silence_duration = time.time() - self.last_speech_time
                
                if is_speaking and silence_duration > self.SILENCE_THRESHOLD:
                    if len(current_answer.strip()) >= self.MIN_ANSWER_LENGTH:
                        print("\n\n✓ Answer recorded")
                        break
                    
        except KeyboardInterrupt:
            print("\n\n⚠️  Interview stopped by user")
            return None
        finally:
            stream.stop_stream()
            stream.close()
        
        return current_answer.strip()
    
    def run_interview(self, num_questions=5):
        """Run the interview session"""
        print("=" * 60)
        print("AI VOICE INTERVIEW")
        print("=" * 60)
        print("\nInstructions:")
        print("- The AI will ask you questions")
        print("- Speak your answer clearly")
        print("- System detects when you're done (2.5s silence)")
        print("- Minimum 10 characters for valid answer")
        print("- Press Ctrl+C to stop anytime\n")
        print("=" * 60)
        
        time.sleep(2)
        
        try:
            for i in range(num_questions):
                # Generate question
                question = self.ask_question()
                print(f"\n{'='*60}")
                print(f"🤖 Question {i+1}: {question}")
                print('='*60)
                
                # Speak the question
                self.speak(question)
                
                # Wait a moment before listening
                time.sleep(0.5)
                
                # Listen for answer
                answer = self.listen_for_answer()
                
                if answer is None:  # User interrupted
                    break
                
                if not answer or len(answer) < self.MIN_ANSWER_LENGTH:
                    print("⚠️  No clear answer detected, moving on...\n")
                    continue
                
                # Store Q&A
                self.responses.append({
                    "question": question,
                    "answer": answer
                })
                
                # Brief pause before next question
                time.sleep(1)
            
            # Show summary
            self.show_summary()
            
        except KeyboardInterrupt:
            print("\n\nInterview stopped")
            self.show_summary()
        finally:
            self.pyaudio.terminate()
    
    def show_summary(self):
        """Display interview summary"""
        print("\n" + "=" * 60)
        print("INTERVIEW SUMMARY")
        print("=" * 60)
        
        for i, qa in enumerate(self.responses, 1):
            print(f"\nQ{i}: {qa['question']}")
            print(f"A{i}: {qa['answer']}")
        
        print("\n" + "=" * 60)
        print(f"Total questions answered: {len(self.responses)}")
        print("=" * 60)


if __name__ == "__main__":
    interviewer = AIInterviewer(model_path="model")
    interviewer.run_interview(num_questions=5)
