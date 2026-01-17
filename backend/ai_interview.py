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
from concurrent.futures import ThreadPoolExecutor
import threading

load_dotenv()


class AIInterviewer:
    def __init__(self, model_path="model", questions_file="interview_questions.json"):
        # Initialize OpenAI
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Initialize ElevenLabs
        self.elevenlabs = ElevenLabs(api_key=os.getenv("ELEVENLABS_API"))
        self.voice_id = "hzLyDn3IrvrdH83BdqUu"
        
        # Load questions
        self.questions = self.load_questions(questions_file)
        self.current_question_index = 0
        
        # Thread pool for parallel processing
        self.executor = ThreadPoolExecutor(max_workers=2)
        
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
        self.SILENCE_THRESHOLD = 1.8  # seconds of silence to consider answer complete (reduced from 2.5)
        self.MIN_ANSWER_LENGTH = 10  # minimum characters for a valid answer
        self.last_speech_time = time.time()
        
        self.pyaudio = pyaudio.PyAudio()
        self.recognizer = KaldiRecognizer(self.vosk_model, self.RATE)
        self.recognizer.SetWords(True)
        
        # Interview state
        self.conversation_history = []
        self.responses = []
    
    def load_questions(self, questions_file):
        """Load questions from JSON file"""
        try:
            with open(questions_file, 'r') as f:
                data = json.load(f)
                return data.get("questions", [])
        except FileNotFoundError:
            print(f"⚠️  Questions file '{questions_file}' not found!")
            print("Using default questions...")
            return [
                "Can you tell me a little about yourself?",
                "What are you currently working on?",
                "What are your main interests?",
                "What's a recent accomplishment you're proud of?",
                "Where do you see yourself in the future?"
            ]
    
    def get_next_question(self):
        """Get the next hardcoded question"""
        if self.current_question_index < len(self.questions):
            question = self.questions[self.current_question_index]
            self.current_question_index += 1
            return question
        return None
    
    def generate_reaction(self, answer):
        """Generate a brief AI reaction to the user's answer"""
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a friendly interviewer. Give a brief, natural 1-sentence reaction to what the person just said. Be encouraging and conversational. Don't ask questions. Keep it under 15 words."},
                    {"role": "user", "content": f"They said: {answer}"}
                ],
                max_tokens=30,  # Reduced from 50 for faster generation
                temperature=0.7
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"⚠️  Reaction generation error: {e}")
            return "That's interesting!"
        
    def speak(self, text):
        """Use ElevenLabs to speak text with streaming for lower latency"""
        try:
            # Use streaming for faster playback start
            audio_stream = self.elevenlabs.text_to_speech.convert(
                voice_id=self.voice_id,
                text=text,
                model_id="eleven_turbo_v2_5",  # Turbo model for lower latency
                optimize_streaming_latency=4  # Max optimization (0-4)
            )
            stream(audio_stream)
        except Exception as e:
            print(f"⚠️  TTS Error: {e}")
    
    def save_responses(self, filename="interview_responses.json"):
        """Save interview responses to JSON file"""
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"interview_responses_{timestamp}.json"
        
        output = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total_questions": len(self.responses),
            "responses": self.responses
        }
        
        try:
            with open(filename, 'w') as f:
                json.dump(output, f, indent=2)
            print(f"\n💾 Responses saved to: {filename}")
        except Exception as e:
            print(f"⚠️  Error saving responses: {e}")
    
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
    
    def run_interview(self):
        """Run the interview session"""
        print("=" * 60)
        print("AI VOICE INTERVIEW")
        print("=" * 60)
        print("\nInstructions:")
        print("- The AI will ask you questions")
        print("- Speak your answer clearly")
        print("- System detects when you're done (1.8s silence)")
        print("- Minimum 10 characters for valid answer")
        print("- Press Ctrl+C to stop anytime\n")
        print("=" * 60)
        
        time.sleep(2)
        
        try:
            while True:
                # Get next hardcoded question
                question = self.get_next_question()
                
                if question is None:
                    print("\n✓ All questions completed!")
                    break
                
                # Display and speak question
                q_num = self.current_question_index
                print(f"\n{'='*60}")
                print(f"🤖 Question {q_num}: {question}")
                print('='*60)
                
                self.speak(question)
                time.sleep(0.5)
                
                # Listen for answer
                answer = self.listen_for_answer()
                
                if answer is None:  # User interrupted
                    break
                
                if not answer or len(answer) < self.MIN_ANSWER_LENGTH:
                    print("⚠️  No clear answer detected, moving on...\n")
                    continue
                
                # Generate reaction and prepare TTS in parallel
                print("\n🤖 AI: Thinking...")
                
                # Start generating reaction immediately
                reaction_future = self.executor.submit(self.generate_reaction, answer)
                
                # Wait for reaction (this is fast with gpt-4o-mini)
                reaction = reaction_future.result()
                
                # Speak reaction immediately (streaming starts playback faster)
                print(f"💬 {reaction}\n")
                self.speak(reaction)
                
                # Store Q&A
                self.responses.append({
                    "question_number": q_num,
                    "question": question,
                    "answer": answer,
                    "ai_reaction": reaction
                })
                
                # Minimal pause before next question (reduced from 1.5s)
                time.sleep(0.8)
            
            # Save and show summary
            self.save_responses()
            self.show_summary()
            
        except KeyboardInterrupt:
            print("\n\n⚠️  Interview stopped")
            self.save_responses()
            self.show_summary()
        finally:
            self.executor.shutdown(wait=False)
            self.pyaudio.terminate()
    
    def show_summary(self):
        """Display interview summary"""
        print("\n" + "=" * 60)
        print("INTERVIEW SUMMARY")
        print("=" * 60)
        
        for qa in self.responses:
            print(f"\nQ{qa['question_number']}: {qa['question']}")
            print(f"A{qa['question_number']}: {qa['answer']}")
            print(f"AI: {qa['ai_reaction']}")
        
        print("\n" + "=" * 60)
        print(f"Total questions answered: {len(self.responses)}")
        print("=" * 60)


if __name__ == "__main__":
    interviewer = AIInterviewer(model_path="model", questions_file="interview_questions.json")
    interviewer.run_interview()
