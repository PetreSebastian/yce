# 😴 Boring Facts - Pokémon Video Generator

**Complete AI-powered video generator** for creating sleep-inducing Pokémon fact videos with automated script writing, image generation, voiceover, and video editing.

---

## ✨ Features

- 🎬 **Fully Automated**: Script → Images → Voice → Description → Tags → Video
- 📝 **AI Script Generation**: Up to 10,000 words using Groq LLaMA 3.3
- 🎨 **FREE Image Generation**: Pollinations.ai (FLUX model, no API key!)
- 🎙️ **Professional Voiceover**: ElevenLabs or OpenAI TTS
- 📋 **YouTube SEO**: Auto-generated descriptions and tags
- 🎥 **Video Editing**: FFmpeg-powered with Ken Burns effects

---

## 🔧 Prerequisites

### 1. **Node.js** (v14 or higher)
Download: https://nodejs.org/

### 2. **FFmpeg** (for video creation)

**Windows:**
1. Download: https://ffmpeg.org/download.html
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to System PATH

**Mac:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt update
sudo apt install ffmpeg
```

Verify installation:
```bash
ffmpeg -version
```

---

## 🚀 Quick Start

### 1. Clone/Download the Project
```bash
git clone <your-repo-url>
cd yce
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Get API Keys

#### **Required:**

**Groq API** (FREE - for script generation)
- Sign up: https://console.groq.com/
- Go to: https://console.groq.com/keys
- Create API key
- Copy your key

**ElevenLabs API** (FREE tier available - for voiceover)
- Sign up: https://elevenlabs.io/
- Go to: https://elevenlabs.io/app/speech-synthesis
- Click your profile → API Keys
- Copy your API key
- Free tier: 10,000 characters/month

#### **Optional:**

**OpenAI API** (alternative for voiceover)
- Sign up: https://platform.openai.com/
- Get key: https://platform.openai.com/api-keys
- TTS costs: ~$0.015 per 1,000 characters

### 4. Configure Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your favorite text editor
notepad .env   # Windows
nano .env      # Linux/Mac
```

Add your API keys:
```env
GROQ_API_KEY=gsk_your_actual_groq_key_here
ELEVENLABS_API_KEY=your_actual_elevenlabs_key_here
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB
PORT=3000
```

### 5. Start the Server
```bash
npm start
```

You should see:
```
😴 BORING FACTS - POKÉMON VIDEO GENERATOR 😴
🌐 Server: http://localhost:3000
✅ Health: http://localhost:3000/health

API Status:
  - Groq (Script): ✅
  - ElevenLabs (Voice): ✅

Ready!
```

### 6. Open the App
Open your browser and go to:
```
http://localhost:3000/pokemon.html
```

---

## 📖 Usage

1. **Enter Video Title**: e.g., "The Secret Origins of Mewtwo"
2. **Set Word Count**: 500 - 10,000 words (default: 2,000)
3. **Set Image Count**: 5 - 20 images (default: 10)
4. **Click "GENERATE COMPLETE VIDEO"**
5. **Wait ~5 minutes** for complete automation
6. **Download your video!**

---

## 🛠️ Troubleshooting

### ❌ "Script generation failed"
- Check your `GROQ_API_KEY` in `.env`
- Verify key at: https://console.groq.com/keys
- Check Groq status: https://status.groq.com/

### ❌ "Voice generation failed"
- Check `ELEVENLABS_API_KEY` in `.env`
- Verify you have characters remaining (10k free/month)
- Check ElevenLabs dashboard: https://elevenlabs.io/app/usage

### ❌ "No images were generated"
- Pollinations.ai is FREE and doesn't require API keys
- Check your internet connection
- Try reducing image count

### ❌ "Video creation failed"
- Verify FFmpeg is installed: `ffmpeg -version`
- Check that images and audio were generated
- Ensure you have at least 5 images

### ❌ Server won't start
```bash
# Check if port 3000 is in use
# Windows:
netstat -ano | findstr :3000

# Mac/Linux:
lsof -i :3000

