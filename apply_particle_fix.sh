#!/bin/bash
# Particle Overlay Fix Script
# Run this in your project directory where server.js is located

echo "🔧 Applying Particle Overlay Fix..."

# Backup original server.js
cp server.js server.js.backup
echo "✅ Backed up server.js to server.js.backup"

# Fix 1: Pre-processed particles overlay (around line 1804)
sed -i 's/\[0:v\]\[2:v\]overlay=0:0:shortest=1\[vout\]/[2:v]format=yuva420p[particles];[0:v][particles]overlay=0:0:format=auto:shortest=1[vout]/g' server.js

# Fix 2: Non-processed particles with colorkey (around line 1820)
sed -i 's/\[2:v\]colorkey=black:0\.3:0\.1\[particles\];/[2:v]format=yuva420p,colorkey=black:0.25:0.15:blend=0.0[particles];/g' server.js
sed -i 's/\[0:v\]\[particles\]overlay=0:0:shortest=1\[vout\]/[0:v][particles]overlay=0:0:format=auto:shortest=1[vout]/g' server.js

echo "✅ Applied particle overlay fixes"
echo "🔍 Verifying changes..."

# Check if fixes were applied
if grep -q "format=yuva420p\[particles\]" server.js; then
    echo "✅ Fix 1 applied: Pre-processed particles now use proper alpha format"
else
    echo "⚠️  Fix 1 not found - may need manual application"
fi

if grep -q "colorkey=black:0\.25:0\.15:blend=0\.0" server.js; then
    echo "✅ Fix 2 applied: Non-processed particles now use better colorkey settings"
else
    echo "⚠️  Fix 2 not found - may need manual application"
fi

echo ""
echo "🎉 Particle overlay fix complete!"
echo "📝 Original file saved as: server.js.backup"
echo "🚀 Restart your server with: npm start"
