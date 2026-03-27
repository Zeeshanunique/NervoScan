# NervoScan

Privacy-aware, offline-first stress detection PWA. Records voice + face for 60 seconds, computes live stress & confidence scores every 5 seconds, detects spoofed emotions, and generates weekly trends + reports.

---

## Key Features

- **Multimodal Stress Detection**: Analyzes voice (MFCCs, pitch), facial tension (MediaPipe landmarks), and keystroke dynamics in real time.
- **Privacy-First & Offline-Capable**: All biometric data is processed locally. No audio/video recordings are stored. Terms & Conditions are explicitly agreed to before use.
- **Global Multilingual Support**: Available in 12 languages (English, Hindi, Kannada, Telugu, Tamil, Malayalam, Arabic, Spanish, French, Portuguese, Bengali, Urdu).
- **AI Wellness Assistant**: Integrated Google Gemini 2.5 Flash chatbot offering personalized stress management techniques and breathing exercises.
- **Admin Dashboard**: High-level views of user engagement, assessment history, stress distribution, and ML model accuracy mapping (SVM ~79.7%).
- **Assessment Control**: Pause, resume, or stop the 60-second assessment at any point.
- **Comprehensive Reports**: Daily/weekly trends, spoof detection (voice-face mismatch), and PDF/CSV exports.

---

## Architecture

```
[PWA Frontend — Next.js]
 ├─ Web Audio API (48kHz)
 ├─ MediaPipe Face Mesh (478 landmarks)
 ├─ Keystroke dynamics tracker
 ├─ Offline stress engine (local inference)
 ├─ Live Recharts (5s updates)
 ├─ Google Gemini Chatbot (Next.js API proxy)
 └─ Service Worker (offline-first)

        ↓ WebSocket (real-time)
        ↓ HTTPS (final report)

[Backend — FastAPI]
 ├─ Assessment API (start / live / final)
 ├─ Admin API (dashboard / users / stats)
 ├─ Spoof detection (voice-face mismatch)
 ├─ Report generator (PDF / CSV)
 ├─ Swagger UI (/docs)
 └─ PostgreSQL

[ML Layer]
 ├─ Voice stress (MFCC + pitch + jitter + energy)
 ├─ Face emotion (landmark tension analysis)
 ├─ Keystroke anomaly (dwell/flight time)
 └─ Late-fusion ensemble (50% voice, 35% face, 15% keystroke)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 16 (or Docker)

### Option 1: Docker Compose (recommended)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Swagger: http://localhost:8000/docs

### Option 2: Manual Setup

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start PostgreSQL and create the database
createdb nervoscan

# Run
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Add your Google Gemini API key to .env.local: GEMINI_API_KEY=your_key_here
npm run dev
```

Open http://localhost:3000.

---

## User Flow

