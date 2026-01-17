#!/usr/bin/env python3
"""
Real-time Speech-to-Text Converter using Faster-Whisper
Captures audio from microphone and converts speech to text in real-time
"""

import pyaudio
from faster_whisper import WhisperModel
import numpy as np
import threading
import queue
import sys
import wave
import tempfile
import os


class RealtimeSpeechToText:
    def __init__(self, model_size="base"):
        print(f"Loading Faster-Whisper {model_size} model... (this may take a moment)")
        # Use CPU with int8 for better compatibility
        self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
        print("Model loaded!\n")
        
        # Audio settings - REDUCED for lower latency
        self.CHUNK = 1024
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 16000
        self.RECORD_SECONDS = 1  # Reduced from 3 to 1 second for lower latency
        
        self.audio_queue = queue.Queue()
        self.is_running = False
        self.pyaudio = pyaudio.PyAudio()
    
    def record_audio(self):
        """Continuously record audio in chunks"""
        stream = self.pyaudio.open(
            format=self.FORMAT,
            channels=self.CHANNELS,
            rate=self.RATE,
            input=True,
            frames_per_buffer=self.CHUNK
        )
        
        print("Listening... (Press Ctrl+C to stop)\n")
        
        while self.is_running:
            frames = []
            for _ in range(0, int(self.RATE / self.CHUNK * self.RECORD_SECONDS)):
                if not self.is_running:
                    break
                data = stream.read(self.CHUNK, exception_on_overflow=False)
                frames.append(data)
            
            if frames:
                audio_data = b''.join(frames)
                self.audio_queue.put(audio_data)
        
        stream.stop_stream()
        stream.close()
    
    def process_audio(self):
        """Process audio from queue and convert to text"""
        while self.is_running:
            try:
                audio_data = self.audio_queue.get(timeout=1)
                
                # Convert bytes to numpy array
                audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
                
                # Transcribe with Faster-Whisper
                # Use smaller beam_size for faster processing
                segments, info = self.model.transcribe(
                    audio_np, 
                    language="en", 
                    beam_size=1,  # Reduced from 5 to 1 for speed
                    vad_filter=True,  # Voice activity detection to skip silence
                    vad_parameters=dict(min_silence_duration_ms=500)
                )
                
                # Collect all segments
                text_parts = []
                for segment in segments:
                    text_parts.append(segment.text)
                
                text = "".join(text_parts).strip()
                
                if text:
                    print(f"You said: {text}")
                    sys.stdout.flush()
                    
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[Error: {e}]")
    
    def start(self):
        """Start listening and processing speech"""
        self.is_running = True
        
        # Start recording thread
        self.record_thread = threading.Thread(target=self.record_audio)
        self.record_thread.start()
        
        # Start processing thread
        self.process_thread = threading.Thread(target=self.process_audio)
        self.process_thread.start()
        
        try:
            # Keep main thread alive
            while True:
                pass
        except KeyboardInterrupt:
            print("\n\nStopping...")
            self.stop()
    
    def stop(self):
        """Stop listening and clean up"""
        self.is_running = False
        self.record_thread.join()
        self.process_thread.join()
        self.pyaudio.terminate()
        print("Stopped.")


if __name__ == "__main__":
    # Use "tiny" for lowest latency (fastest)
    # Use "base" for balance of speed and accuracy
    # Use "small", "medium", or "large-v2" for better accuracy but slower
    stt = RealtimeSpeechToText(model_size="base")  # Changed to "tiny" for lower latency
    stt.start()
