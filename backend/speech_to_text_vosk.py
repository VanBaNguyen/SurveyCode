#!/usr/bin/env python3
"""
Real-time Speech-to-Text Converter using Vosk (Low Latency)
Captures audio from microphone and converts speech to text with minimal delay
Vosk is much faster than Whisper for real-time applications
"""

import pyaudio
import json
from vosk import Model, KaldiRecognizer
import sys


class RealtimeSpeechToText:
    def __init__(self, model_path="model"):
        """
        Initialize Vosk speech recognition
        
        Args:
            model_path: Path to Vosk model directory
                       Download from: https://alphacephei.com/vosk/models
                       Recommended: vosk-model-en-us-0.22 (1.8GB, better accuracy)
                       Or: vosk-model-small-en-us-0.15 (40MB, faster but less accurate)
        """
        print(f"Loading Vosk model from '{model_path}'...")
        try:
            self.model = Model(model_path)
            print("Model loaded!\n")
        except Exception as e:
            print(f"Error loading model: {e}")
            print("\nPlease download a Vosk model:")
            print("1. Visit: https://alphacephei.com/vosk/models")
            print("2. Download 'vosk-model-en-us-0.22' (1.8GB, better accuracy)")
            print("   Or: 'vosk-model-small-en-us-0.15' (40MB, faster)")
            print("3. Extract to 'backend/model/' directory")
            sys.exit(1)
        
        # Audio settings
        self.CHUNK = 4000
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 16000
        
        self.pyaudio = pyaudio.PyAudio()
        self.recognizer = KaldiRecognizer(self.model, self.RATE)
        self.recognizer.SetWords(True)
    
    def start(self):
        """Start listening and processing speech in real-time"""
        stream = self.pyaudio.open(
            format=self.FORMAT,
            channels=self.CHANNELS,
            rate=self.RATE,
            input=True,
            frames_per_buffer=self.CHUNK
        )
        
        print("Listening... (Press Ctrl+C to stop)\n")
        
        try:
            while True:
                data = stream.read(self.CHUNK, exception_on_overflow=False)
                
                if self.recognizer.AcceptWaveform(data):
                    # Final result (end of phrase)
                    result = json.loads(self.recognizer.Result())
                    text = result.get("text", "")
                    if text:
                        print(f"You said: {text}")
                        sys.stdout.flush()
                else:
                    # Partial result (real-time, as you speak)
                    partial = json.loads(self.recognizer.PartialResult())
                    text = partial.get("partial", "")
                    if text:
                        # Print partial results on same line
                        print(f"\rListening: {text}", end="", flush=True)
                        
        except KeyboardInterrupt:
            print("\n\nStopping...")
        finally:
            stream.stop_stream()
            stream.close()
            self.pyaudio.terminate()
            print("Stopped.")


if __name__ == "__main__":
    # You can specify a different model path if needed
    # For better accuracy, use: vosk-model-en-us-0.22 (1.8GB)
    # For faster speed, use: vosk-model-small-en-us-0.15 (40MB)
    stt = RealtimeSpeechToText(model_path="model")
    stt.start()
