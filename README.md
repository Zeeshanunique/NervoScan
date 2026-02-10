# NervoScan

Privacy-aware, offline-first stress detection PWA. Records voice + face for 60 seconds, computes live stress & confidence scores every 5 seconds, detects spoofed emotions, and generates weekly trends + reports.

---

## Architecture

```
[PWA Frontend — Next.js]
 ├─ Web Audio API (48kHz)
 ├─ MediaPipe Face Mesh (478 landmarks)
 ├─ Keystroke dynamics tracker
 ├─ Offline stress engine (local inference)
 ├─ Live Recharts (5s updates)
 └─ Service Worker (offline-first)

        ↓ WebSocket (real-time)
        ↓ HTTPS (final report)

[Backend — FastAPI]
 ├─ Assessment API (start / live / final)
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
npm run dev
```

Open http://localhost:3000.

---

## User Flow

1. **Start Assessment** — click the button, grant camera + mic access
2. **60s Recording** — voice, face, and keystroke data captured; stress gauge, live chart, and pitch heatmap update every 5 seconds
3. **Final Analysis** — backend runs ensemble model + spoof detection, returns score, level, confidence, and recommendations
4. **Reports** — view daily/weekly/monthly stress trends, export PDF or CSV

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
| Frontend | Next.js 16, Tailwind CSS, Recharts, Web Audio API, MediaPipe |
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

Toggle between English and Hindi using the navbar button. All UI strings are defined in `frontend/app/lib/i18n.ts`.

---

## Deployment (Railway)

1. Push to GitHub
2. Connect repo to Railway
3. Add a PostgreSQL plugin
4. Set environment variables:
   - `DATABASE_URL` — from Railway Postgres
   - `CORS_ORIGINS` — your frontend domain
5. Deploy backend service from `/backend`
6. Deploy frontend service from `/frontend` with `NEXT_PUBLIC_API_URL` pointing to backend

Estimated cost: **~$5–10/month** on Railway.

---

## Privacy

- All biometric data is processed locally first
- No audio or video recordings are stored on the server
- Only aggregated scores are persisted
- Anonymous user IDs — no login required
- Export and delete your data at any time
