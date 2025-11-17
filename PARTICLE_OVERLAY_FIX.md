# PARTICLE OVERLAY FIX - Quick Apply

## The Problem
Particles were being uploaded but not visible in the final video.

## The Solution
FFmpeg wasn't properly handling the alpha channel. The fix changes the overlay filter to:

### For PRE-PROCESSED particles (with alpha):
**BEFORE (broken):**
```
[0:v][2:v]overlay=0:0:shortest=1[vout]
```

**AFTER (fixed):**
```
[2:v]format=yuva420p[particles];[0:v][particles]overlay=0:0:format=auto:shortest=1[vout]
```

### For NON-PROCESSED particles (black background):
**BEFORE (broken):**
```
[2:v]colorkey=black:0.3:0.1[particles];[0:v][particles]overlay=0:0:shortest=1[vout]
```

**AFTER (fixed):**
```
[2:v]format=yuva420p,colorkey=black:0.25:0.15:blend=0.0[particles];[0:v][particles]overlay=0:0:format=auto:shortest=1[vout]
```

## Where to Apply
In server.js, find the section around line 1777-1850 in the `processVideoJob` function.

## Code Location
Search for: `if (isPreprocessed) {`

Replace the ffmpegArgs filter_complex section with the fixed version above.
