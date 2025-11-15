# BattleTech Video Generator

AI-powered video generator for creating cinematic BattleTech horror content with manual image upload, script generation, and professional effects.

## Features

- 🎬 **Manual Image Upload** - Upload your own images, app repeats them for full video
- 🎙️ **Audio Upload** - Use your own voiceover files (MP3/WAV)
- 📝 **Script Generation** - Groq AI generates 8k+ word BattleTech stories
- 🎨 **Prompt Extraction** - Extract image prompts from scripts for external generation
- 🎥 **Professional Effects** - Subtle zoom effects only, no movement
- ⚡ **Zero API Costs** - Manual mode requires no paid APIs

## Quick Start

### Installation

```bash
npm install
```

### Setup Dependencies

**Required:** FFmpeg for video processing
- Windows: Download from https://ffmpeg.org/
- Linux: `sudo apt install ffmpeg`
- macOS: `brew install ffmpeg`

### Environment Variables

Create `.env` file (use `.env.example` as template):

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required for script generation (FREE!)
GROQ_API_KEY=your_groq_api_key_here

# Optional - for additional features
GENAIPRO_JWT=your_genaipro_token_here
FAL_API_KEY=your_fal_api_key_here
STABILITY_API_KEY=your_stability_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

**Get API Keys:**
- Groq (FREE): https://console.groq.com/keys
- Fal.ai: https://fal.ai/dashboard
- Stability AI: https://platform.stability.ai/account/keys
- Google Gemini: https://console.cloud.google.com/

### Run Application

```bash
npm start
```

Visit: **http://localhost:3000/battletech-video-generator.html**

## Usage Modes

### 1. Manual Mode (Recommended - $0 cost)
1. Enter video title
2. Select "📁 Upload Images"
3. Upload 5-20 images
4. Select "🎙️ Upload Audio" and add MP3 file
5. Generate video (NO TEXT REQUIRED!)

### 2. Auto Generation Mode
1. Enter video title
2. Generate script with Groq (free)
3. Select AI image provider (requires credit)
4. Generate voiceover (requires credit)
5. Generate video

### 3. Prompt Extraction Mode
1. Generate script with Groq
2. Select "📝 Generate Prompts"
3. Extract image prompts from script
4. Copy prompts to external tools (Bing Creator, Leonardo.ai)
5. Upload generated images manually

## Project Structure

```
/
├── server.js                           # Express backend with API endpoints
├── battletech-video-generator.html     # Frontend application
├── package.json                        # Node.js dependencies
├── .env                                # Environment variables (NOT in git)
├── .env.example                        # Template for environment variables
├── .gitignore                          # Git ignore rules
├── CLAUDE.md                           # AI assistant documentation
├── README.md                           # This file
├── temp/                               # Generated videos (gitignored)
└── node_modules/                       # Dependencies (gitignored)
```

## API Endpoints

### Script Generation
- `POST /api/generate-script` - Generate BattleTech horror script with Groq AI
- `POST /api/extract-prompts` - Extract image prompts from script

### Image Generation
- `POST /api/generate/fal` - Generate images with Fal.ai Flux Schnell
- `POST /api/generate/stability` - Generate images with Stability AI
- `POST /api/generate/gemini` - Generate images with Google Gemini
- `POST /api/generate/pollinations` - Generate images with Pollinations.ai

### Video Creation
- `POST /api/parse-script` - Parse script and extract scenes
- `POST /api/generate-voiceover` - Generate voiceover with GenAIPro TTS
- `POST /api/create-video` - Create final video with effects and audio
- `POST /api/download-thumbnail` - Download and serve thumbnail images

### Health Check
- `GET /health` - Server health status

## Video Effects

- **ONLY ZOOM EFFECTS** - No movement/slide
- **Zoom range:** 1.0x to 1.03x (very subtle)
- **Smooth transitions** between images
- **Stable, professional look**

## Configuration

### Video Specifications
- **Resolution:** 1920x1080 (Full HD)
- **Codec:** H.264 (libx264)
- **Audio Codec:** AAC at 128kbps
- **Frame Rate:** 24 fps
- **Format:** MP4

### Environment Variables
All API keys are loaded from `.env` file:
- `GROQ_API_KEY` - Groq API for script generation (required)
- `GENAIPRO_JWT` - GenAIPro for TTS (optional)
- `FAL_API_KEY` - Fal.ai for image generation (optional)
- `STABILITY_API_KEY` - Stability AI for images (optional)
- `GEMINI_API_KEY` - Google Gemini for images (optional)
- `PORT` - Server port (default: 3000)

## Recent Fixes

✅ **Audio Detection Fixed** - No more TTS generation when audio uploaded
✅ **Movement Removed** - Only subtle zoom in/out effects
✅ **No Text Required** - Generate video with just images + audio
✅ **Manual Mode** - Complete $0 workflow
✅ **Secure API Keys** - All keys in environment variables

## Troubleshooting

**Server won't start:**
- Check if port 3000 is available
- Verify all dependencies installed: `npm install`
- Check `.env` file exists and has correct format

**Video generation fails:**
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check if audio file is properly uploaded
- Verify images are valid (JPEG/PNG)

**Image generation fails:**
- Check if API key is set in `.env`
- Verify API credits are available
- Try different provider if one is down

**Video too short:**
- Ensure uploaded audio file is detected properly
- Check browser console for audio duration detection

**Still generating TTS:**
- Make sure "Upload Audio" mode is selected
- Verify audio file is properly uploaded before clicking generate

## Development

### For AI Assistants
See `CLAUDE.md` for comprehensive documentation on:
- Codebase structure and conventions
- Development workflows
- Testing procedures
- Common tasks and troubleshooting

### Running in Development
```bash
npm run dev
```

### Testing
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test frontend access
curl -I http://localhost:3000/battletech-video-generator.html
```

## Contributing

This project uses:
- Node.js >= 16.0.0
- Express.js for backend
- Vanilla JavaScript for frontend
- FFmpeg for video processing

## License

MIT License - Use freely for personal and commercial projects.

## Credits

- Powered by Groq AI (Llama 3.3 70B)
- Image generation: Fal.ai, Stability AI, Google Gemini, Pollinations.ai
- TTS: GenAIPro (ElevenLabs)
- Video processing: FFmpeg

---

**Version:** 1.0.0
**Last Updated:** 2025-11-15
