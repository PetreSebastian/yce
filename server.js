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

// Enable CORS for all origins
app.use(cors());
app.use(express.json({ limit: '250mb' }));
app.use(express.urlencoded({ limit: '250mb', extended: true }));

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create uploads directory for file uploads
const uploadsDir = path.join(tempDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
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
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max per file
});

// Serve static files from temp directory
app.use('/temp', express.static(tempDir));

// Serve static files (HTML frontend)
app.use(express.static(__dirname));

// Load environment variables
require('dotenv').config();

// GenAIPro configuration
const GENAIPRO_JWT = process.env.GENAIPRO_JWT || '';
const GENAIPRO_BASE_URL = 'https://genaipro.vn/api/v1';

// Google Gemini 2.5 Flash Image configuration (NEW model for native image generation!)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Fal.ai configuration (Flux Schnell - FAST & CHEAP!)
const FAL_API_KEY = process.env.FAL_API_KEY || '';
const FAL_API_URL = 'https://fal.run/fal-ai/flux/schnell';

// Stability AI configuration (STABLE & RELIABLE!)
const STABILITY_API_KEY = process.env.STABILITY_API_KEY || '';
const STABILITY_API_URL = 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image';

// Groq configuration (FREE & FAST text generation!)
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ============================================================
// JOB STORAGE FOR ASYNC VIDEO GENERATION (PERSISTENT!)
// ============================================================
const jobs = new Map(); // jobId => { status, progress, videoUrl, error, createdAt }
const jobsDir = path.join(tempDir, 'jobs');

// Ensure jobs directory exists
if (!fs.existsSync(jobsDir)) {
  fs.mkdirSync(jobsDir, { recursive: true });
}

// Load existing jobs from disk on startup
function loadJobsFromDisk() {
  try {
    const files = fs.readdirSync(jobsDir);
    let orphanedCount = 0;

    for (const file of files) {
      if (file.endsWith('.json')) {
        const jobPath = path.join(jobsDir, file);
        const jobMetadata = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        jobMetadata.createdAt = new Date(jobMetadata.createdAt); // Convert back to Date
        jobMetadata.data = null; // Data was not persisted, set to null

        // Mark orphaned processing jobs as failed (server restarted mid-processing)
        if (jobMetadata.status === 'processing' || jobMetadata.status === 'queued') {
          jobMetadata.status = 'failed';
          jobMetadata.error = 'Server restarted while job was processing. Please try again.';
          orphanedCount++;
          console.log(`⚠️ Marked orphaned job as failed: ${jobMetadata.id}`);
          // Save the updated status back to disk
          fs.writeFileSync(jobPath, JSON.stringify(jobMetadata, null, 2));
        }

        jobs.set(jobMetadata.id, jobMetadata);
        console.log(`📂 Loaded job metadata from disk: ${jobMetadata.id} (status: ${jobMetadata.status})`);
      }
    }
    console.log(`✅ Loaded ${jobs.size} jobs from disk (${orphanedCount} orphaned jobs marked as failed)`);
  } catch (error) {
    console.error('⚠️ Error loading jobs from disk:', error.message);
  }
}

// Save job to disk (EXCLUDING large 'data' field for speed!)
function saveJobToDisk(jobId) {
  try {
    const job = jobs.get(jobId);
    if (job) {
      // Only save metadata, NOT the data payload (can be 100-200MB!)
      const jobMetadata = {
        id: job.id,
        status: job.status,
        progress: job.progress,
        videoUrl: job.videoUrl,
        error: job.error,
        createdAt: job.createdAt
        // Explicitly EXCLUDE job.data to avoid huge disk writes
      };
      const jobPath = path.join(jobsDir, `${jobId}.json`);
      fs.writeFileSync(jobPath, JSON.stringify(jobMetadata, null, 2));
    }
  } catch (error) {
    console.error(`⚠️ Error saving job ${jobId} to disk:`, error.message);
  }
}

function createJob(data) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  jobs.set(jobId, {
    id: jobId,
    status: 'queued', // queued, processing, completed, failed
    progress: 0,
    videoUrl: null,
    error: null,
    createdAt: new Date(),
    data: data
  });
  saveJobToDisk(jobId); // Persist to disk immediately
  console.log(`✅ Job created: ${jobId}`);
  return jobId;
}

function updateJobStatus(jobId, updates) {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
    saveJobToDisk(jobId); // Persist changes to disk
    console.log(`📊 Job ${jobId}: status=${job.status}, progress=${job.progress}%`);
  }
}

function getJob(jobId) {
  return jobs.get(jobId);
}

// Clean up old jobs (older than 2 hours)
setInterval(() => {
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt.getTime() < twoHoursAgo) {
      console.log(`🧹 Cleaning up old job: ${jobId}`);

      // Delete job file from disk
      try {
        const jobPath = path.join(jobsDir, `${jobId}.json`);
        if (fs.existsSync(jobPath)) {
          fs.unlinkSync(jobPath);
        }
      } catch (error) {
        console.error(`⚠️ Error deleting job file ${jobId}:`, error.message);
      }

      jobs.delete(jobId);
    }
  }
}, 30 * 60 * 1000); // Run every 30 minutes

// Load jobs on startup
loadJobsFromDisk();

// Parse script and extract scene descriptions for image generation
function parseScriptForScenes(scriptText) {
  const scenes = [];

  // Method 1: Try to find explicit scene markers
  const sceneMarkers = /Scene \d+:|SCENE \d+:|ACT \d+:/gi;
  const sections = scriptText.split(sceneMarkers);

  // Extract visual descriptions from each section
  sections.forEach((section, index) => {
    if (index === 0) return; // Skip intro

    // Look for visual descriptions - typically in first few paragraphs
    const paragraphs = section.split('\n\n').filter(p => p.trim());

    for (const para of paragraphs.slice(0, 3)) {
      // Look for descriptive text (longer paragraphs with visual details)
      if (para.length > 100 && para.length < 500) {
        // Extract BattleTech specific terms and visual elements
        if (para.match(/'Mech|cockpit|reactor|laser|PPC|AC\/|bay|Atlas|Marauder|industrial|maintenance/i)) {
          scenes.push(para.trim());
          break;
        }
      }
    }
  });

  // Method 2: If no scenes found with markers, extract from continuous narrative
  if (scenes.length === 0) {
    console.log('⚠️ No scene markers found, extracting visual moments from narrative...');

    // Split into sentences
    const sentences = scriptText
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 30);

    // Find sentences with strong visual content
    const visualKeywords = [
      /'Mech|Atlas|Marauder|Warhammer|Shadowhawk|BattleMech/i,
      /cockpit|bay|hangar|maintenance|industrial/i,
      /reactor|engine|myomer|actuator|armor|weapon/i,
      /laser|PPC|autocannon|missile|gauss/i,
      /lights|shadows|sparks|glow|illuminate/i,
      /massive|towering|enormous|giant|looming/i,
      /rust|damage|worn|scarred|battle/i,
      /tech|mechanic|engineer|repair|diagnostic/i
    ];

    const visualSentences = sentences.filter(sentence => {
      return visualKeywords.some(pattern => pattern.test(sentence));
    });

    // Group 2-3 visual sentences into one scene description
    for (let i = 0; i < visualSentences.length; i += 2) {
      const sceneText = visualSentences.slice(i, i + 3).join('. ') + '.';
      if (sceneText.length > 80) {
        scenes.push(sceneText);
      }
    }
  }

  // Method 3: If still not enough scenes, split entire text into semantic chunks
  if (scenes.length < 5) {
    console.log('⚠️ Not enough visual scenes, creating semantic chunks...');

    // Split by double newlines (paragraphs)
    const paragraphs = scriptText
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 100);

    // Take every Nth paragraph or split long paragraphs
    const step = Math.max(1, Math.floor(paragraphs.length / 15));

    for (let i = 0; i < paragraphs.length; i += step) {
      let para = paragraphs[i];

      // If paragraph is too long, take first 2-3 sentences
      if (para.length > 400) {
        const sentences = para.split(/[.!?]+/).filter(s => s.trim());
        para = sentences.slice(0, 3).join('. ') + '.';
      }

      // Ensure it's not too short
      if (para.length > 80 && para.length < 300) {
        scenes.push(para);
      }
    }
  }

  // Remove duplicates
  const uniqueScenes = [...new Set(scenes)];

  console.log(`✅ Extracted ${uniqueScenes.length} unique scenes`);
  return uniqueScenes;
}

