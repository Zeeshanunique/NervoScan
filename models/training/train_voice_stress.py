"""
NervoScan Voice Stress Model Training Script.
Downloads RAVDESS dataset, extracts features with librosa, trains sklearn classifiers,
and saves the best model to /models/voice_stress_model.joblib.

Stress mapping from RAVDESS emotions:
  Low    (0): neutral, calm
  Moderate(1): happy, sad, surprised
  High   (2): angry, fearful, disgust

Usage:
  cd NervoScan
  python -m models.training.train_voice_stress
"""

import os
import ssl
import sys
import time
import zipfile
import urllib.request
import json
import warnings
from pathlib import Path

import numpy as np
import librosa
import joblib
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.pipeline import Pipeline

warnings.filterwarnings("ignore")

# ─── Config ─────────────────────────────────────────────────────────────────

RAVDESS_URL = "https://zenodo.org/records/1188976/files/Audio_Speech_Actors_01-24.zip"
RAVDESS_SONG_URL = "https://zenodo.org/records/1188976/files/Audio_Song_Actors_01-24.zip"

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = ROOT_DIR / "models"
DATA_DIR = MODELS_DIR / "data"
RAVDESS_DIR = DATA_DIR / "ravdess"

OUTPUT_MODEL = MODELS_DIR / "voice_stress_model.joblib"
OUTPUT_SCALER = MODELS_DIR / "voice_stress_scaler.joblib"
OUTPUT_META = MODELS_DIR / "voice_stress_meta.json"

# RAVDESS emotion codes → stress level
EMOTION_TO_STRESS = {
    1: 0,  # neutral → Low
    2: 0,  # calm → Low
    3: 1,  # happy → Moderate
    4: 1,  # sad → Moderate
    5: 2,  # angry → High
    6: 2,  # fearful → High
    7: 2,  # disgust → High
    8: 1,  # surprised → Moderate
}

STRESS_LABELS = {0: "Low", 1: "Moderate", 2: "High"}

SAMPLE_RATE = 16000  # Standard for speech models


# ─── Download ────────────────────────────────────────────────────────────────

def download_ravdess():
    """Download RAVDESS speech dataset from Zenodo."""
    os.makedirs(DATA_DIR, exist_ok=True)
    zip_path = DATA_DIR / "Audio_Speech_Actors_01-24.zip"

    if RAVDESS_DIR.exists() and any(RAVDESS_DIR.rglob("*.wav")):
        wav_count = len(list(RAVDESS_DIR.rglob("*.wav")))
        print(f"[OK] RAVDESS already downloaded ({wav_count} wav files)")
        return

    if not zip_path.exists():
        print(f"[*] Downloading RAVDESS speech dataset (~215MB)...")
        print(f"    URL: {RAVDESS_URL}")

        def progress_hook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                pct = min(100, downloaded * 100 / total_size)
                mb_down = downloaded / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                sys.stdout.write(f"\r    [{pct:5.1f}%] {mb_down:.1f}/{mb_total:.1f} MB")
                sys.stdout.flush()

        # Handle macOS SSL certificate issues
        ctx = ssl.create_default_context()
        try:
            import certifi
            ctx.load_verify_locations(certifi.where())
        except (ImportError, Exception):
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
        urllib.request.install_opener(opener)

        urllib.request.urlretrieve(RAVDESS_URL, zip_path, reporthook=progress_hook)
        print("\n    Download complete!")
    else:
        print(f"[OK] Zip already exists: {zip_path}")

    print("[*] Extracting...")
    os.makedirs(RAVDESS_DIR, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(RAVDESS_DIR)
    print(f"[OK] Extracted to {RAVDESS_DIR}")


# ─── Feature Extraction ─────────────────────────────────────────────────────

def extract_features(audio_path: str) -> np.ndarray:
    """
    Extract the same features the backend uses for inference.
    Returns a flat feature vector (34 dimensions).
    """
    try:
        y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)

        if len(y) < sr * 0.5:  # Skip files shorter than 0.5s
            return None

        # Normalize
        max_val = np.max(np.abs(y))
        if max_val > 0:
            y = y / max_val

        # 1. MFCC (13 coefficients) → mean + std = 26 features
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_std = np.std(mfcc, axis=1)

        # 2. Pitch (F0) → mean + std = 2 features
        f0, voiced, _ = librosa.pyin(y, fmin=50, fmax=500, sr=sr)
        f0_clean = f0[~np.isnan(f0)] if f0 is not None else np.array([0])
        pitch_mean = np.mean(f0_clean) if len(f0_clean) > 0 else 0.0
        pitch_std = np.std(f0_clean) if len(f0_clean) > 0 else 0.0

        # 3. Energy (RMS) → mean + std = 2 features
        rms = librosa.feature.rms(y=y)[0]
        energy_mean = np.mean(rms)
        energy_std = np.std(rms)

        # 4. Jitter → 1 feature
        if len(f0_clean) >= 2 and np.all(f0_clean > 0):
            periods = 1.0 / f0_clean
            jitter = float(np.mean(np.abs(np.diff(periods))) / np.mean(periods))
        else:
            jitter = 0.0

        # 5. Spectral centroid → 1 feature
        sc = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        spectral_centroid = np.mean(sc)

        # 6. Spectral rolloff → 1 feature
        sr_feat = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        spectral_rolloff = np.mean(sr_feat)

        # 7. Voiced ratio → 1 feature
        voiced_ratio = float(np.sum(voiced) / len(voiced)) if voiced is not None and len(voiced) > 0 else 0.0

        # Assemble feature vector (34 dimensions)
        features = np.concatenate([
            mfcc_mean,           # 13
            mfcc_std,            # 13
            [pitch_mean],        # 1
            [pitch_std],         # 1
            [energy_mean],       # 1
            [energy_std],        # 1
            [jitter],            # 1
            [spectral_centroid], # 1
            [spectral_rolloff],  # 1
            [voiced_ratio],      # 1
        ])

        return features.astype(np.float32)

    except Exception as e:
        print(f"    [WARN] Failed to extract features from {audio_path}: {e}")
        return None


