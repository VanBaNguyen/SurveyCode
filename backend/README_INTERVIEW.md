# AI Voice Interview System

An AI-powered voice interview system that:
- Asks questions using OpenAI GPT-4o-mini
- Listens to your spoken answers using Vosk
- Detects when you're done speaking (silence detection)
- Generates follow-up questions based on your answers
- Stores all responses

## How It Works

1. **AI generates a question** using OpenAI's fast GPT-4o-mini model
2. **You speak your answer** into the microphone
3. **System transcribes in real-time** using Vosk
4. **Silence detection** (1.5 seconds) determines when you're done
5. **AI generates next question** based on your previous answers
6. Repeat for N questions

## Installation

### 1. Install Dependencies

```bash
pip install -r requirements_interview.txt
```

### 2. Download Vosk Model

```bash
cd backend
curl -O https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
unzip vosk-model-en-us-0.22.zip
mv vosk-model-en-us-0.22 model
```

### 3. Set Up OpenAI API Key

Create a `.env` file in the `backend/` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=sk-your-key-here
```

Get your API key from: https://platform.openai.com/api-keys

## Usage

```bash
python ai_interview.py
```

The system will:
1. Ask you a question
2. Listen for your answer
3. Detect when you stop speaking (1.5 seconds of silence)
4. Generate the next question based on your answer
5. Repeat for 5 questions (configurable)

## Configuration

Edit `ai_interview.py` to customize:

```python
# Number of questions
interviewer.run_interview(num_questions=5)

# Silence threshold (seconds)
self.SILENCE_THRESHOLD = 1.5

# OpenAI model
model="gpt-4o-mini"  # Fast and cheap
# or
model="gpt-4o"  # More intelligent but slower/expensive
```

## Features

- **Real-time transcription**: See your words appear as you speak
- **Silence detection**: Automatically knows when you're done
- **Context-aware questions**: AI builds on your previous answers
- **Interview summary**: See all Q&A at the end
- **Fast responses**: Uses GPT-4o-mini for quick question generation

## Tips for Best Results

1. **Speak clearly** in a quiet environment
2. **Pause naturally** between thoughts
3. **Wait 1.5 seconds** after finishing to trigger next question
4. **Press Ctrl+C** to stop anytime
5. Use a **good microphone** for better accuracy

## Silence Detection

The system considers you "done speaking" when:
- You've said something (not just silence from the start)
- 1.5 seconds of silence has passed
- This allows natural pauses without cutting you off

Adjust `SILENCE_THRESHOLD` if needed:
- Lower (1.0s) = faster transitions, might cut you off
- Higher (2.5s) = more patient, slower transitions

## Cost

Using GPT-4o-mini:
- ~$0.00015 per question (very cheap)
- 100 questions ≈ $0.015

## Next Steps

To add ElevenLabs voice output:
1. Install `elevenlabs` package
2. Add voice synthesis after question generation
3. Play audio before listening for answer
