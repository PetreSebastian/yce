// Particle overlay fix - around line 1777-1850
// The key changes are in the FFmpeg filter complex commands

// OLD (broken - particles not visible):
// `[0:v][2:v]overlay=0:0:shortest=1[vout]`

// NEW (fixed - particles visible with proper alpha blending):
// `[2:v]format=yuva420p[particles];[0:v][particles]overlay=0:0:format=auto:shortest=1[vout]`

// For non-preprocessed particles:
// OLD:
// `[2:v]colorkey=black:0.3:0.1[particles];[0:v][particles]overlay=0:0:shortest=1[vout]`

// NEW:
// `[2:v]format=yuva420p,colorkey=black:0.25:0.15:blend=0.0[particles];[0:v][particles]overlay=0:0:format=auto:shortest=1[vout]`

console.log('Particle overlay fix documented');