def parse_ravdess_filename(filepath: str) -> dict:
    """
    Parse RAVDESS filename format: 03-01-06-01-02-01-12.wav
    Modality-VocalChannel-Emotion-Intensity-Statement-Repetition-Actor
    """
    fname = os.path.basename(filepath).replace(".wav", "")
    parts = fname.split("-")
    if len(parts) != 7:
        return None
    return {
        "modality": int(parts[0]),
        "vocal_channel": int(parts[1]),
        "emotion": int(parts[2]),
        "intensity": int(parts[3]),
        "statement": int(parts[4]),
        "repetition": int(parts[5]),
        "actor": int(parts[6]),
    }


def build_dataset():
    """Extract features from all RAVDESS files and build X, y arrays."""
    wav_files = sorted(RAVDESS_DIR.rglob("*.wav"))
    print(f"\n[*] Found {len(wav_files)} audio files")

    X_list = []
    y_list = []
    skipped = 0

    for i, wav_path in enumerate(wav_files):
        meta = parse_ravdess_filename(str(wav_path))
        if meta is None:
            skipped += 1
            continue

        emotion_code = meta["emotion"]
        if emotion_code not in EMOTION_TO_STRESS:
            skipped += 1
            continue

        stress_label = EMOTION_TO_STRESS[emotion_code]

        features = extract_features(str(wav_path))
        if features is None:
            skipped += 1
            continue

        X_list.append(features)
        y_list.append(stress_label)

        if (i + 1) % 100 == 0 or (i + 1) == len(wav_files):
            sys.stdout.write(f"\r    Processed {i+1}/{len(wav_files)} files ({skipped} skipped)")
            sys.stdout.flush()

    print(f"\n[OK] Dataset built: {len(X_list)} samples, {skipped} skipped")

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.int32)

    # Class distribution
    for label_id, label_name in STRESS_LABELS.items():
        count = np.sum(y == label_id)
        print(f"    {label_name}: {count} samples ({count*100/len(y):.1f}%)")

    return X, y


# ─── Training ───────────────────────────────────────────────────────────────

