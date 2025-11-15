# 🚀 Deploy BattleTech Video Generator pe Web (GRATUIT!)

## Metoda Simplă: Render.com (Recomandat)

### Pași:

1. **Mergi la:** https://render.com/
2. **Creează cont gratuit** (cu GitHub)
3. **Conectează-ți contul GitHub**
4. **Click pe "New +" → "Web Service"**
5. **Selectează repository-ul:** `PetreSebastian/yce`
6. **Selectează branch-ul:** `claude/claude-md-mi05c0t37wdiscun-01McZKFwHnq98YEiJrtyqqPV`
7. **Render va detecta automat `render.yaml`** - configurarea e gata!
8. **Click "Create Web Service"**

### ⏱️ Așteptare: 3-5 minute pentru build

### 🎉 Gata! Vei primi un URL:
```
https://battletech-video-generator-XXXX.onrender.com/battletech-video-generator.html
```

---

## Alternative (Gratuite):

### Railway.app
1. Mergi la: https://railway.app/
2. Login cu GitHub
3. "New Project" → "Deploy from GitHub repo"
4. Selectează `PetreSebastian/yce`
5. Gata!

### Vercel (pentru static sites)
1. Mergi la: https://vercel.com/
2. Import Git Repository
3. Selectează `PetreSebastian/yce`
4. Deploy!

---

## ⚠️ IMPORTANT: Environment Variables

După deploy, trebuie să adaugi API keys în Render Dashboard:

1. Click pe serviciul tău
2. "Environment" → "Add Environment Variable"
3. Adaugă (OPȚIONAL - doar dacă vrei AI features):
   - `GROQ_API_KEY` - pentru script generation (FREE la console.groq.com)
   - `FAL_API_KEY` - pentru image generation
   - `STABILITY_API_KEY` - pentru image generation
   - `GEMINI_API_KEY` - pentru image generation
   - `GENAIPRO_JWT` - pentru voiceover

**NU-ȚI FACE GRIJI:** Aplicația merge și **fără API keys** dacă folosești **Manual Mode** (upload propriile imagini și audio)!

---

## 📊 Free Tier Limits:

**Render.com FREE tier:**
- ✅ 750 ore/lună (suficient!)
- ✅ SSL gratuit (HTTPS)
- ✅ Auto-deploy când push în GitHub
- ⚠️ Se oprește după 15 min inactivitate (se pornește automat când accesezi)

**Railway.app FREE tier:**
- ✅ $5 credit/lună
- ✅ SSL gratuit
- ✅ Foarte rapid

---

## 🎬 După Deploy:

Accesează aplicația la URL-ul primit:
```
https://your-app-name.onrender.com/battletech-video-generator.html
```

**Folosește Manual Mode:**
1. Upload 5-10 imagini
2. Upload un fișier audio MP3
3. Generează video!

**Fără niciun API key necesar!** 🎉
