const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

const app = express();
const PORT = 3000;

// Enable CORS for all origins
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Serve static files from temp directory
app.use('/temp', express.static(tempDir));

// Load environment variables
require('dotenv').config();

// GenAIPro configuration
const GENAIPRO_JWT = process.env.GENAIPRO_JWT || '';
const GENAIPRO_BASE_URL = 'https://genaipro.vn/api/v1';

// Google Gemini Imagen configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generate';

// Fal.ai configuration (Flux Schnell - FAST & CHEAP!)
const FAL_API_KEY = process.env.FAL_API_KEY || '';
const FAL_API_URL = 'https://fal.run/fal-ai/flux/schnell';

// Stability AI configuration (STABLE & RELIABLE!)
const STABILITY_API_KEY = process.env.STABILITY_API_KEY || '';
const STABILITY_API_URL = 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image';

// Groq configuration (FREE & FAST text generation!)
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
- Number each prompt (1., 2., 3., etc.)

FORMAT EXAMPLE:
1. 1950s EC Comics horror style: Atlas BattleMech stands in dimly lit maintenance bay, orange auxiliary lights casting dramatic shadows across damaged armor.

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

    // Load INSTRUCTIONS.txt for context
    const instructionsPath = path.join('/mnt/user-data/uploads', 'INSTRUCTIONS.txt');
    let instructions = '';
    try {
      if (fs.existsSync(instructionsPath)) {
        instructions = fs.readFileSync(instructionsPath, 'utf-8');
        console.log('✅ Loaded INSTRUCTIONS.txt for context');
      }
    } catch (err) {
      console.log('⚠️ Could not load INSTRUCTIONS.txt, using default guidelines');
    }

    // Build comprehensive prompt
    const systemPrompt = `You are a professional science fiction writer specializing in BattleTech horror stories in the style of 1950s EC Comics. You excel at creating detailed, atmospheric, long-form narratives with heavy emphasis on visual descriptions perfect for video adaptation.

ABSOLUTE REQUIREMENT: You MUST ALWAYS generate stories that reach or exceed the target word count. You are programmed to write comprehensive, detailed stories and NEVER produce short content when long content is requested. When asked for 5000+ words, you ALWAYS deliver 5000+ words without exception.

Your writing style is expansive, detailed, and thorough - you build rich atmospheric worlds through extensive descriptions, dialogue, and character development. You never rush or summarize.`;

    const userPrompt = `You MUST write a complete BattleTech horror story with these specifications:

**Title:** "${title}"
**MANDATORY Length:** ${targetWords} words (ABSOLUTE MINIMUM: ${Math.max(5000, Math.floor(targetWords * 0.9))} words - DO NOT GENERATE LESS!)

**CRITICAL LENGTH REQUIREMENTS - THIS IS MANDATORY:**
- NEVER stop before reaching the minimum word count
- This story MUST be extremely detailed and comprehensive
- You MUST write at least ${Math.max(5000, Math.floor(targetWords * 0.9))} words or more
- Keep writing until you reach the target length
- DO NOT summarize or rush - expand every scene extensively
- Include extensive dialogue, internal monologue, and detailed descriptions
- Build multiple subplot threads and character development
- VERIFY you've written enough before ending

**WORD COUNT VERIFICATION:**
- Opening section: MINIMUM 1000 words establishing setting and character
- Multiple development scenes: MINIMUM 800 words EACH (include at least 5 major scenes)
- Extended middle tension building: MINIMUM 2500 words
- Climactic sequence: MINIMUM 1500 words
- Resolution and ending: MINIMUM 700 words

**REQUIRED CONTENT:**
• First-person perspective from a MechWarrior or technician
• 1950s EC Comics horror aesthetic (Tales from the Crypt style)
• Dark, atmospheric, foreboding tone with tragic ending
• Heavy emphasis on VISUAL DESCRIPTIONS for each major scene

**EXTENSIVE STRUCTURE - ALL SECTIONS MANDATORY:**
• Detailed opening establishing setting and background (1000+ words)
• Character introduction and initial situation (800+ words)
• Discovery of the central horror element (1000+ words)
• Multiple escalating horror scenes (800+ words each, minimum 3 scenes)
• Investigation and attempt to understand the threat (1000+ words)
• Final confrontation and climax (1500+ words)
• Tragic resolution and consequences (700+ words)

Include specific BattleMech models, technical components, industrial environments, dramatic lighting effects, and extensive atmospheric details.

${instructions ? `**ADDITIONAL GUIDELINES:** ${instructions.substring(0, 1000)}` : ''}

CRITICAL: Write ONLY the story. You MUST reach AT LEAST ${Math.max(5000, Math.floor(targetWords * 0.9))} words. Continue writing until you hit this target. DO NOT STOP EARLY.`;

    // Call Groq API
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
        temperature: 0.8,
        max_tokens: Math.floor(targetWords * 3.5), // Much more tokens to ensure full generation
        top_p: 0.9,
        stream: false
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API Error:', errorText);
      throw new Error(`Groq API failed: ${groqResponse.status} - ${errorText}`);
    }

    const groqData = await groqResponse.json();

    if (!groqData.choices || groqData.choices.length === 0) {
      throw new Error('No content generated by Groq');
    }

    let generatedScript = groqData.choices[0].message.content;
    let actualWords = generatedScript.split(/\s+/).length;
    const minWords = Math.max(5000, Math.floor(targetWords * 0.8));

    // MULTI-SHOT GENERATION: Continue if story is too short or incomplete
    let attempts = 0;
    const maxAttempts = 2; // Reduced to avoid gigantic scripts

    while (actualWords < minWords && attempts < maxAttempts) {
      console.log(`📝 Story too short (${actualWords} words, need ${minWords}). Continuing generation... (attempt ${attempts + 1}/${maxAttempts})`);

      // Continue the story with a continuation prompt
      const continueResponse = await fetch(GROQ_API_URL, {
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
              content: `You are completing a BattleTech horror story. Write exactly ${Math.min(2000, minWords - actualWords)} words to finish this story properly with a satisfying conclusion. DO NOT write more than ${Math.min(2000, minWords - actualWords)} words.`
            },
            {
              role: 'user',
              content: `Complete this BattleTech horror story. Current story:\n\n${generatedScript.slice(-1000)}\n\nWrite exactly ${Math.min(2000, minWords - actualWords)} words to conclude this story. Provide a complete, satisfying ending.`
            }
          ],
          temperature: 0.8,
          max_tokens: Math.min(3000, Math.floor((minWords - actualWords) * 1.5)), // Cap tokens
          top_p: 0.9,
          stream: false
        })
      });

      if (continueResponse.ok) {
        const continueData = await continueResponse.json();
        if (continueData.choices && continueData.choices.length > 0) {
          const continuation = continueData.choices[0].message.content;
          generatedScript += continuation;
          actualWords = generatedScript.split(/\s+/).length;
          console.log(`📝 Continued story: now ${actualWords} words`);
        }
      }

      attempts++;
    }

    // Ensure script isn't too large for frontend processing
    const maxScriptSize = 50000; // 50k characters max
    if (generatedScript.length > maxScriptSize) {
      console.log(`⚠️ Script too large (${generatedScript.length} chars), truncating to ${maxScriptSize} chars`);
      generatedScript = generatedScript.substring(0, maxScriptSize) + "\n\n[Story continues but truncated for processing...]";
      actualWords = generatedScript.split(/\s+/).length;
    }

    console.log(`✅ Script generated: ${generatedScript.length} characters, ~${actualWords} words`);
    console.log(`🚀 Generated in ${groqData.usage?.total_time || 'unknown'} time`);

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
    const maxTextLength = 4000; // 4k characters max for TTS
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
    const maxAttempts = 120; // 2 minutes max (120 * 1 second)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const statusResponse = await fetch(`${GENAIPRO_BASE_URL}/labs/task/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${GENAIPRO_JWT}`
        }
      });

      if (!statusResponse.ok) {
        console.error('Failed to check task status');
        attempts++;
        continue;
      }

      taskStatus = await statusResponse.json();

      if (taskStatus.status === 'completed') {
        console.log('✅ Voiceover generation completed!');
        break;
      } else if (taskStatus.status === 'failed') {
        throw new Error('Task failed: ' + (taskStatus.error || 'Unknown error'));
      }

      attempts++;
      if (attempts % 5 === 0) {
        console.log(`⏳ Still processing... (${attempts}s elapsed)`);
      }
    }

    if (!taskStatus || taskStatus.status !== 'completed') {
      throw new Error('Task timeout - voiceover generation took too long');
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

// Generate images with Google Gemini Imagen
app.post('/api/generate/gemini', async (req, res) => {
  console.log('\n🎨 Gemini Imagen generation request received...');

  try {
    const { prompts } = req.body;

    if (!prompts || !Array.isArray(prompts)) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }

    console.log(`📝 Generating ${prompts.length} images with Gemini Imagen 3.0...`);

    const images = [];

    for (let i = 0; i < prompts.length; i++) {
      console.log(`Generating image ${i + 1}/${prompts.length}...`);

      try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: prompts[i],
            numberofImages: 1,
            aspectRatio: '16:9',
            safetySettings: [
              {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_ONLY_HIGH'
              },
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_ONLY_HIGH'
              }
            ]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini API Error for image ${i + 1}:`, errorText);

          // If billing not enabled, give helpful error
          if (errorText.includes('billing') || errorText.includes('quota') || response.status === 403) {
            throw new Error('Gemini Imagen requires billing to be enabled. Please add a payment method at https://console.cloud.google.com/billing');
          }

          throw new Error(`Gemini API failed: ${response.status}`);
        }

        const data = await response.json();

        // Gemini returns base64 image in generatedImages array
        if (data.generatedImages && data.generatedImages.length > 0) {
          const imageBase64 = data.generatedImages[0].imageData;
          images.push({
            image: `data:image/png;base64,${imageBase64}`,
            prompt: prompts[i]
          });
          console.log(`Image ${i + 1}/${prompts.length} generated successfully`);
        } else {
          throw new Error('No image data in Gemini response');
        }

        // Rate limit: wait 1 second between requests
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

    console.log(`✅ Generated ${images.filter(img => img.image).length}/${prompts.length} images with Gemini`);

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
        const response = await fetch(FAL_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: prompts[i],
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
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&enhance=true&seed=${Date.now() + index + attempt}`;

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
        if (images[i].startsWith('http://') || images[i].startsWith('https://')) {
          // Download image from URL
          console.log(`📥 Downloading image ${i+1}/${images.length} from URL...`);

          const imageResponse = await fetch(images[i], {
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
        } else if (images[i].startsWith('data:image')) {
          // Assume base64 format
          const imageData = images[i].replace(/^data:image\/\w+;base64,/, '');
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
      // Stability AI: 1280x720 (native 16:9) → scale to 1920x1080
      // Other providers: 1024x1024 → scale and crop
      const totalFrames = adjustedInterval * 24;
      const midFrame = totalFrames / 2;

      let filter = '';

      if (effect === 'zoomIn') {
        // PERFECTLY CENTERED - crop to exact 1920x1080, no black bars!
        filter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='if(lte(on,${midFrame}),1.0+0.25*on/${midFrame},1.25-0.25*(on-${midFrame})/${midFrame})':x=iw/2-(iw/zoom)/2:y=ih/2-(ih/zoom)/2:d=${totalFrames}:s=1920x1080:fps=24`;
      } else {
        // Alternative: 1.25 → 1.0 → 1.25
        filter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='if(lte(on,${midFrame}),1.25-0.25*on/${midFrame},1.0+0.25*(on-${midFrame})/${midFrame})':x=iw/2-(iw/zoom)/2:y=ih/2-(ih/zoom)/2:d=${totalFrames}:s=1920x1080:fps=24`;
      }

      // Create segment with effect - VERYFAST preset for speed
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-loop', '1',
          '-i', imagePaths[i],
          '-vf', filter,
          '-t', adjustedInterval.toString(),
          '-c:v', 'libx264',
          '-preset', 'veryfast', // Even faster than ultrafast but better quality
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

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Audio merged with video + atmospheric effects added');
          resolve();
        } else {
          reject(new Error(`FFmpeg merge with effects failed with code ${code}`));
        }
      });
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
