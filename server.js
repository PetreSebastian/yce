const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const multer = require('multer');

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ limit: '250mb', extended: true }));

// Create temp directory
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create uploads directory
const uploadsDir = path.join(tempDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Serve static files
app.use('/temp', express.static(tempDir));
app.use(express.static(__dirname));

// Load environment variables
require('dotenv').config();

// API Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ElevenLabs Configuration (RECOMMENDED - Most Reliable)
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam voice
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// OpenAI TTS Configuration (Alternative)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

// Pollinations.ai (FREE - Image Generation)
const POLLINATIONS_API_URL = 'https://image.pollinations.ai/prompt';

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Boring Facts Pokémon Video Generator is running!',
    apis: {
      groq: !!GROQ_API_KEY,
      elevenlabs: !!ELEVENLABS_API_KEY,
      openai: !!OPENAI_API_KEY
    }
  });
});

// ============================================================
// EXTRACT IMAGE PROMPTS
// ============================================================
app.post('/api/extract-image-prompts', async (req, res) => {
  console.log('\n🎨 Extracting image prompts from script...');

  try {
    const { script, imageCount = 10 } = req.body;

    if (!script || !script.trim()) {
      return res.status(400).json({ error: 'Script is required' });
    }

    console.log(`📝 Analyzing script (${script.length} chars) for ${imageCount} image prompts...`);

    const systemPrompt = `You are an expert at creating visual descriptions for Pokémon content.`;

    const userPrompt = `From this Boring Facts Pokémon script, extract exactly ${imageCount} key visual moments and create detailed image generation prompts.

SCRIPT: ${script.substring(0, 8000)}...

Requirements:
- Pokémon-themed scenes
- Detailed visual description
- Atmospheric and cinematic
- NO text, NO numbers, NO letters, NO signs, NO borders

Format: Return ONLY a JSON array: ["prompt 1", "prompt 2", ...]

Generate ${imageCount} prompts now:`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API failed: ${response.status}`);
    }

    const data = await response.json();
    let promptsText = data.choices[0].message.content;

    const jsonMatch = promptsText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not extract prompts array');
    }

    const prompts = JSON.parse(jsonMatch[0]);

    console.log(`✅ Extracted ${prompts.length} image prompts`);

    res.json({
      success: true,
      prompts: prompts,
      count: prompts.length
    });

  } catch (error) {
    console.error('❌ Prompt extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GENERATE IMAGES WITH POLLINATIONS (FREE & RELIABLE)
// ============================================================
app.post('/api/generate-images-pollinations', async (req, res) => {
  console.log('\n🎨 Generating images with Pollinations.ai (FREE)...');

  try {
    const { prompts } = req.body;

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'Prompts array required' });
    }

    console.log(`🖼️ Generating ${prompts.length} images...`);

    const images = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      console.log(`📸 Image ${i + 1}/${prompts.length}: ${prompt.substring(0, 50)}...`);

      try {
        // Enhanced prompt for better quality
        const enhancedPrompt = `${prompt}, cinematic lighting, high quality, detailed, NO text, NO watermarks`;
        const encodedPrompt = encodeURIComponent(enhancedPrompt);
        const imageUrl = `${POLLINATIONS_API_URL}/${encodedPrompt}?width=1920&height=1080&model=flux&seed=${Date.now() + i}&nologo=true`;

        const imageResponse = await fetch(imageUrl);

        if (!imageResponse.ok) {
          console.log(`⚠️ Failed image ${i + 1}, skipping...`);
          continue;
        }

        const imageBuffer = await imageResponse.buffer();
        const fileName = `pollinations_${Date.now()}_${i}.jpg`;
        const filePath = path.join(uploadsDir, fileName);

        await writeFile(filePath, imageBuffer);

        images.push({
          path: `/temp/uploads/${fileName}`,
          prompt: prompt
        });

        console.log(`✅ Image ${i + 1}/${prompts.length} generated`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (imgError) {
        console.error(`❌ Image ${i + 1} error:`, imgError.message);
      }
    }

    console.log(`✅ Generated ${images.length} images`);

    res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (error) {
    console.error('❌ Generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GENERATE IMAGES - LEGACY GEMINI ENDPOINT (DISABLED)
// NOTE: Gemini doesn't directly support image generation
// Use Pollinations instead or implement Google Imagen API
// ============================================================
app.post('/api/generate-images-gemini', async (req, res) => {
  console.log('\n⚠️ Gemini image generation is not available.');
  console.log('📝 Redirecting to Pollinations.ai...');

  // Redirect to Pollinations
  req.url = '/api/generate-images-pollinations';
  return app._router.handle(req, res);
});

// ============================================================
// GENERATE SCRIPT (UP TO 10K WORDS)
// ============================================================
app.post('/api/generate-script', async (req, res) => {
  console.log('\n🎬 Script generation...');

  try {
    const { title, wordCount = 2000 } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    console.log(`📝 Generating "${title}" (${wordCount} words)`);

    const systemPrompt = `You are the scriptwriter for "Boring Facts" YouTube channel.

YOUR STYLE:
- Calm, monotone, sleep-inducing
- Pokémon lore and trivia
- Conversational and atmospheric
- Rich descriptive detail

CRITICAL REQUIREMENTS:
- Factual information only
- Detailed, vivid language
- NO "tapestry"
- Spelled-out numbers only
- Like/subscribe ending`;

    const userPrompt = `Create a ${wordCount}-word script for: "${title}"

Boring Facts style - calm, sleep-inducing Pokémon narration.

Structure:
- Opening ("Close your eyes...")
- Comprehensive coverage
- Natural transitions
- Call-to-action ending

~${wordCount} words total.`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: Math.floor(wordCount * 2.5),
        top_p: 0.9
      })
    });

    if (!response.ok) {
      throw new Error(`Groq failed: ${response.status}`);
    }

    const data = await response.json();
    const script = data.choices[0].message.content;
    const actualWords = script.split(/\s+/).length;

    console.log(`✅ Script generated: ${actualWords} words`);

    res.json({
      success: true,
      script: script,
      actualWords: actualWords
    });

  } catch (error) {
    console.error('❌ Script error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GENERATE VOICEOVER - ELEVENLABS (RECOMMENDED)
// ============================================================
app.post('/api/generate-voiceover', async (req, res) => {
  console.log('\n🎙️ Voiceover generation...');

  try {
    const { script } = req.body;

    if (!script || !script.trim()) {
      return res.status(400).json({ error: 'Script required' });
    }

    console.log(`📝 Length: ${script.length} chars`);

    // Try ElevenLabs first
    if (ELEVENLABS_API_KEY) {
      console.log('🎤 Using ElevenLabs API...');

      const response = await fetch(`${ELEVENLABS_API_URL}/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs error:', errorText);
        throw new Error(`ElevenLabs failed: ${response.status}`);
      }

      const audioBuffer = await response.buffer();
      const audioFileName = `voiceover_elevenlabs_${Date.now()}.mp3`;
      const audioPath = path.join(uploadsDir, audioFileName);

      await writeFile(audioPath, audioBuffer);

      console.log(`✅ ElevenLabs voiceover: ${audioFileName}`);

      return res.json({
        success: true,
        audioPath: `/temp/uploads/${audioFileName}`,
        size: audioBuffer.length,
        provider: 'elevenlabs'
      });
    }

    // Try OpenAI TTS
    if (OPENAI_API_KEY) {
      console.log('🎤 Using OpenAI TTS...');

      const response = await fetch(OPENAI_TTS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: script,
          voice: 'onyx', // Deep, calm voice
          speed: 0.9 // Slightly slower for sleep content
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI TTS error:', errorText);
        throw new Error(`OpenAI TTS failed: ${response.status}`);
      }

      const audioBuffer = await response.buffer();
      const audioFileName = `voiceover_openai_${Date.now()}.mp3`;
      const audioPath = path.join(uploadsDir, audioFileName);

      await writeFile(audioPath, audioBuffer);

      console.log(`✅ OpenAI TTS voiceover: ${audioFileName}`);

      return res.json({
        success: true,
        audioPath: `/temp/uploads/${audioFileName}`,
        size: audioBuffer.length,
        provider: 'openai'
      });
    }

    // No API keys configured
    throw new Error('No TTS API configured. Set ELEVENLABS_API_KEY or OPENAI_API_KEY in .env');

  } catch (error) {
    console.error('❌ Voiceover error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GENERATE DESCRIPTION & TAGS
// ============================================================
app.post('/api/generate-description', async (req, res) => {
  console.log('\n📋 Description generation...');

  try {
    const { script, title } = req.body;

    if (!script || !script.trim()) {
      return res.status(400).json({ error: 'Script required' });
    }

    const truncatedScript = script.length > 3000 ? script.substring(0, 3000) + '...' : script;

    const systemPrompt = `You are a YouTube SEO expert for "Boring Facts" channel.`;

    const userPrompt = `Generate YouTube description and tags.

TITLE: ${title || 'Boring Facts - Pokémon Video'}

SCRIPT: ${truncatedScript}

Generate:

DESCRIPTION (150-200 words):
- Sleep-inducing style
- Pokémon topics covered
- Like/subscribe CTA

TAGS (15-20 tags):
- Pokemon facts, gaming trivia
- Sleep/ASMR tags

Format:
DESCRIPTION: [text]

TAGS: tag1, tag2, tag3`;

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Groq failed: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    const descriptionMatch = generatedText.match(/DESCRIPTION:\s*([\s\S]*?)\s*TAGS:/i);
    const tagsMatch = generatedText.match(/TAGS:\s*([\s\S]*?)$/i);

    const description = descriptionMatch ? descriptionMatch[1].trim() : generatedText;
    const tagsString = tagsMatch ? tagsMatch[1].trim() : '';
    const tags = tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0).join(', ');

    console.log(`✅ Generated description and tags`);

    res.json({
      success: true,
      description: description,
      tags: tags
    });

  } catch (error) {
    console.error('❌ Description error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// FILE UPLOADS
// ============================================================

app.post('/api/upload-images', upload.array('images', 50), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const imagePaths = req.files.map(file => `/temp/uploads/${path.basename(file.path)}`);
    console.log(`✅ Uploaded ${req.files.length} images`);

    res.json({
      success: true,
      images: imagePaths,
      count: req.files.length
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio uploaded' });
    }

    const audioPath = `/temp/uploads/${path.basename(req.file.path)}`;
    console.log(`✅ Uploaded audio: ${req.file.originalname}`);

    res.json({
      success: true,
      audioPath: audioPath,
      originalName: req.file.originalname,
      size: req.file.size
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// VIDEO CREATION
// ============================================================
app.post('/api/create-video', async (req, res) => {
  console.log('\n🎬 Video creation...');

  try {
    const { imagePaths, audioPath, title, script } = req.body;

    if (!imagePaths || imagePaths.length < 5) {
      return res.status(400).json({ error: 'At least 5 images required' });
    }

    if (!audioPath) {
      return res.status(400).json({ error: 'Audio required' });
    }

    console.log(`📸 Processing ${imagePaths.length} images`);

    const sessionId = Date.now();
    const sessionDir = path.join(tempDir, `session_${sessionId}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    const absoluteImagePaths = imagePaths.map(p => path.join(__dirname, p.replace(/^\//, '')));
    const absoluteAudioPath = path.join(__dirname, audioPath.replace(/^\//, ''));

    // Get audio duration
    console.log('🎵 Detecting audio duration...');
    const audioDuration = await new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        absoluteAudioPath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(output.trim());
          console.log(`✅ Duration: ${duration.toFixed(2)}s`);
          resolve(duration);
        } else {
          reject(new Error('Failed to get duration'));
        }
      });
    });

    const imageCount = absoluteImagePaths.length;
    const intervalPerImage = audioDuration / imageCount;
    console.log(`⏱️  ${intervalPerImage.toFixed(2)}s per image`);

    // Create segments
    console.log('🎨 Creating segments...');
    const segmentPaths = [];

    for (let i = 0; i < absoluteImagePaths.length; i++) {
      const segmentPath = path.join(sessionDir, `segment_${i}.mp4`);
      const totalFrames = Math.floor(intervalPerImage * 15);

      const filter = i % 2 === 0
        ? `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.0+0.03*on/${totalFrames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${totalFrames}:s=1920x1080:fps=15`
        : `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.03-0.03*on/${totalFrames}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${totalFrames}:s=1920x1080:fps=15`;

      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-loop', '1',
          '-i', absoluteImagePaths[i],
          '-vf', filter,
          '-t', intervalPerImage.toString(),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-y',
          segmentPath
        ]);

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log(`✅ Segment ${i + 1}/${imageCount}`);
            resolve();
          } else {
            reject(new Error(`FFmpeg failed ${i}`));
          }
        });
      });

      segmentPaths.push(segmentPath);
    }

    // Concatenate
    console.log('🔗 Concatenating...');
    const concatPath = path.join(sessionDir, 'concat.txt');
    const concatContent = segmentPaths.map(p => `file '${path.basename(p)}'`).join('\n');
    await writeFile(concatPath, concatContent);

    const videoOnlyPath = path.join(sessionDir, 'video_no_audio.mp4');

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatPath,
        '-c', 'copy',
        '-y',
        videoOnlyPath
      ], { cwd: sessionDir });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Concatenated');
          resolve();
        } else {
          reject(new Error('Concat failed'));
        }
      });
    });

    // Merge audio
    console.log('🎵 Merging audio...');
    const finalVideoPath = path.join(sessionDir, 'final_video.mp4');

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoOnlyPath,
        '-i', absoluteAudioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-y',
        finalVideoPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Audio merged');
          resolve();
        } else {
          reject(new Error('Merge failed'));
        }
      });
    });

    // Move to public
    const publicVideoName = `boring-facts-video_${sessionId}.mp4`;
    const publicVideoPath = path.join(tempDir, publicVideoName);
    fs.copyFileSync(finalVideoPath, publicVideoPath);

    const videoUrl = `/temp/${publicVideoName}`;

    // Cleanup
    setTimeout(() => {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log('✅ Cleanup complete');
      } catch (err) {
        console.error('Cleanup error:', err.message);
      }
    }, 5000);

    console.log('🎉 Video complete!\n');

    res.json({
      success: true,
      videoUrl: videoUrl,
      message: 'Video ready!'
    });

  } catch (error) {
    console.error('❌ Video error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('😴 BORING FACTS - POKÉMON VIDEO GENERATOR 😴');
  console.log('='.repeat(60));
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`✅ Health: http://localhost:${PORT}/health`);
  console.log('');
  console.log('🎙️ Voice: ElevenLabs or OpenAI TTS');
  console.log('🎨 Images: Pollinations.ai (FREE)');
  console.log('📝 Word Limit: Up to 10,000 words!');
  console.log('📋 Description & Tags: Auto-generated');
  console.log('');
  console.log('API Status:');
  console.log(`  - Groq (Script): ${GROQ_API_KEY ? '✅' : '❌ Missing'}`);
  console.log(`  - ElevenLabs (Voice): ${ELEVENLABS_API_KEY ? '✅' : '❌ Missing'}`);
  console.log(`  - OpenAI (Voice): ${OPENAI_API_KEY ? '✅' : '⚠️  Optional'}`);
  console.log('');
  console.log('Ready!');
  console.log('='.repeat(60));
});

process.on('SIGINT', () => {
  console.log('\n🛑 Stopped. Goodbye!');
  process.exit(0);
});