def train_and_evaluate(X, y):
    """Train multiple classifiers, cross-validate, pick the best."""
    print("\n[*] Training classifiers with 5-fold stratified cross-validation...\n")

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    classifiers = {
        "GradientBoosting": GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42,
        ),
        "RandomForest": RandomForestClassifier(
            n_estimators=300,
            max_depth=10,
            min_samples_leaf=3,
            random_state=42,
            n_jobs=-1,
        ),
        "SVM": SVC(
            kernel="rbf",
            C=10,
            gamma="scale",
            probability=True,
            random_state=42,
        ),
    }

    best_name = None
    best_score = 0
    best_model = None
    results = {}

    for name, clf in classifiers.items():
        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", clf),
        ])

        scores = cross_val_score(pipe, X, y, cv=cv, scoring="accuracy", n_jobs=-1)
        mean_acc = scores.mean()
        std_acc = scores.std()

        results[name] = {"mean": mean_acc, "std": std_acc, "scores": scores.tolist()}
        print(f"    {name:25s}  accuracy: {mean_acc:.4f} (+/- {std_acc:.4f})  [{', '.join(f'{s:.3f}' for s in scores)}]")

        if mean_acc > best_score:
            best_score = mean_acc
            best_name = name
            best_model = pipe

    print(f"\n[*] Best classifier: {best_name} ({best_score:.4f})")

    # Final train on full dataset with best model
    print(f"[*] Training final {best_name} model on full dataset...")
    best_model.fit(X, y)

    # Full-dataset predictions for detailed report
    y_pred = best_model.predict(X)
    print(f"\n    Full-dataset accuracy: {accuracy_score(y, y_pred):.4f}")
    print(f"\n    Classification Report:")
    print(classification_report(y, y_pred, target_names=list(STRESS_LABELS.values())))

    print(f"    Confusion Matrix:")
    cm = confusion_matrix(y, y_pred)
    print(f"    {cm}")

    # Benchmark inference latency
    print(f"\n[*] Benchmarking inference latency...")
    sample = X[0:1]
    times = []
    for _ in range(1000):
        t0 = time.perf_counter()
        best_model.predict_proba(sample)
        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000)  # ms

    avg_ms = np.mean(times)
    p99_ms = np.percentile(times, 99)
    print(f"    Avg: {avg_ms:.3f}ms  |  P99: {p99_ms:.3f}ms  |  Max: {max(times):.3f}ms")

    return best_model, best_name, results, avg_ms


# ─── Save ────────────────────────────────────────────────────────────────────

def save_model(model, model_name, results, latency_ms, X, y):
    """Save trained model, scaler, and metadata."""
    os.makedirs(MODELS_DIR, exist_ok=True)

    # Save the full pipeline (scaler + classifier)
    joblib.dump(model, OUTPUT_MODEL)
    print(f"\n[OK] Model saved: {OUTPUT_MODEL} ({OUTPUT_MODEL.stat().st_size / 1024:.1f} KB)")

    # Save metadata
    meta = {
        "model_name": model_name,
        "feature_count": int(X.shape[1]),
        "sample_count": int(len(y)),
        "class_distribution": {
            STRESS_LABELS[i]: int(np.sum(y == i)) for i in range(3)
        },
        "stress_labels": STRESS_LABELS,
        "cross_validation": {
            name: {
                "mean_accuracy": round(r["mean"], 4),
                "std_accuracy": round(r["std"], 4),
            }
            for name, r in results.items()
        },
        "inference_latency_ms": round(latency_ms, 3),
        "feature_names": [
            *[f"mfcc_mean_{i}" for i in range(13)],
            *[f"mfcc_std_{i}" for i in range(13)],
            "pitch_mean", "pitch_std",
            "energy_mean", "energy_std",
            "jitter",
            "spectral_centroid", "spectral_rolloff",
            "voiced_ratio",
        ],
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    with open(OUTPUT_META, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"[OK] Metadata saved: {OUTPUT_META}")


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  NervoScan Voice Stress Model Training")
    print("=" * 60)

    # Step 1: Download
    download_ravdess()

    # Step 2: Extract features
    X, y = build_dataset()

    if len(X) < 100:
        print("[ERROR] Not enough samples. Check RAVDESS download.")
        sys.exit(1)

    # Step 3: Train
    model, name, results, latency = train_and_evaluate(X, y)

    # Step 4: Save
    save_model(model, name, results, latency, X, y)

    print("\n" + "=" * 60)
    print("  Training complete!")
    print(f"  Model: {OUTPUT_MODEL}")
    print(f"  Accuracy: {results[name]['mean']:.1%} (+/- {results[name]['std']:.1%})")
    print(f"  Latency: {latency:.2f}ms per inference")
    print("=" * 60)


if __name__ == "__main__":
    main()
