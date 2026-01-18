# SurveyCode

A platform that combines coding assessments with voice-based surveys to provide instant, personalized feedback to candidates.

## Overview

SurveyCode streamlines the online assessment experience by integrating a conversational AI survey directly into the submission flow. After completing a coding challenge, candidates participate in a brief voice survey where they answer questions. This allows us to provide immediate, contextual feedback on their code while gathering valuable survey data seamlessly.

## Key Features

- Real-time coding environment with multiple language support (Python, JavaScript, Java, C++)
- Voice-based conversational interview using speech-to-text
- AI-generated reactions and follow-up questions
- Instant technical feedback based on code submission and interview responses
- Seamless user experience from code submission to feedback

## Installation

### Prerequisites

- Python 3.8+ (Python 13+ had issues for us)
- Node.js (for frontend development)
- OpenAI API key
- ElevenLabs API key
- Vosk speech recognition model

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Download the Vosk model:
   - Visit https://alphacephei.com/vosk/models
   - Download `vosk-model-en-us-0.22` (1.8GB, recommended for better accuracy)
   - Extract the model to `backend/model/` directory
   - The final path should be `backend/model/am/`, `backend/model/conf/`, etc.

5. Create a `.env` file in the backend directory with your API keys:
```
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API=your_elevenlabs_api_key_here
```

6. Start the backend server:
```bash
python app.py
```

The backend will run on `http://localhost:5001`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Open `index.html` in a web browser or use a local server:
```bash
python -m http.server 8000
```

3. Access the application at `http://localhost:8000`

## Usage

1. Start on the landing page and accept the consent agreement
2. Complete the coding challenge within the time limit
3. Submit your solution to proceed to the voice interview
4. Answer survey questions by speaking into your microphone
5. Receive instant feedback on your code and approach

## Technology Stack

- Frontend: HTML, CSS, JavaScript, CodeMirror
- Backend: Python, Flask, Socket.IO
- AI: OpenAI GPT-4, Whisper (speech-to-text)
- Text-to-Speech: ElevenLabs
- Speech Recognition: Vosk (offline speech-to-text)