# Use different port in .env:
PORT=3001
```

---

## 💰 Cost Breakdown

| Service | Purpose | Cost |
|---------|---------|------|
| **Pollinations.ai** | Image generation | ✅ **100% FREE** |
| **Groq** | Script generation | ✅ **FREE** (generous limits) |
| **ElevenLabs** | Voiceover | ⚠️ 10,000 chars/month FREE |
| **OpenAI TTS** | Voiceover (alternative) | 💵 ~$0.015 per 1,000 chars |

**Example video cost:**
- 2,000-word script (~12,000 characters)
- ElevenLabs free tier: **$0.00** ✅
- OpenAI TTS: **~$0.18** per video

---

## 🎨 Customization

### Change Voice (ElevenLabs)

1. Go to: https://elevenlabs.io/app/voice-library
2. Choose a voice
3. Copy the Voice ID
4. Update `.env`:
```env
ELEVENLABS_VOICE_ID=your_new_voice_id_here
```

**Recommended voices for sleep content:**
- `pNInz6obpgDQGcFmaJgB` - Adam (default, deep & calm)
- `21m00Tcm4TlvDq8ikWAM` - Rachel (soft female)
- `TxGEqnHWrfWFTfGW9XjX` - Josh (warm male)

### Adjust Video Quality

Edit `server.js` line ~685:
```javascript
// Current: Fast encoding, lower quality
'-preset', 'ultrafast',
'-crf', '28',

// Change to: Slower encoding, higher quality
'-preset', 'medium',
'-crf', '23',
```

### Change Image Model

Images use Pollinations.ai FLUX model (free). To try different models, edit `server.js` line ~210:
```javascript
const imageUrl = `${POLLINATIONS_API_URL}/${encodedPrompt}?width=1920&height=1080&model=flux&seed=${Date.now() + i}&nologo=true`;

// Available models: flux, flux-realism, flux-anime, flux-3d, turbo
```

---

## 📁 Project Structure

```
yce/
├── server.js              # Express server (API endpoints)
├── pokemon.html           # Web interface
├── package.json           # Dependencies
├── .env                   # Your API keys (create this!)
├── .env.example           # Example environment file
├── README.md              # This file
└── temp/                  # Generated files (auto-created)
    ├── uploads/           # Images & audio
    └── session_*/         # Video rendering temp files
```

---

## 🔒 Security Notes

- **Never commit `.env`** to version control
- `.env` contains your API keys (keep it secret!)
- Use `.env.example` for sharing configuration structure
- Rotate API keys if accidentally exposed

---

## 🎥 What Gets Generated?

For a 2,000-word video about "The Secret Origins of Mewtwo":

1. **Script**: ~2,000 words of sleep-inducing Pokémon facts
2. **Images**: 10 high-quality FLUX-generated images (1920x1080)
3. **Voiceover**: Professional AI narration (~3-5 minutes)
4. **Description**: 150-200 word YouTube description with SEO
5. **Tags**: 15-20 relevant tags (Pokemon, ASMR, sleep, etc.)
6. **Video**: Final MP4 with Ken Burns effects, audio sync

**Total time**: ~5 minutes
**Video quality**: 1080p, H.264, AAC audio

---

## 🤝 Support

**Issues with APIs:**
- Groq: https://console.groq.com/docs
- ElevenLabs: https://elevenlabs.io/docs
- OpenAI: https://platform.openai.com/docs

**FFmpeg Help:**
- Documentation: https://ffmpeg.org/documentation.html
- Installation: https://ffmpeg.org/download.html

---

## 📝 License

MIT License - feel free to modify and use for your projects!

---

## 🎉 Quick Test

Test your setup:

```bash
# 1. Start server
npm start

# 2. Open browser
http://localhost:3000/health

# You should see:
# {"status":"OK","message":"Boring Facts Pokémon Video Generator is running!"}

# 3. Generate a short test video:
# - Title: "Test Video"
# - Word Count: 500
# - Images: 5
# - Click Generate
```

---

**Happy video creating! 😴✨**