1. **Accept Terms** — mandatory Terms & Conditions gate to ensure privacy compliance
2. **Start Assessment** — grant camera + mic access
3. **Recording (up to 60s)** — voice, face, and keystrokes captured; live chart updates every 5s. User can **Pause**, **Resume**, or **Stop** early
4. **Final Analysis** — backend runs ensemble model + spoof detection, returns score, level, confidence, and recommendations
5. **Reports** — view trend graphs, chat with the AI Assistant for advice, or export data
6. **Admin Dashboard** — admins can monitor overall system metrics, model accuracy, and user assessments

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/assessment/start` | Start a new 60s assessment session |
| `WS` | `/assessment/live` | Real-time 5s snapshot updates |
| `POST` | `/assessment/final` | Submit full data for final analysis |
| `GET` | `/reports/{user_id}` | Get assessment history + trends |
| `GET` | `/export/pdf?assessment_id=` | Download PDF report |
| `GET` | `/export/csv?user_id=` | Download CSV history |
| `GET` | `/docs` | Swagger UI |

---

## Project Structure

```
NervoScan/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── assessment.py      # start / live WS / final endpoints
│   │   │   └── reports.py         # reports + PDF/CSV export
│   │   ├── ml/
│   │   │   ├── voice_stress.py    # MFCC, pitch, jitter extraction
│   │   │   ├── face_emotion.py    # landmark tension analysis
│   │   │   ├── spoof_detection.py # voice-face mismatch checks
│   │   │   ├── keystroke.py       # typing dynamics analyzer
│   │   │   └── ensemble.py        # late-fusion combiner
│   │   ├── models/
│   │   │   └── assessment.py      # SQLAlchemy models
│   │   ├── services/
│   │   │   └── report_service.py  # PDF + CSV generation
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── assessment/page.tsx    # recording dashboard
│   │   ├── reports/page.tsx       # trends + export
│   │   ├── components/
│   │   │   ├── StressGauge.tsx
│   │   │   ├── LiveChart.tsx
│   │   │   ├── PitchHeatmap.tsx
│   │   │   ├── CountdownTimer.tsx
│   │   │   ├── SpoofBadge.tsx
│   │   │   ├── StressLevel.tsx
│   │   │   └── Navbar.tsx
│   │   ├── lib/
│   │   │   ├── audio-processor.ts # Web Audio 48kHz capture
│   │   │   ├── face-processor.ts  # MediaPipe Face Mesh
│   │   │   ├── keystroke-tracker.ts
│   │   │   ├── stress-engine.ts   # offline inference
│   │   │   ├── api.ts
│   │   │   └── i18n.ts           # Hindi / English
│   │   ├── layout.tsx
│   │   └── page.tsx              # landing page
│   ├── public/manifest.json
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── railway.toml
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, Tailwind CSS, Recharts, @google/genai (Gemini AI), Web Audio API, MediaPipe |
| Backend | FastAPI, SQLAlchemy (async), WebSockets |
| Database | PostgreSQL |
| Reports | ReportLab (PDF), Pandas (CSV) |
| ML | librosa, NumPy, scikit-learn |
| Deploy | Docker, Railway |

---

## Stress Scoring

**Voice (50% weight)** — pitch mean/std, energy, jitter, spectral centroid, MFCC features extracted via librosa. Higher pitch + energy + jitter = higher stress.

**Face (35% weight)** — 478-point MediaPipe mesh. Eye openness variance, brow tension, lip compression, face symmetry, jaw clench mapped to tension score.

**Keystroke (15% weight)** — dwell time, flight time, error rate, rhythm regularity. Used as confidence modifier, not core signal.

**Spoof Detection** — four checks: voice-face divergence, emotion latency correlation, facial regularity (too steady = acting), voice monotone. Flags trigger when ≥2 checks fail.

Score range: **0–100** → Low (0–24) / Moderate (25–49) / High (50–74) / Critical (75–100)

---

## Offline Behavior

The first 30 seconds work fully offline using the browser-side stress engine (`stress-engine.ts`). Features are extracted locally via Web Audio API and canvas fallback for face detection. When the backend is reachable, snapshots relay over WebSocket and final analysis runs server-side.

---

## i18n

NervoScan supports 12 languages natively: English, Hindi, Kannada, Telugu, Tamil, Malayalam, Arabic, Spanish, French, Portuguese, Bengali, and Urdu. 

Toggle between them using the top-right navbar dropdown. All UI strings are managed in `frontend/app/lib/i18n.ts`, with fallback to English for any missing keys.

---

## Deployment

**For complete deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).**

We provide three documented tracks for deployment:
1. **Docker Compose** (Recommended for robust local/VPS setup)
2. **Railway** (PaaS cloud deployment, PostgreSQL, ~$5–10/month)
3. **Manual bare-metal setup**

---

## Privacy

- All biometric data is processed locally first
- No audio or video recordings are stored on the server
- Only aggregated scores are persisted
- Anonymous user IDs — no login required
- Export and delete your data at any time
