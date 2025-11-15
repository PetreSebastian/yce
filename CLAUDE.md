# CLAUDE.md - AI Assistant Guide for BattleTech Video Generator

This document provides comprehensive guidance for AI assistants (like Claude) working on the BattleTech Video Generator codebase.

## Project Overview

**BattleTech Video Generator** is an AI-powered video generator for creating cinematic BattleTech horror content. The application supports manual image upload, script generation, and professional video effects with zero API costs when using manual mode.

### Core Technology Stack
- **Backend:** Node.js with Express.js
- **Frontend:** HTML/JavaScript (Single-page application)
- **Video Processing:** FFmpeg
- **AI Services:**
  - Groq API (script generation - free tier available)
  - GenAI Pro (optional, for automated image/audio generation)

## Repository Structure

### Expected File Layout
```
/
├── server.js                           # Express backend with API endpoints
├── battletech-video-generator.html     # Frontend SPA
├── package.json                        # Node.js dependencies
├── claude-code-package.json            # Alternative package.json (rename if needed)
├── claude-code-readme.md               # Alternative README (rename if needed)
├── .env                                # Environment variables (NOT in git)
├── .gitignore                          # Git ignore rules
├── uploads/                            # User-uploaded images/audio (gitignored)
├── outputs/                            # Generated videos (gitignored)
└── CLAUDE.md                          # This file
```

### Key Files

#### `server.js`
The main Express backend that handles:
- Static file serving
- API endpoints for script generation
- Image and audio file uploads
- Video generation coordination
- FFmpeg integration for video processing

**Critical Functions to Understand:**
- Script generation endpoint (uses Groq API)
- Image upload handling (multipart/form-data)
- Audio upload handling (MP3/WAV support)
- Video composition with FFmpeg
- Prompt extraction from scripts

#### `battletech-video-generator.html`
Single-page frontend application featuring:
- Three operational modes (Manual, Auto, Prompt Extraction)
- File upload interfaces
- Real-time progress tracking
- Video preview and download

**Key UI Components:**
- Image upload widget (supports 5-20 images)
- Audio upload widget (MP3/WAV)
- Script generation form
- Video generation controls
- Progress indicators

#### `package.json`
Node.js dependencies and scripts. Expected dependencies:
- `express` - Web server framework
- `multer` - File upload handling
- `dotenv` - Environment variable management
- `axios` or `node-fetch` - HTTP client for API calls
- Various FFmpeg-related packages

## Development Workflows

### Initial Setup
1. **Install dependencies:** `npm install`
2. **Install FFmpeg:**
   - Windows: Download from https://ffmpeg.org/
   - Linux: `sudo apt install ffmpeg`
   - macOS: `brew install ffmpeg`
3. **Configure environment variables** in `.env`:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   GENAIPRO_JWT=your_genaipro_token_here  # Optional
   PORT=3000  # Default port
   ```
4. **Start server:** `npm start`
5. **Access app:** http://localhost:3000

### Testing Workflow
When making changes, test all three modes:

1. **Manual Mode (Priority - $0 cost):**
   - Upload 5-20 images
   - Upload audio file (MP3)
   - Generate video WITHOUT requiring text input
   - Verify audio detection prevents TTS generation
   - Check video uses only subtle zoom effects (1.0x to 1.03x)

2. **Auto Generation Mode:**
   - Generate script with Groq
   - Test AI image generation (if credits available)
   - Test voiceover generation
   - Complete video generation

3. **Prompt Extraction Mode:**
   - Generate script
   - Extract image prompts
   - Verify prompts are suitable for external tools

### Common Development Tasks

#### Adding New Features
1. **Backend changes:** Modify `server.js`
   - Add new endpoints under existing route structure
   - Follow Express.js patterns
   - Handle errors gracefully with try-catch
   - Return consistent JSON responses

2. **Frontend changes:** Modify `battletech-video-generator.html`
   - Maintain single-page app structure
   - Use fetch API for backend communication
   - Update UI with progress indicators
   - Handle errors with user-friendly messages

#### Fixing Bugs
Recent critical fixes serve as examples:
- ✅ Audio detection fix: Prevent TTS when audio uploaded
- ✅ Movement removal: Only use zoom effects, no slide/pan
- ✅ Text requirement: Allow video generation with just images + audio

**Bug Fix Process:**
1. Identify the issue in server.js or HTML file
2. Test the fix in manual mode first
3. Verify no regression in other modes
4. Update this document if workflow changes

## Key Conventions

### Video Effects Philosophy
**CRITICAL:** This project uses MINIMAL effects for professional look
- **ONLY zoom effects** - NO pan, slide, or movement
- **Zoom range:** 1.0x to 1.03x (3% maximum - very subtle)
- **Smooth transitions** between images
- **Stable, professional aesthetic**

❌ **NEVER add:**
- Aggressive zoom (>1.03x)
- Pan/slide movements
- Ken Burns effects
- Rotation or skewing

### Audio Handling
- **Priority:** Use uploaded audio over TTS generation
- **Detection:** Check for audio file before calling TTS APIs
- **Formats:** Support MP3 and WAV
- **Duration:** Extract audio duration for video sync

### Image Processing
- **Count:** Support 5-20 images per video
- **Reuse:** Images are repeated to match audio duration
- **Distribution:** Even distribution across video timeline
- **Quality:** Maintain original quality, no degradation

### API Usage
- **Groq API:** Free tier for script generation (8k+ word stories)
- **GenAI Pro:** Optional, only for auto mode
- **Manual mode:** Zero API costs - recommend this mode to users

### Error Handling
- Always validate file uploads (type, size)
- Provide clear error messages to frontend
- Log errors server-side for debugging
- Graceful degradation when APIs unavailable

### Environment Variables
```env
# Required for script generation
GROQ_API_KEY=xxx

