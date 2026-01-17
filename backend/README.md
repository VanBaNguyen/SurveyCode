# Real-time Speech-to-Text

A Python program that captures audio from your microphone and converts speech to text in real-time using Faster-Whisper.

## Installation

### macOS
```bash
# Install PortAudio (required for PyAudio)
brew install portaudio

# Install Python dependencies
pip install -r requirements.txt
```

### Linux
```bash
# Install PortAudio
sudo apt-get install portaudio19-dev python3-pyaudio

# Install Python dependencies
pip install -r requirements.txt
```

### Windows
```bash
# Install Python dependencies
pip install -r requirements.txt
```

## Usage

Run the program:
```bash
python speech_to_text.py
```

The program will:
1. Load the Faster-Whisper model (first run downloads the model)
2. Start listening to your microphone
3. Display transcribed text every 3 seconds
4. Press `Ctrl+C` to stop

## Model Sizes

You can change the model size in the code for different accuracy/speed tradeoffs:
- `tiny` - Fastest, least accurate (~75MB)
- `base` - Good balance (default, ~145MB)
- `small` - Better accuracy, slower (~488MB)
- `medium` - High accuracy, much slower (~1.5GB)
- `large-v2` - Best accuracy, very slow (~3GB)