// Convert scene descriptions to EC Comics horror style image prompts
function convertToImagePrompts(sceneDescriptions) {
  return sceneDescriptions.map((scene, index) => {
    // Extract key visual elements and keep prompt concise
    let basePrompt = scene.replace(/["""]/g, '').trim();

    // Shorten if too long (keep under 200 chars for the base description)
    if (basePrompt.length > 200) {
      // Extract most visually descriptive parts
      const sentences = basePrompt.split(/[.!?]+/).filter(s => s.trim());

      // Prioritize sentences with visual keywords
      const visualKeywords = /'Mech|Atlas|Marauder|cockpit|bay|reactor|lights|shadows|armor|industrial|maintenance|mechanical|laser|PPC/i;

      const visualSentences = sentences.filter(s => visualKeywords.test(s));
      basePrompt = visualSentences.length > 0
        ? visualSentences.slice(0, 2).join('. ')
        : sentences.slice(0, 2).join('. ');

      // Still too long? Take first 150 chars
      if (basePrompt.length > 150) {
        basePrompt = basePrompt.substring(0, 150) + '...';
      }
    }

    // Keep 1950s EC Comics style BUT force vibrant colors
    return `1950s EC Comics horror illustration: ${basePrompt}. Heavy ink work, vibrant orange lighting, dramatic shadows, halftone dots pattern, full color comic book style, rich saturated colors, warm orange and yellow tones, highly detailed, sharp focus, professional digital art, 4K quality, cinematic composition`;
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running!' });
});

// Check which image providers are available (based on API keys)
app.get('/api/providers-status', (req, res) => {
  res.json({
    pollinations: true, // Always available (free, no key needed)
    gemini: GEMINI_API_KEY && GEMINI_API_KEY.length > 0, // NOW WORKS with Gemini 2.5 Flash Image!
    fal: FAL_API_KEY && FAL_API_KEY.length > 0,
    stability: STABILITY_API_KEY && STABILITY_API_KEY.length > 0
  });
});

// Extract image prompts from script using Groq AI
app.post('/api/extract-prompts', async (req, res) => {
  console.log('\n🎯 Prompt extraction request received...');

  try {
    const { script, promptCount } = req.body;

    if (!script || !script.trim()) {
      return res.status(400).json({ error: 'Script is required' });
    }

    const targetCount = promptCount || 10;
    console.log(`🔍 Extracting ${targetCount} image prompts from script (${script.length} chars)...`);
    console.log('🤖 Using Groq Llama 3.3 for prompt extraction...');

    // Use only first 8000 characters to avoid payload issues
    const truncatedScript = script.length > 8000 ? script.substring(0, 8000) : script;

    const systemPrompt = `You are an expert at extracting visual scenes from stories for image generation. You analyze text and create detailed, visual image prompts perfect for AI image generation tools.`;

    const userPrompt = `Analyze this BattleTech horror story and extract exactly ${targetCount} distinct visual scenes for image generation.

SCRIPT TO ANALYZE:
${truncatedScript}

REQUIREMENTS:
- Extract exactly ${targetCount} different visual scenes
- Each prompt should be 1-2 sentences describing a specific visual moment
- Focus on dramatic, atmospheric, and visually striking scenes
- Include BattleMech models, environments, lighting details
- Use "1950s EC Comics horror style" for each prompt
- CRITICAL: NO text, NO numbers, NO letters, NO signs, NO readable text visible in the scene
- Number each prompt (1., 2., 3., etc.)

FORMAT EXAMPLE:
1. 1950s EC Comics horror style: Atlas BattleMech stands in dimly lit maintenance bay, orange auxiliary lights casting dramatic shadows across damaged armor, no text or numbers visible.

Generate exactly ${targetCount} prompts following this format:`;

    // Call Groq API for prompt extraction
    const groqResponse = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: Math.floor(targetCount * 80),
        top_p: 0.9,
        stream: false
      })
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq API failed: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    const extractedText = groqData.choices[0].message.content;

    // Parse numbered prompts
    const lines = extractedText.split('\n').filter(line => line.trim());
    const prompts = [];

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)/);
      if (match && prompts.length < targetCount) {
        prompts.push(match[1].trim());
      }
    }

    // Fill remaining slots if needed
    while (prompts.length < targetCount) {
      prompts.push(`1950s EC Comics horror style: Industrial BattleMech maintenance bay with dramatic orange lighting, scene ${prompts.length + 1}.`);
    }

    console.log(`✅ Extracted ${prompts.length} image prompts successfully`);

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

// Generate video description and tags from script
app.post('/api/generate-description', async (req, res) => {
  console.log('\n📋 Video description generation request received...');

  try {
    const { script, title } = req.body;

    if (!script || !script.trim()) {
      return res.status(400).json({ error: 'Script is required' });
    }

    console.log(`🔍 Generating description and tags for: "${title || 'Untitled'}"`);

    // Use first 3000 chars to avoid payload issues
    const truncatedScript = script.length > 3000 ? script.substring(0, 3000) + '...' : script;

    const systemPrompt = `You are a YouTube SEO expert specializing in BattleTech and horror content. You create engaging descriptions and effective tags.`;

    const userPrompt = `Based on this BattleTech horror script, generate a YouTube description and tags.

TITLE: ${title || 'BattleTech Horror Story'}

SCRIPT EXCERPT:
${truncatedScript}

Generate:

1. DESCRIPTION (3-4 sentences): Engaging description that hooks viewers and explains what they'll experience. Include BattleTech lore references.

2. TAGS (15-20 tags): Comma-separated tags for YouTube SEO. Include: BattleTech, MechWarrior, horror, sci-fi, specific mech names if mentioned, mood keywords.

FORMAT:
DESCRIPTION:
[Your description here]

TAGS:
[tag1, tag2, tag3, etc]`;

    // Call Groq API
    const response = await fetchWithRetry(GROQ_API_URL, {
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
        max_tokens: 500,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API failed: ${response.status}`);
    }

    const data = await response.json();
    const generated = data.choices[0].message.content;

    // Parse description and tags
    const descMatch = generated.match(/DESCRIPTION:\s*\n(.+?)(?=\n\nTAGS:|$)/s);
    const tagsMatch = generated.match(/TAGS:\s*\n(.+)/s);

    const description = descMatch ? descMatch[1].trim() : generated;
    const tags = tagsMatch ? tagsMatch[1].trim() : 'BattleTech, MechWarrior, horror, sci-fi';

    console.log('✅ Description and tags generated successfully');

    res.json({
      success: true,
      description: description,
      tags: tags
    });

  } catch (error) {
    console.error('❌ Description generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to retry API calls with exponential backoff on rate limits
async function fetchWithRetry(url, options, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) {
      return response;
    }

    if (response.status === 429 && attempt < maxRetries) {
      const errorText = await response.text();
      console.log(`⚠️ Rate limit hit (attempt ${attempt}/${maxRetries})`);

      // Parse wait time from error message (e.g., "Please try again in 275ms" or "1.31s")
      let waitTime = 3000 * attempt; // Default exponential backoff: 3s, 6s, 9s, 12s
      const match = errorText.match(/try again in ([\d.]+)(ms|s)/);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[2];
        waitTime = unit === 's' ? value * 1000 : value;
        waitTime = Math.ceil(waitTime) + 500; // Add 500ms buffer
      }

      console.log(`⏱️ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}

// Generate script with Groq Llama 3.1 (FREE & FAST!)
app.post('/api/generate-script', async (req, res) => {
  console.log('\n📝 Script generation request received...');

  try {
    const { title, wordCount } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const targetWords = wordCount || 6000;
    console.log(`✍️ Generating ${targetWords}-word BattleTech horror script for: "${title}"`);
    console.log('🚀 Using Groq Llama 3.1 70B (free & fast!)...');
    console.log(`📝 Strategy: Multi-section generation to reach EXACTLY ${targetWords} words`);

    // MULTI-SECTION GENERATION: Distribute X evenly across sections
    const idealSectionSize = 1000; // Aim for ~1000 word sections
    const numSections = Math.ceil(targetWords / idealSectionSize);
    const wordsPerSection = Math.floor(targetWords / numSections); // Evenly distributed
    const lastSectionWords = targetWords - (wordsPerSection * (numSections - 1));

    console.log(`📚 Generating ${numSections} sections (~${wordsPerSection} words each, final: ${lastSectionWords} words)`);

    const systemPrompt = `You are a BattleTech horror writer. Write in 1950s EC Comics style. You write the EXACT word count requested.`;

    let generatedScript = '';
    let totalWords = 0;

    // SECTION 1: Opening
    console.log(`\n📖 Section 1/${numSections} - Opening (${wordsPerSection} words)...`);

    const section1Prompt = `Write the OPENING of a BattleTech horror story about: ${title}

Write EXACTLY ${wordsPerSection} words.

- First-person (MechWarrior/technician)
- EC Comics horror style
- Introduce setting, character, situation
- Visual, atmospheric descriptions
- Do NOT include the title in the story text

${wordsPerSection} words. Start directly with the story:`;

    let resp1 = await fetchWithRetry(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: section1Prompt }],
        temperature: 0.7,
        max_tokens: Math.floor(wordsPerSection * 1.5),
        stream: false
      })
    });

    if (!resp1.ok) throw new Error(`Groq failed: ${resp1.status}`);

    const data1 = await resp1.json();
    generatedScript = data1.choices[0].message.content;
    totalWords = generatedScript.split(/\s+/).length;
    console.log(`✅ Section 1: ${totalWords} words`);

    // Wait 2 seconds to respect rate limits (12k tokens/minute)
    if (numSections > 1) {
      console.log('⏱️ Waiting 2s to respect rate limits...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // MIDDLE SECTIONS 2 to N-1
    for (let i = 2; i < numSections; i++) {
      console.log(`\n📖 Section ${i}/${numSections} - Continuing (${wordsPerSection} words)...`);

      const continuePrompt = `Continue with EXACTLY ${wordsPerSection} more words.

Story so far:
${generatedScript.slice(-1500)}

Add ${wordsPerSection} words. Build tension. Do NOT conclude.`;

      const respN = await fetchWithRetry(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: section1Prompt },
            { role: 'assistant', content: generatedScript },
            { role: 'user', content: continuePrompt }
          ],
          temperature: 0.7,
          max_tokens: Math.floor(wordsPerSection * 1.5),
          stream: false
        })
      });

      if (respN.ok) {
        const dataN = await respN.json();
        const cont = dataN.choices[0].message.content;
        generatedScript += '\n\n' + cont;
        totalWords = generatedScript.split(/\s+/).length;
        console.log(`✅ Section ${i}: +${cont.split(/\s+/).length} words (Total: ${totalWords})`);

        // Wait 2 seconds before next section to respect rate limits
        if (i < numSections - 1) {
          console.log('⏱️ Waiting 2s to respect rate limits...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        const errorText = await respN.text();
        console.error(`❌ Section ${i} FAILED: ${respN.status} - ${errorText}`);
        throw new Error(`Section ${i} generation failed: ${respN.status}`);
      }
    }

    // FINAL SECTION: Conclusion
    if (numSections > 1) {
      // Wait 2 seconds before final section to respect rate limits
      console.log('⏱️ Waiting 2s to respect rate limits...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`\n📖 Section ${numSections}/${numSections} - CONCLUSION (${lastSectionWords} words)...`);

      const finalPrompt = `END the story with EXACTLY ${lastSectionWords} more words.

Story so far:
${generatedScript.slice(-1500)}

Write ${lastSectionWords} words. Tragic, horrifying EC Comics ending.`;

      const respFinal = await fetchWithRetry(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: section1Prompt },
            { role: 'assistant', content: generatedScript },
            { role: 'user', content: finalPrompt }
          ],
          temperature: 0.7,
          max_tokens: Math.floor(lastSectionWords * 1.5),
          stream: false
        })
      });

      if (respFinal.ok) {
        const dataFinal = await respFinal.json();
        const conclusion = dataFinal.choices[0].message.content;
        generatedScript += '\n\n' + conclusion;
        totalWords = generatedScript.split(/\s+/).length;
        console.log(`✅ Final: +${conclusion.split(/\s+/).length} words (Total: ${totalWords})`);
      } else {
        const errorText = await respFinal.text();
        console.error(`❌ Final section FAILED: ${respFinal.status} - ${errorText}`);
        throw new Error(`Final section generation failed: ${respFinal.status}`);
      }
    }

    let actualWords = totalWords;
    const minWords = targetWords - 500;
    const maxWords = targetWords + 500;

    // Ensure script isn't too large for frontend processing
    const maxScriptSize = 50000; // 50k characters max
    if (generatedScript.length > maxScriptSize) {
      console.log(`⚠️ Script too large (${generatedScript.length} chars), truncating to ${maxScriptSize} chars`);
      generatedScript = generatedScript.substring(0, maxScriptSize) + "\n\n[Story continues but truncated for processing...]";
      actualWords = generatedScript.split(/\s+/).length;
    }

    console.log(`✅ Script generated: ${generatedScript.length} characters, ~${actualWords} words`);
    console.log(`🎯 Target: ${targetWords} words (range: ${minWords}-${maxWords})`);

    if (actualWords < minWords) {
      console.log(`⚠️ WARNING: Story is ${minWords - actualWords} words SHORT of target!`);
    } else if (actualWords > maxWords) {
      console.log(`⚠️ WARNING: Story is ${actualWords - maxWords} words OVER target!`);
    } else {
      console.log(`✅ Word count within acceptable range!`);
    }

    res.json({
      success: true,
      script: generatedScript,
      actualWords: actualWords,
      targetWords: targetWords
    });

  } catch (error) {
    console.error('❌ Script generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate voiceover with GenAIPro TTS (ElevenLabs)
app.post('/api/generate-voiceover', async (req, res) => {
  console.log('\n🎙️ Voiceover generation request received...');

  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log(`📝 Text length: ${text.length} characters`);

    // Truncate text if too large to avoid payload errors
    const maxTextLength = 30000; // 30k characters max for TTS (~6000 words, ~10-15 min audio)
    let processedText = text;

    if (text.length > maxTextLength) {
      console.log(`⚠️ Text too large (${text.length} chars). Truncating to ${maxTextLength} chars...`);

      // Find last sentence ending to avoid cutting mid-sentence
      let truncatedText = text.substring(0, maxTextLength);
      const lastSentenceEnd = Math.max(
        truncatedText.lastIndexOf('.'),
        truncatedText.lastIndexOf('!'),
        truncatedText.lastIndexOf('?')
      );

      if (lastSentenceEnd > maxTextLength * 0.8) {
        truncatedText = truncatedText.substring(0, lastSentenceEnd + 1);
      }

      processedText = truncatedText;
      console.log(`📝 Truncated to ${processedText.length} characters for TTS`);
    }

    console.log('🔊 Generating voiceover with GenAIPro (ElevenLabs)...');

    // Step 1: Create TTS task
    const createTaskResponse = await fetch(`${GENAIPRO_BASE_URL}/labs/task`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GENAIPRO_JWT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: processedText,
        voice_id: voiceId || 'pCF9NkBQJrxUnQsbPkyR', // Richard "Whiskey-Rich" Mason
        model_id: 'eleven_turbo_v2_5',
        style: 0.1, // Style Exaggeration: 10%
        speed: 0.93, // Speed: 0.93
        use_speaker_boost: true, // Speaker boost enabled
        similarity: 0.6, // Similarity: 60%
        stability: 0.5 // Stability: 50%
      })
    });

    if (!createTaskResponse.ok) {
      const errorText = await createTaskResponse.text();
      console.error('GenAIPro API Error (Create Task):', errorText);
      throw new Error(`GenAIPro API failed: ${createTaskResponse.status} - ${errorText}`);
    }

    const taskData = await createTaskResponse.json();
    const taskId = taskData.task_id;

    console.log(`✅ Task created: ${taskId}`);
    console.log('⏳ Waiting for task completion...');

    // Step 2: Poll task status until completion
    let taskStatus = null;
    let attempts = 0;
    // Dynamic timeout: ~1 second per 30 chars + 2 min buffer
    const estimatedTime = Math.ceil(processedText.length / 30) + 120;

    console.log(`⏱️ Text: ${processedText.length} chars, Estimated: ~${Math.ceil(estimatedTime / 60)} minutes`);
    console.log('⏳ Waiting for task completion (will keep retrying until done)...');

    while (true) { // Keep polling indefinitely until completed or failed
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const statusResponse = await fetch(`${GENAIPRO_BASE_URL}/labs/task/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GENAIPRO_JWT}`
        }
      });

      if (!statusResponse.ok) {
        console.error('Failed to check task status, retrying...');
        attempts++;
        continue;
      }

      taskStatus = await statusResponse.json();

      if (taskStatus.status === 'completed') {
        console.log(`✅ Voiceover generation completed after ${attempts}s!`);
        break;
      } else if (taskStatus.status === 'failed') {
        throw new Error('Task failed: ' + (taskStatus.error || 'Unknown error'));
      }

      attempts++;

      // Log progress every 10 seconds
      if (attempts % 10 === 0) {
        console.log(`⏳ Still processing... (${attempts}s elapsed)`);
      }

      // Warn if taking longer than expected
      if (attempts === estimatedTime) {
        console.log(`⚠️ Taking longer than estimated (${estimatedTime}s), but continuing to wait...`);
      }
    }

    // Step 3: Download the audio file
    const audioUrl = taskStatus.result;
    console.log(`📥 Downloading audio from: ${audioUrl}`);

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio file');
    }

    const audioBuffer = await audioResponse.buffer();
    const audioBase64 = audioBuffer.toString('base64');

    console.log('✅ Voiceover downloaded and encoded!');

    res.json({
      success: true,
      audioBase64: `data:audio/mpeg;base64,${audioBase64}`,
      duration: 0, // Will be calculated by frontend
      taskId: taskId,
      truncated: text.length > processedText.length,
      originalLength: text.length,
      processedLength: processedText.length
    });

  } catch (error) {
    console.error('❌ Voiceover generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate images with Google Gemini 2.5 Flash Image (NEW!)
app.post('/api/generate/gemini', async (req, res) => {
  console.log('\n🎨 Gemini 2.5 Flash Image generation request received...');

  try {
    const { prompts } = req.body;

    if (!prompts || !Array.isArray(prompts)) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }

    console.log(`📝 Generating ${prompts.length} images with Gemini 2.5 Flash Image ($15 FREE credits!)...`);

    const images = [];

    for (let i = 0; i < prompts.length; i++) {
      console.log(`Generating image ${i + 1}/${prompts.length}...`);

      try {
        // Add "no text, no numbers" to prompt
        const enhancedPrompt = `${prompts[i]}, no text, no numbers, no letters, no signs`;

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: enhancedPrompt
              }]
            }],
            generationConfig: {
              response_modalities: ['IMAGE'], // Only generate images, no text
              image_config: {
                aspect_ratio: '16:9' // Full HD landscape
              }
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini API Error for image ${i + 1}:`, errorText);

          // If billing not enabled, give helpful error
          if (errorText.includes('billing') || errorText.includes('quota') || response.status === 403) {
            throw new Error('Gemini requires billing to be enabled. Please add a payment method at https://console.cloud.google.com/billing');
          }

          throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        // DEBUG: Log the full response to understand structure
        console.log(`🔍 DEBUG - Gemini response for image ${i + 1}:`, JSON.stringify(data, null, 2));

        // Gemini 2.5 returns image in candidates[0].content.parts[].inlineData (camelCase!)
        let imageBase64 = null;
        if (data.candidates && data.candidates[0]?.content?.parts) {
          console.log(`📦 Found ${data.candidates[0].content.parts.length} parts in response`);
          for (const part of data.candidates[0].content.parts) {
            console.log(`🔧 Part type:`, Object.keys(part));
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
              imageBase64 = part.inlineData.data;
              console.log(`✅ Found image! MIME type: ${part.inlineData.mimeType}, Data length: ${imageBase64?.length || 0}`);
              break;
            }
          }
        } else {
          console.error(`❌ Response structure unexpected:`, {
            hasCandidates: !!data.candidates,
            candidatesLength: data.candidates?.length,
            hasContent: !!data.candidates?.[0]?.content,
            hasParts: !!data.candidates?.[0]?.content?.parts
          });
        }

        if (imageBase64) {
          images.push({
            image: `data:image/png;base64,${imageBase64}`,
            prompt: prompts[i]
          });
          console.log(`✅ Image ${i + 1}/${prompts.length} generated successfully`);
        } else {
          console.error(`❌ No image data found in response for image ${i + 1}`);
          throw new Error('No image data in Gemini response');
        }

        // Rate limit: wait 1 second between requests to avoid quota errors
        if (i < prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`Error generating image ${i + 1}:`, error.message);
        // Return a placeholder or skip
        images.push({
          image: null,
          prompt: prompts[i],
          error: error.message
        });
      }
    }

    const successCount = images.filter(img => img.image).length;
    console.log(`✅ Generated ${successCount}/${prompts.length} images with Gemini 2.5 Flash`);

    res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (error) {
    console.error('❌ Gemini generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate images with Stability AI (STABLE & RELIABLE!)
app.post('/api/generate/stability', async (req, res) => {
  console.log('\n🎨 Stability AI image generation request received...');

  try {
    const { prompts } = req.body;

    if (!prompts || !Array.isArray(prompts)) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }

    console.log(`📝 Generating ${prompts.length} images with Stability AI SD3...`);
    console.log('⚡ Stable, fast, and high quality generation!');

    const images = [];

    // Generate images sequentially to control costs
    for (let i = 0; i < prompts.length; i++) {
      console.log(`🎨 Generating image ${i + 1}/${prompts.length}...`);

      try {
        const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${STABILITY_API_KEY}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            text_prompts: [
              {
                text: prompts[i] + ", vibrant colors, full color, colorful, rich color palette, warm colors, orange lighting, dramatic colors, no text, no letters, no numbers, no typography, no words, highly detailed, sharp focus",
                weight: 1
              }
            ],
            cfg_scale: 7,
            height: 768,
            width: 1344,
            samples: 1,
            steps: 30
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Stability AI API Error for image ${i + 1}:`, errorText);

          if (errorText.includes('credit') || errorText.includes('balance') || response.status === 402) {
            throw new Error('Insufficient Stability AI credits. Please add credits at platform.stability.ai');
          }

          throw new Error(`Stability AI API failed: ${response.status}`);
        }

        const data = await response.json();

        // Stability AI returns base64 image in artifacts array
        if (data.artifacts && data.artifacts.length > 0) {
          const imageBase64 = `data:image/png;base64,${data.artifacts[0].base64}`;

          // SAVE IMAGE LOCALLY so user can see it!
          const imageFileName = `stability_${Date.now()}_${i.toString().padStart(2, '0')}.png`;
          const imagePath = path.join('/home/claude', 'generated_images', imageFileName);

          // Create directory if it doesn't exist
          const imageDir = path.dirname(imagePath);
          if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
          }

          // Save base64 image to file
          const imageData = data.artifacts[0].base64;
          fs.writeFileSync(imagePath, Buffer.from(imageData, 'base64'));
          console.log(`💾 Saved image locally: ${imagePath}`);

          images.push({
            image: imageBase64,
            prompt: prompts[i],
            localPath: imagePath
          });
          console.log(`✅ Image ${i + 1}/${prompts.length} generated successfully`);
        } else {
          throw new Error('No image data in Stability AI response');
        }

        // Small delay between requests (1s) for politeness
        if (i < prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ Error generating image ${i + 1}:`, error.message);
        images.push({
          image: null,
          prompt: prompts[i],
          error: error.message
        });
      }
    }

    const successCount = images.filter(img => img.image).length;
    console.log(`🎉 Generated ${successCount}/${prompts.length} images with Stability AI!`);

    if (successCount === 0) {
      throw new Error('Failed to generate any images with Stability AI');
    }

    res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (error) {
    console.error('❌ Stability AI generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate images with Fal.ai Flux Pro (FAST & BUDGET OPTIMIZED!)
app.post('/api/generate/fal', async (req, res) => {
  console.log('\n🎨 Fal.ai Flux Schnell image generation request received...');

  try {
    const { prompts } = req.body;

    if (!prompts || !Array.isArray(prompts)) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }

    console.log(`📝 Generating ${prompts.length} images with Fal.ai Flux Schnell...`);
    console.log('💰 BUDGET MODE: Generating at 1024x1024 (1MP pricing) then scaling to 1920x1080!');

    const images = [];

    // Generate images sequentially to control costs and avoid rate limits
    for (let i = 0; i < prompts.length; i++) {
      console.log(`🎨 Generating image ${i + 1}/${prompts.length}...`);

      try {
        // Add "no text, no numbers" to prompt
        const enhancedPrompt = `${prompts[i]}, no text, no numbers, no letters, no signs`;

        const response = await fetch(FAL_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: enhancedPrompt,
            image_size: {
              width: 1024,
              height: 1024
            },
            num_inference_steps: 4,
            guidance_scale: 3.5,
            num_images: 1,
            enable_safety_checker: false,
            output_format: 'png'
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Fal.ai API Error for image ${i + 1}:`, errorText);

          if (errorText.includes('credit') || errorText.includes('balance')) {
            throw new Error('Insufficient Fal.ai credits. Please add credits at https://fal.ai/dashboard/billing');
          }

          throw new Error(`Fal.ai API failed: ${response.status}`);
        }

        const data = await response.json();

        // Fal.ai returns image URL in images array
        if (data.images && data.images.length > 0) {
          const imageUrl = data.images[0].url;
          images.push({
            image: imageUrl,
            prompt: prompts[i]
          });
          console.log(`✅ Image ${i + 1}/${prompts.length} generated (1024x1024 - will scale to 1920x1080)`);
        } else {
          throw new Error('No image data in Fal.ai response');
        }

        // Small delay between requests (1s) for politeness
        if (i < prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ Error generating image ${i + 1}:`, error.message);
        images.push({
          image: null,
          prompt: prompts[i],
          error: error.message
        });
      }
    }

    const successCount = images.filter(img => img.image).length;
    console.log(`🎉 Generated ${successCount}/${prompts.length} images at 1024x1024!`);
    console.log(`💰 Cost saved: ~50% by using 1MP pricing + ffmpeg scaling!`);

    if (successCount === 0) {
      throw new Error('Failed to generate any images with Fal.ai');
    }

    res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (error) {
    console.error('❌ Fal.ai generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate images with Pollinations (SMART SEMI-PARALLEL for speed!)
app.post('/api/generate/pollinations', async (req, res) => {
  console.log('\n🎨 Pollinations image generation request received...');

  try {
    const { prompts } = req.body;

    if (!prompts || !Array.isArray(prompts)) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }

    console.log(`📝 Generating ${prompts.length} images with SMART BATCHING...`);
    console.log('⚡ Using semi-parallel batches with SMART SKIP - failed images will be skipped after 5 attempts!');

    // Helper function to generate single image with SMART retry (max 5, then SKIP)
    async function generateImageWithRetry(prompt, index, maxRetries = 5) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Add "no text, no numbers" to prompt
          const enhancedPrompt = `${prompt}, no text, no numbers, no letters, no signs`;
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&nologo=true&enhance=true&seed=${Date.now() + index + attempt}`;

          // Quick HEAD check to verify URL works
          const response = await fetch(imageUrl, {
            method: 'HEAD',
            timeout: 10000 // 10 second timeout per attempt
          });

          if (response.ok) {
            console.log(`✅ Image ${index + 1} generated successfully on attempt ${attempt}`);
            return {
              image: imageUrl,
              prompt: prompt
            };
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } catch (error) {
          if (attempt < maxRetries) {
            const waitTime = 2000; // Fixed 2s between attempts
            console.log(`⚠️ Image ${index + 1} attempt ${attempt}/${maxRetries} failed, retrying in 2s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.error(`❌ Image ${index + 1} SKIPPED after ${maxRetries} failed attempts - continuing with next image`);
            return null; // SKIP this image completely
          }
        }
      }
    }

    // Generate in smaller batches (2 images at a time) with longer delays
    const BATCH_SIZE = 2;
    const images = [];

    for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, prompts.length);
      const batchPrompts = prompts.slice(i, batchEnd);

      console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}: images ${i + 1}-${batchEnd}...`);

      // Generate batch in parallel
      const batchPromises = batchPrompts.map((prompt, batchIndex) =>
        generateImageWithRetry(prompt, i + batchIndex)
      );

      const batchResults = await Promise.all(batchPromises);

      // Filter out nulls (skipped images) and add successful ones
      const successfulImages = batchResults.filter(result => result !== null);
      images.push(...successfulImages);

      const successInBatch = successfulImages.length;
      const failedInBatch = batchResults.length - successInBatch;
      console.log(`✅ Batch complete: ${successInBatch} successful, ${failedInBatch} skipped`);

      // Longer delay between batches (3 seconds)
      if (batchEnd < prompts.length) {
        console.log('⏳ Waiting 3s before next batch...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const successCount = images.filter(img => img.image).length;
    const totalAttempted = prompts.length;
    const skippedCount = totalAttempted - successCount;

    console.log(`🎉 Generation complete: ${successCount}/${totalAttempted} successful, ${skippedCount} skipped`);

    if (successCount === 0) {
      throw new Error('Failed to generate ANY images. Pollinations.ai may be completely down. Try again later.');
    }

    if (successCount < totalAttempted * 0.5) {
      console.warn(`⚠️ Warning: Only ${Math.round(successCount/totalAttempted*100)}% success rate. Video quality may be affected.`);
    }

    res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (error) {
    console.error('❌ Pollinations generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download thumbnail and serve locally (handles both URLs and base64)
app.post('/api/download-thumbnail', async (req, res) => {
  console.log('\n🖼️ Thumbnail download request received...');

  try {
    const { imageUrl, filename } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    // Create thumbnails directory if it doesn't exist
    const thumbnailsDir = path.join('/home/claude', 'thumbnails');
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }

    const localFilename = filename || `thumbnail-${Date.now()}.png`;
    const localPath = path.join(thumbnailsDir, localFilename);

    if (imageUrl.startsWith('data:image')) {
      // Handle base64 images (from Stability AI, etc.)
      console.log(`💾 Saving base64 image locally...`);

      const imageData = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      await writeFile(localPath, Buffer.from(imageData, 'base64'));

      console.log(`✅ Base64 thumbnail saved: ${localPath}`);
    } else {
      // Handle URL images (from Fal.ai, Pollinations, etc.)
      console.log(`📥 Downloading thumbnail from: ${imageUrl}`);

      const imageResponse = await fetch(imageUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`);
      }

      const imageBuffer = await imageResponse.buffer();
      await writeFile(localPath, imageBuffer);

      console.log(`✅ URL thumbnail downloaded: ${localPath}`);
    }

    // Return local URL
    const localUrl = `http://localhost:3000/thumbnails/${localFilename}`;

    res.json({
      success: true,
      localUrl: localUrl,
      filename: localFilename
    });

  } catch (error) {
    console.error('❌ Thumbnail download error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve thumbnails statically
app.use('/thumbnails', express.static(path.join('/home/claude', 'thumbnails')));

// Parse script and generate image prompts
app.post('/api/parse-script', async (req, res) => {
  console.log('\n📄 Script parsing request received...');

  try {
    let { script, targetImageCount } = req.body;

    if (!script) {
      return res.status(400).json({ error: 'Script is required' });
    }

    const originalLength = script.length;

    // TRUNCATE LARGE SCRIPTS TO PREVENT PAYLOAD ERRORS
    const maxScriptLength = 10000; // 10k chars max - RADICAL FIX
    if (script.length > maxScriptLength) {
      console.log(`⚠️ Script too large (${script.length} chars), truncating to ${maxScriptLength} chars`);
      script = script.substring(0, maxScriptLength);

      // Find last sentence boundary for clean cut
      const lastSentenceEnd = Math.max(
        script.lastIndexOf('.'),
        script.lastIndexOf('!'),
        script.lastIndexOf('?')
      );

      if (lastSentenceEnd > maxScriptLength * 0.8) {
        script = script.substring(0, lastSentenceEnd + 1);
      }

      console.log(`📝 Truncated from ${originalLength} to ${script.length} characters`);
    }

    console.log(`📝 Processing script: ${script.length} characters`);
    console.log(`🎯 Target images: ${targetImageCount || 30}`);

    // Extract scene descriptions
    let sceneDescriptions = parseScriptForScenes(script);

    console.log(`✅ Found ${sceneDescriptions.length} scenes`);

    // If we have fewer scenes than needed, repeat/interpolate
    const target = targetImageCount || 30;
    if (sceneDescriptions.length < target) {
      console.log(`⚠️ Only ${sceneDescriptions.length} scenes found, need ${target}. Repeating scenes...`);
      const repeats = Math.ceil(target / sceneDescriptions.length);
      const expanded = [];
      for (let i = 0; i < repeats; i++) {
        expanded.push(...sceneDescriptions);
      }
      sceneDescriptions = expanded.slice(0, target);
    } else if (sceneDescriptions.length > target) {
      // Take evenly spaced scenes
      const step = sceneDescriptions.length / target;
      sceneDescriptions = Array.from({ length: target }, (_, i) =>
        sceneDescriptions[Math.floor(i * step)]
      );
    }

    // Convert to EC Comics horror style prompts
    const imagePrompts = convertToImagePrompts(sceneDescriptions);

    console.log(`✅ Generated ${imagePrompts.length} image prompts`);

    res.json({
      success: true,
      prompts: imagePrompts,
      count: imagePrompts.length
    });

  } catch (error) {
    console.error('❌ Script parsing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create video with effects and audio
app.post('/api/create-video', async (req, res) => {
  console.log('\n🎬 Video creation request received...');

  try {
    const { images, effects: imageEffects, audioBase64, imageInterval, audioDuration } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Images array is required' });
    }

    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    console.log(`📊 Processing ${images.length} images with ${imageInterval}s interval`);
    console.log(`🎵 AUDIO DURATION RECEIVED: ${audioDuration} seconds (${(audioDuration / 60).toFixed(1)} minutes)`);

    if (!audioDuration || audioDuration <= 0) {
      throw new Error(`Invalid audio duration: ${audioDuration}. Cannot create video.`);
    }

    // DUPLICATE IMAGES x2 but KEEP SAME TOTAL VIDEO DURATION
    const originalCount = images.length;
    const duplicatedImages = [...images, ...images]; // x2 duplication

    // CRITICAL: Adjust interval so total duration = audio duration
    const adjustedInterval = audioDuration / duplicatedImages.length;

    console.log(`🔄 Image distribution:`);
    console.log(`   Original: ${originalCount} images`);
    console.log(`   Duplicated: ${duplicatedImages.length} images`);
    console.log(`   Audio duration: ${audioDuration}s (${(audioDuration / 60).toFixed(1)} min)`);
    console.log(`   Interval per image: ${adjustedInterval.toFixed(1)}s (was ${imageInterval}s)`);
    console.log(`   Total video duration: ${adjustedInterval * duplicatedImages.length}s = ${audioDuration}s ✅`);

    // Also duplicate effects array to match
    const originalEffects = imageEffects || [];
    const duplicatedEffects = [...originalEffects, ...originalEffects];
    while (duplicatedEffects.length < duplicatedImages.length) {
      duplicatedEffects.push(duplicatedEffects[duplicatedEffects.length % originalEffects.length] || 'zoomIn');
    }

    const sessionId = Date.now();
    const sessionDir = path.join(tempDir, `session_${sessionId}`);
    await mkdir(sessionDir, { recursive: true });

    // Save audio file
    console.log('💾 Saving audio file...');
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      throw new Error('Invalid audio data format');
    }
    const audioData = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
    const audioPath = path.join(sessionDir, 'audio.mp3');
    await writeFile(audioPath, Buffer.from(audioData, 'base64'));

    // Download and save all images
    console.log('💾 Downloading and saving images...');
    const imagePaths = [];
    for (let i = 0; i < duplicatedImages.length; i++) {
      if (!duplicatedImages[i] || typeof duplicatedImages[i] !== 'string') {
        console.error(`⚠️ Image ${i} is invalid (not a string), skipping...`);
        continue;
      }

      const imagePath = path.join(sessionDir, `image_${i.toString().padStart(4, '0')}.png`);

      try {
        // Check if image is URL or base64
        if (duplicatedImages[i].startsWith('http://') || duplicatedImages[i].startsWith('https://')) {
          // Download image from URL
          console.log(`📥 Downloading image ${i+1}/${duplicatedImages.length} from URL...`);

          const imageResponse = await fetch(duplicatedImages[i], {
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (!imageResponse.ok) {
            console.error(`⚠️ Failed to download image ${i}: HTTP ${imageResponse.status}`);
            continue;
          }

          const imageBuffer = await imageResponse.buffer();

          // Verify it's actually image data
          if (imageBuffer.length < 1000) {
            console.error(`⚠️ Image ${i} is too small (${imageBuffer.length} bytes), probably invalid`);
            continue;
          }

          await writeFile(imagePath, imageBuffer);
          console.log(`✅ Image ${i+1} downloaded: ${imageBuffer.length} bytes`);
        } else if (duplicatedImages[i].startsWith('data:image')) {
          // Assume base64 format
          const imageData = duplicatedImages[i].replace(/^data:image\/\w+;base64,/, '');
          await writeFile(imagePath, Buffer.from(imageData, 'base64'));
          console.log(`✅ Image ${i+1} saved from base64`);
        } else {
          console.error(`⚠️ Image ${i} has unknown format, skipping...`);
          continue;
        }

        imagePaths.push(imagePath);
      } catch (error) {
        console.error(`❌ Error processing image ${i}:`, error.message);
        continue;
      }
    }

    if (imagePaths.length === 0) {
      throw new Error('No valid images could be processed');
    }

    console.log(`✅ Saved ${imagePaths.length} images successfully`);

    // Create video segments with effects
    console.log('🎨 Creating video segments with effects...');
    const segmentPaths = [];

    for (let i = 0; i < imagePaths.length; i++) {
      const effect = duplicatedEffects[i] || 'zoomIn';
      const segmentPath = path.join(sessionDir, `segment_${i.toString().padStart(4, '0')}.mp4`);

      const progressPercent = Math.round(((i + 1) / imagePaths.length) * 100);
      console.log(`🎬 Creating segment ${i + 1}/${imagePaths.length} (${progressPercent}%) with effect: ${effect}...`);

      // BREATHING ZOOM EFFECT - PERFECTLY CENTERED, ZERO MOVEMENT!
      // Scale to 1920x1080, then zoom in center ONLY (NO PAN!)
      const FPS = 24; // MUST match fps in filter!
      const totalFrames = adjustedInterval * FPS;
      const midFrame = totalFrames / 2;

      let filter = '';

      if (effect === 'zoomIn') {
        // WOBBLE-PROOF ZOOM IN/OUT - floor() prevents sub-pixel jitter
        // Always anchored to EXACT center, only scale changes, position NEVER changes
        filter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(iw-1920)/2:(ih-1080)/2,zoompan=z='if(lte(on,${midFrame}),1.0+0.03*on/${midFrame},1.03-0.03*(on-${midFrame})/${midFrame})':x='floor((iw-iw/zoom)/2)':y='floor((ih-ih/zoom)/2)':d=${totalFrames}:s=1920x1080:fps=${FPS},noise=alls=30:allf=t+u`;
      } else {
        // WOBBLE-PROOF ZOOM OUT/IN - floor() prevents sub-pixel jitter
        filter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(iw-1920)/2:(ih-1080)/2,zoompan=z='if(lte(on,${midFrame}),1.03-0.03*on/${midFrame},1.0+0.03*(on-${midFrame})/${midFrame})':x='floor((iw-iw/zoom)/2)':y='floor((ih-ih/zoom)/2)':d=${totalFrames}:s=1920x1080:fps=${FPS},noise=alls=30:allf=t+u`;
      }

      // Create segment with effect - ULTRAFAST for SPEED!
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-loop', '1',
          '-i', imagePaths[i],
          '-vf', filter,
          '-t', adjustedInterval.toString(),
          '-c:v', 'libx264',
          '-preset', 'ultrafast', // MUCH faster encoding!
          '-crf', '28', // Slightly lower quality for speed
          '-pix_fmt', 'yuv420p',
          '-y',
          segmentPath
        ]);

        let errorOutput = '';

        ffmpeg.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log(`✅ Segment ${i + 1}/${imagePaths.length} completed (${progressPercent}%)`);
            resolve();
          } else {
            reject(new Error(`FFmpeg failed for segment ${i}: ${errorOutput}`));
          }
        });
      });

      segmentPaths.push(segmentPath);
    }

    // Create concat file for ffmpeg
    console.log('📝 Creating concat file...');
    const concatPath = path.join(sessionDir, 'concat.txt');
    const concatContent = segmentPaths.map(p => `file '${path.basename(p)}'`).join('\n');
    await writeFile(concatPath, concatContent);

    // Concatenate all segments
    console.log('🔗 Concatenating video segments...');
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
          console.log('✅ Video segments concatenated');
          resolve();
        } else {
          reject(new Error(`FFmpeg concat failed with code ${code}`));
        }
      });
    });

    // Merge video with audio and add atmospheric effects
    console.log('🎵 Merging video with audio and adding atmospheric effects...');
    const finalVideoPath = path.join(sessionDir, 'final_video.mp4');

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoOnlyPath,
        '-i', audioPath,
        '-filter_complex',
        `[0:v]noise=alls=40:allf=t+u,eq=brightness=0.02:contrast=1.08:saturation=0.90[vout]`,
        '-map', '[vout]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '26',
        '-c:a', 'aac',
        '-b:a', '128k',
        // DO NOT use -shortest! Video duration should match audio exactly from calculation
        '-y',
        finalVideoPath
      ]);

      let ffmpegError = '';
      let ffmpegOutput = '';

      // Capture stderr for errors
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        ffmpegError += output;
        // Log progress every 10 lines to avoid spam
        if (ffmpegError.split('\n').length % 10 === 0) {
          console.log('📊 FFmpeg progress...');
        }
      });

      // Capture stdout
      ffmpeg.stdout.on('data', (data) => {
        ffmpegOutput += data.toString();
      });

      // Handle errors
      ffmpeg.on('error', (err) => {
        console.error('❌ FFmpeg spawn error:', err.message);
        reject(new Error(`FFmpeg spawn failed: ${err.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Audio merged with video + atmospheric effects added');
          resolve();
        } else {
          console.error('❌ FFmpeg stderr:', ffmpegError.slice(-500)); // Last 500 chars
          reject(new Error(`FFmpeg merge failed with code ${code}. Check logs above.`));
        }
      });

      // Add 60-minute timeout for very long videos (50+ min audio)
      setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        reject(new Error('FFmpeg timeout after 60 minutes'));
      }, 3600000);
    });

    // Move final video to accessible location
    console.log('📤 Preparing final video for download...');
    const publicVideoName = `video_${sessionId}.mp4`;
    const publicVideoPath = path.join(tempDir, publicVideoName);
    fs.copyFileSync(finalVideoPath, publicVideoPath);

    const videoUrl = `http://localhost:3000/temp/${publicVideoName}`;

    // Clean up session folder (but keep the public video)
    console.log('🧹 Cleaning up temporary files...');
    setTimeout(() => {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log('✅ Cleanup complete');
      } catch (err) {
        console.error('Cleanup error:', err.message);
      }
    }, 5000);

    // Delete public video after 1 hour
    setTimeout(() => {
      try {
        if (fs.existsSync(publicVideoPath)) {
          fs.unlinkSync(publicVideoPath);
          console.log(`🗑️ Deleted old video: ${publicVideoName}`);
        }
      } catch (err) {
        console.error('Error deleting old video:', err.message);
      }
    }, 3600000);

    console.log('🎉 Video creation complete!\n');

    res.json({
      success: true,
      videoUrl: videoUrl,
      message: 'Video created successfully with effects and audio!'
    });

  } catch (error) {
    console.error('❌ Video creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// FILE UPLOAD ENDPOINTS
// ============================================================

// Upload images (supports multiple files)
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
    console.error('❌ Image upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload audio file
app.post('/api/upload-audio', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const audioPath = `/temp/uploads/${path.basename(req.file.path)}`;

    console.log(`✅ Uploaded audio: ${req.file.originalname} (${req.file.size} bytes)`);

    res.json({
      success: true,
      audioPath: audioPath,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('❌ Audio upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ASYNC VIDEO GENERATION ENDPOINTS
// ============================================================

// Start async video generation
app.post('/api/create-video-async', async (req, res) => {
  console.log('\n🎬 ASYNC video creation request received...');

  try {
    // Create job
    const jobId = createJob(req.body);

    // Return job ID immediately
    res.json({
      success: true,
      jobId: jobId,
      message: 'Video generation started. Use /api/job-status/:jobId to check progress.'
    });

    // Start processing in background (don't await!)
    processVideoJob(jobId).catch(err => {
      console.error(`❌ Job ${jobId} failed:`, err);
      updateJobStatus(jobId, {
        status: 'failed',
        error: err.message
      });
    });

  } catch (error) {
    console.error('❌ Error creating job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check job status
app.get('/api/job-status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found'
    });
  }

  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      videoUrl: job.videoUrl,
      error: job.error
    }
  });
});

// Background video processing function
async function processVideoJob(jobId) {
  const job = getJob(jobId);
  if (!job) {
    throw new Error('Job not found');
  }

  updateJobStatus(jobId, { status: 'processing', progress: 5 });

  const { images, effects: imageEffects, audioBase64, imageInterval, audioDuration } = job.data;

  if (!images || !Array.isArray(images) || images.length === 0) {
    throw new Error('Images array is required');
  }

  if (!audioBase64) {
    throw new Error('Audio file is required');
  }

  console.log(`📊 Job ${jobId}: Processing ${images.length} images with ${imageInterval}s interval`);

  // DUPLICATE IMAGES x2 but KEEP SAME TOTAL VIDEO DURATION
  const originalCount = images.length;
  const duplicatedImages = [...images, ...images]; // x2 duplication

  // CRITICAL: Adjust interval so total duration = audio duration
  const adjustedInterval = audioDuration / duplicatedImages.length;

  console.log(`🔄 Image distribution:`);
  console.log(`   Original: ${originalCount} images`);
  console.log(`   Duplicated: ${duplicatedImages.length} images`);
  console.log(`   Audio duration: ${audioDuration}s`);
  console.log(`   Interval per image: ${adjustedInterval.toFixed(1)}s (was ${imageInterval}s)`);

  // Also duplicate effects array to match
  const originalEffects = imageEffects || [];
  const duplicatedEffects = [...originalEffects, ...originalEffects];
  while (duplicatedEffects.length < duplicatedImages.length) {
    duplicatedEffects.push(duplicatedEffects[duplicatedEffects.length % originalEffects.length] || 'zoomIn');
  }

  const sessionId = Date.now();
  const sessionDir = path.join(tempDir, `session_${sessionId}`);
  await mkdir(sessionDir, { recursive: true });

  updateJobStatus(jobId, { progress: 10 });

  // Save audio file (support both file paths and base64)
  console.log('💾 Preparing audio file...');
  let audioPath;

  if (audioBase64.startsWith('/temp/')) {
    // Audio is already uploaded as file - use it directly
    audioPath = path.join(__dirname, audioBase64);
    console.log(`✅ Using uploaded audio file: ${audioBase64}`);
  } else {
    // Audio is base64 - decode and save
    const audioData = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
    audioPath = path.join(sessionDir, 'audio.mp3');
    await writeFile(audioPath, Buffer.from(audioData, 'base64'));
    console.log(`✅ Decoded base64 audio to: ${audioPath}`);
  }

  updateJobStatus(jobId, { progress: 15 });

  // Download and save all images
  console.log('💾 Downloading and saving images...');
  const imagePaths = [];
  for (let i = 0; i < duplicatedImages.length; i++) {
    if (!duplicatedImages[i] || typeof duplicatedImages[i] !== 'string') {
      console.error(`⚠️ Image ${i} is invalid (not a string), skipping...`);
      continue;
    }

    const imagePath = path.join(sessionDir, `image_${i.toString().padStart(4, '0')}.png`);

    try {
      // Check if image is file path, URL, or base64
      if (duplicatedImages[i].startsWith('/temp/')) {
        // Image is already uploaded as file - copy it to session dir
        const sourcePath = path.join(__dirname, duplicatedImages[i]);
        const imageBuffer = fs.readFileSync(sourcePath);
        await writeFile(imagePath, imageBuffer);
        console.log(`✅ Copied uploaded image ${i+1} from ${duplicatedImages[i]}`);

      } else if (duplicatedImages[i].startsWith('http://') || duplicatedImages[i].startsWith('https://')) {
        // Download image from URL
        const imageResponse = await fetch(duplicatedImages[i], {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!imageResponse.ok) {
          console.error(`⚠️ Failed to download image ${i}: HTTP ${imageResponse.status}`);
          continue;
        }

        const imageBuffer = await imageResponse.buffer();

        if (imageBuffer.length < 1000) {
          console.error(`⚠️ Image ${i} is too small (${imageBuffer.length} bytes), probably invalid`);
          continue;
        }

        await writeFile(imagePath, imageBuffer);
      } else if (duplicatedImages[i].startsWith('data:image')) {
        const imageData = duplicatedImages[i].replace(/^data:image\/\w+;base64,/, '');
        await writeFile(imagePath, Buffer.from(imageData, 'base64'));
      } else {
        console.error(`⚠️ Image ${i} has unknown format, skipping...`);
        continue;
      }

      imagePaths.push(imagePath);

      // Update progress (15% to 30% for image downloading)
      const downloadProgress = 15 + Math.round((i / duplicatedImages.length) * 15);
      updateJobStatus(jobId, { progress: downloadProgress });
    } catch (error) {
      console.error(`❌ Error processing image ${i}:`, error.message);
      continue;
    }
  }

  if (imagePaths.length === 0) {
    throw new Error('No valid images could be processed');
  }

  console.log(`✅ Saved ${imagePaths.length} images successfully`);
  updateJobStatus(jobId, { progress: 30 });

  // Create video segments with effects
  console.log('🎨 Creating video segments with effects...');
  const segmentPaths = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const effect = duplicatedEffects[i] || 'zoomIn';
    const segmentPath = path.join(sessionDir, `segment_${i.toString().padStart(4, '0')}.mp4`);

    const totalFrames = adjustedInterval * 24;
    const midFrame = totalFrames / 2;

    let filter = '';

    if (effect === 'zoomIn') {
      // SUBTLE ZOOM IN - 1.0 to 1.03x (3% zoom) + PARTICLES - CENTERED, NO PAN!
      filter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='if(lte(on,${midFrame}),1.0+0.03*on/${midFrame},1.03-0.03*(on-${midFrame})/${midFrame})':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${totalFrames}:s=1920x1080:fps=20,noise=alls=3:allf=t:c0s=10:c0f=a`;
    } else {
      // SUBTLE ZOOM OUT - 1.03 to 1.0x (3% zoom) + PARTICLES - CENTERED, NO PAN!
      filter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='if(lte(on,${midFrame}),1.03-0.03*on/${midFrame},1.0+0.03*(on-${midFrame})/${midFrame})':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${totalFrames}:s=1920x1080:fps=20,noise=alls=3:allf=t:c0s=10:c0f=a`;
    }

    // Create segment with effect - ULTRAFAST for SPEED!
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-loop', '1',
        '-i', imagePaths[i],
        '-vf', filter,
        '-t', adjustedInterval.toString(),
        '-c:v', 'libx264',
        '-preset', 'ultrafast', // MUCH faster encoding!
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-y',
        segmentPath
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed for segment ${i}: ${errorOutput}`));
        }
      });
    });

    segmentPaths.push(segmentPath);

    // Update progress (30% to 70% for segment creation)
    const segmentProgress = 30 + Math.round((i / imagePaths.length) * 40);
    updateJobStatus(jobId, { progress: segmentProgress });
  }

  updateJobStatus(jobId, { progress: 70 });

  // Create concat file for ffmpeg
  console.log('📝 Creating concat file...');
  const concatPath = path.join(sessionDir, 'concat.txt');
  const concatContent = segmentPaths.map(p => `file '${path.basename(p)}'`).join('\n');
  await writeFile(concatPath, concatContent);

  // Concatenate all segments
  console.log('🔗 Concatenating video segments...');
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
        console.log('✅ Video segments concatenated');
        resolve();
      } else {
        reject(new Error(`FFmpeg concat failed with code ${code}`));
      }
    });
  });

  updateJobStatus(jobId, { progress: 80 });

  // Merge video with audio and add atmospheric effects
  console.log('🎵 Merging video with audio and adding atmospheric effects...');
  const finalVideoPath = path.join(sessionDir, 'final_video.mp4');

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoOnlyPath,
      '-i', audioPath,
      '-filter_complex',
      `[0:v]noise=alls=10:allf=t+u,eq=brightness=0.02:contrast=1.05:saturation=0.95[vout]`,
      '-map', '[vout]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '26',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-y',
      finalVideoPath
    ]);

    let ffmpegError = '';
    let ffmpegOutput = '';
    let progressCounter = 0;

    // Capture stderr for errors AND progress
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      ffmpegError += output;
      progressCounter++;
      // Log progress every 20 lines to show it's working
      if (progressCounter % 20 === 0) {
        console.log(`📊 FFmpeg audio merge progress... (${progressCounter} updates)`);
      }
    });

    // Capture stdout
    ffmpeg.stdout.on('data', (data) => {
      ffmpegOutput += data.toString();
    });

    // Handle spawn errors
    ffmpeg.on('error', (err) => {
      console.error('❌ FFmpeg spawn error:', err.message);
      console.error('❌ Is ffmpeg in PATH? Try running: ffmpeg -version');
      reject(new Error(`FFmpeg spawn failed: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Audio merged with video + atmospheric effects added');
        resolve();
      } else {
        console.error('❌ FFmpeg merge FAILED!');
        console.error('❌ Exit code:', code);
        console.error('❌ Last 1000 chars of stderr:', ffmpegError.slice(-1000));
        reject(new Error(`FFmpeg merge failed with code ${code}. Check logs above for details.`));
      }
    });

    // Add 60-minute timeout for very long videos (50+ min audio)
    const timeout = setTimeout(() => {
      console.error('⏱️ FFmpeg timeout after 60 minutes - killing process');
      ffmpeg.kill('SIGKILL');
      reject(new Error('FFmpeg timeout after 60 minutes'));
    }, 3600000);

    // Clear timeout if process finishes
    ffmpeg.on('close', () => clearTimeout(timeout));
  });

  updateJobStatus(jobId, { progress: 90 });

  // Move final video to accessible location
  console.log('📤 Preparing final video for download...');
  const publicVideoName = `video_${sessionId}.mp4`;
  const publicVideoPath = path.join(tempDir, publicVideoName);
  fs.copyFileSync(finalVideoPath, publicVideoPath);

  const videoUrl = `/temp/${publicVideoName}`;

  // Clean up session folder (but keep the public video)
  console.log('🧹 Cleaning up temporary files...');
  setTimeout(() => {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('✅ Cleanup complete');
    } catch (err) {
      console.error('Cleanup error:', err.message);
    }
  }, 5000);

  // Delete public video after 2 hours
  setTimeout(() => {
    try {
      if (fs.existsSync(publicVideoPath)) {
        fs.unlinkSync(publicVideoPath);
        console.log(`🗑️ Deleted old video: ${publicVideoName}`);
      }
    } catch (err) {
      console.error('Error deleting old video:', err.message);
    }
  }, 2 * 3600000);

  // Mark job as completed
  updateJobStatus(jobId, {
    status: 'completed',
    progress: 100,
    videoUrl: videoUrl
  });

  console.log(`🎉 Job ${jobId} complete!\n`);
}

// ============================================================
// DESCRIPTION + TAGS GENERATOR
// ============================================================
app.post('/api/generate-description-tags', async (req, res) => {
  console.log('\n📝 Description + Tags generation request received...');

  try {
    const { title, script } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Create prompt for Groq
    const prompt = `You are a YouTube video SEO expert. Based on this BattleTech horror video, generate:

1. A compelling video description (2-3 paragraphs, 150-200 words)
2. 15-20 relevant tags for YouTube SEO

Video Title: ${title}

${script ? `Video Script (first 1000 chars):\n${script.substring(0, 1000)}...` : 'No script provided - use title only.'}

Format your response EXACTLY like this:

DESCRIPTION:
[Your description here - make it engaging, mention BattleTech universe, horror elements, and encourage viewers to like/subscribe]

TAGS:
tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10, tag11, tag12, tag13, tag14, tag15`;

    console.log('🤖 Calling Groq API for description + tags...');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          {
            role: 'system',
            content: 'You are a YouTube SEO expert specializing in BattleTech and horror content. Generate compelling descriptions and relevant tags.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    console.log('✅ Generated description + tags from Groq');

    // Parse the response
    const descriptionMatch = generatedText.match(/DESCRIPTION:\s*([\s\S]*?)\s*TAGS:/i);
    const tagsMatch = generatedText.match(/TAGS:\s*([\s\S]*?)$/i);

    const description = descriptionMatch ? descriptionMatch[1].trim() : generatedText;
    const tagsString = tagsMatch ? tagsMatch[1].trim() : '';
    const tags = tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    console.log(`📊 Generated: ${description.length} chars description, ${tags.length} tags`);

    res.json({
      success: true,
      description: description,
      tags: tags,
      tagsString: tags.join(', ')
    });

  } catch (error) {
    console.error('❌ Description + Tags generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 VIDEO GENERATOR SERVER PORNIT!');
  console.log('='.repeat(60));
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`✅ Health Check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Endpoints disponibile:');
  console.log('  POST /api/generate/pollinations - Generare cu Pollinations.ai');
  console.log('  POST /api/generate/gemini - Generare cu Google Gemini');
  console.log('');
  console.log('⚡ Server gata de request-uri!');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Server oprit. La revedere!');
  process.exit(0);
});