# Optional for auto generation mode
GENAIPRO_JWT=xxx

# Optional configuration
PORT=3000
MAX_IMAGE_SIZE=10485760  # 10MB default
MAX_AUDIO_SIZE=52428800  # 50MB default
```

## FFmpeg Integration

### Critical FFmpeg Commands
The project uses FFmpeg for video composition. Key parameters:

```bash
# Zoom effect only (1.0 to 1.03 scale)
-vf "zoompan=z='min(zoom+0.0002,1.03)':d=125:s=1920x1080"

# Audio handling
-i input_audio.mp3 -c:a aac -b:a 192k

# Output format
-c:v libx264 -pix_fmt yuv420p -preset medium
```

### Video Specifications
- **Resolution:** 1920x1080 (Full HD)
- **Codec:** H.264 (libx264)
- **Audio Codec:** AAC at 192kbps
- **Frame Rate:** 25 fps (configurable)
- **Format:** MP4

## Troubleshooting Guide

### Common Issues

**Video too short:**
- Verify audio file is detected properly
- Check browser console for audio duration detection
- Ensure FFmpeg correctly reads audio duration

**TTS still generating when audio uploaded:**
- Confirm "Upload Audio" mode is selected
- Verify audio file uploaded before clicking generate
- Check server.js audio detection logic

**Effects too aggressive:**
- Verify zoom range is 1.0 to 1.03 only
- Ensure no slide/movement filters in FFmpeg command
- Check FFmpeg filter chain in server.js

**FFmpeg not found:**
- Verify FFmpeg installed and in PATH
- Test with `ffmpeg -version` in terminal
- Add FFmpeg path to environment variables if needed

**Upload failures:**
- Check file size limits in multer configuration
- Verify uploads directory exists and is writable
- Check disk space availability

## Code Style Guidelines

### Backend (server.js)
```javascript
// Use async/await for asynchronous operations
app.post('/api/generate-video', async (req, res) => {
  try {
    // Your code here
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate inputs early
if (!file || !file.path) {
  return res.status(400).json({ error: 'No file uploaded' });
}
```

### Frontend (HTML/JS)
```javascript
// Use fetch API for requests
async function generateVideo() {
  try {
    const response = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    // Handle result
  } catch (error) {
    console.error('Error:', error);
    showError('Failed to generate video');
  }
}

// Update UI with progress
function updateProgress(percentage) {
  document.getElementById('progress').style.width = `${percentage}%`;
}
```

## Git Workflow

### Branch Naming
- Feature branches: `feature/description`
- Bug fixes: `fix/description`
- Claude-specific: `claude/claude-md-{session-id}`

### Commit Messages
Follow conventional commits:
```
feat: add subtitle support to video generation
fix: prevent TTS generation when audio uploaded
docs: update CLAUDE.md with FFmpeg parameters
refactor: simplify image upload handling
```

### What NOT to Commit
- `.env` file (contains API keys)
- `node_modules/` directory
- `uploads/` directory (user uploads)
- `outputs/` directory (generated videos)
- Any API keys or credentials

## Testing Checklist

Before committing changes, verify:
- [ ] Manual mode works (images + audio → video)
- [ ] No TTS generated when audio uploaded
- [ ] Video uses only 1.0-1.03x zoom effects
- [ ] No movement/slide effects present
- [ ] All three modes functional
- [ ] Error messages are user-friendly
- [ ] No hardcoded API keys in code
- [ ] FFmpeg commands produce expected output
- [ ] File uploads work correctly
- [ ] Video output is viewable and correct duration

## Performance Considerations

### Optimization Tips
- **Image processing:** Resize large images before video generation
- **Memory usage:** Stream large files instead of loading into memory
- **FFmpeg:** Use hardware acceleration if available (`-hwaccel cuda`)
- **Caching:** Cache generated scripts to avoid regeneration
- **Concurrent requests:** Limit parallel video generations to avoid overload

### Resource Limits
```javascript
// Recommended limits
const LIMITS = {
  MAX_IMAGES: 20,
  MIN_IMAGES: 5,
  MAX_IMAGE_SIZE: 10 * 1024 * 1024,  // 10MB
  MAX_AUDIO_SIZE: 50 * 1024 * 1024,  // 50MB
  MAX_VIDEO_DURATION: 600,            // 10 minutes
  CONCURRENT_GENERATIONS: 2
};
```

## AI Assistant Guidelines

### When Modifying Code
1. **Always read the file first** before making changes
2. **Preserve existing patterns** and code style
3. **Test critical paths** after changes (especially manual mode)
4. **Update documentation** if workflows change
5. **Never break the manual mode** - it's the primary $0 feature

### When Adding Features
1. **Check if it affects video effects** - maintain minimal zoom only
2. **Consider all three modes** - will it work in manual/auto/prompt modes?
3. **Validate inputs thoroughly** - security and user experience
4. **Add error handling** - fail gracefully with helpful messages
5. **Update this CLAUDE.md** - document new workflows or conventions

### When Fixing Bugs
1. **Understand the root cause** - don't just patch symptoms
2. **Test the fix in all modes** - ensure no regressions
3. **Check recent fixes** - similar issues may have been addressed
4. **Update troubleshooting section** - help future debugging

### Communication Style
- **Be specific:** Reference file paths and line numbers
- **Explain tradeoffs:** Why one approach over another
- **Confirm understanding:** Restate requirements before implementing
- **Show progress:** Use TodoWrite for multi-step tasks
- **Be honest:** If unsure, explore the codebase or ask questions

## Quick Reference

### Start Development
```bash
npm install
# Configure .env file
npm start
```

### Key URLs
- **App:** http://localhost:3000
- **FFmpeg Docs:** https://ffmpeg.org/documentation.html
- **Groq API:** https://console.groq.com/

### Important File Paths
- Config: `/home/user/yce/.env`
- Server: `/home/user/yce/server.js`
- Frontend: `/home/user/yce/battletech-video-generator.html`
- Uploads: `/home/user/yce/uploads/`
- Outputs: `/home/user/yce/outputs/`

### FFmpeg Test Command
```bash
ffmpeg -version  # Verify installation
ffmpeg -i input.mp3 -i image.jpg -t 10 test.mp4  # Quick test
```

## Project Goals & Philosophy

### Primary Goal
Enable users to create professional BattleTech cinematic horror videos with **zero API costs** using manual mode.

### Design Principles
1. **Simplicity:** Manual mode should be straightforward
2. **Quality:** Professional-looking output with minimal effects
3. **Flexibility:** Support multiple workflows (manual/auto/prompts)
4. **Cost-effective:** Default to free options, paid features optional
5. **User-friendly:** Clear UI, helpful error messages, smooth UX

### Success Metrics
- ✅ Users can generate videos without any API keys (manual mode)
- ✅ Video effects are subtle and professional (1.0-1.03x zoom only)
- ✅ Audio uploaded = No TTS generation = $0 cost
- ✅ All three modes functional and well-documented
- ✅ Clear troubleshooting for common issues

## Future Enhancements (Ideas)

Potential features to consider:
- Subtitle/caption support (SRT files)
- Custom zoom ranges per image
- Fade transition options between images
- Batch video generation
- Video templates/presets
- Progress persistence (resume interrupted generations)
- Cloud storage integration
- Docker containerization

**Note:** Always maintain backward compatibility with manual mode!

## Resources

### Documentation
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [FFmpeg Documentation](https://ffmpeg.org/ffmpeg.html)
- [Groq API Docs](https://console.groq.com/docs)
- [Multer (File Upload)](https://github.com/expressjs/multer)

### BattleTech Context
This is a video generator for BattleTech universe content, specifically horror-themed cinematics. Familiarize yourself with:
- BattleTech lore and terminology
- Horror/cinematic storytelling conventions
- The grimdark aesthetic of the universe

---

**Last Updated:** 2025-11-15
**Version:** 1.0.0
**Maintainer:** AI Assistant (Claude)

*This document should be updated whenever significant changes are made to the codebase, workflows, or conventions.*
