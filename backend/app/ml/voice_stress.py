"""
Voice Stress Analysis Module.
Extracts MFCC, pitch, jitter, energy from audio and predicts stress level.
Uses trained SVM model on RAVDESS dataset (79.7% cross-validated accuracy).
Falls back to heuristic scoring if model file is not found.
"""
import os
import numpy as np
from pathlib import Path
from typing import Optional

# Model path — relative to project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_MODEL_PATH = _PROJECT_ROOT / "models" / "voice_stress_model.joblib"

_META_PATH = _PROJECT_ROOT / "models" / "voice_stress_meta.json"

STRESS_LABELS = {0: "Low", 1: "Moderate", 2: "High"}


class VoiceStressAnalyzer:
    def __init__(self):
        self._model = None
        self._model_loaded = False
        self._meta = None
        self._load_model()

    def _load_model(self):
        """Load the trained sklearn pipeline (scaler + SVM)."""
        try:
            if _MODEL_PATH.exists():
                import joblib
                self._model = joblib.load(_MODEL_PATH)
                self._model_loaded = True
                print(f"[ML] Voice stress model loaded from {_MODEL_PATH}")
            else:
                print(f"[ML] No trained model at {_MODEL_PATH} — using heuristic fallback")
        except Exception as e:
            print(f"[ML] Failed to load voice stress model: {e} — using heuristic fallback")
            self._model = None
            self._model_loaded = False

        # Load and print accuracy report
        self._load_meta()
        self.print_accuracy_report()

    def _load_meta(self):
        """Load model metadata from voice_stress_meta.json."""
        try:
            if _META_PATH.exists():
                import json
                with open(_META_PATH, "r") as f:
                    self._meta = json.load(f)
        except Exception as e:
            print(f"[ML] Failed to load model metadata: {e}")
            self._meta = None

    def print_accuracy_report(self):
        """Print model accuracy metrics to terminal/console."""
        print("\n" + "=" * 60)
        print("  NervoScan ML Model — Accuracy Report")
        print("=" * 60)

        if self._meta:
            cv = self._meta.get("cross_validation", {})
            print(f"\n  Model Type     : {self._meta.get('model_name', 'Unknown')}")
            print(f"  Features       : {self._meta.get('feature_count', 'N/A')}")
            print(f"  Training Data  : {self._meta.get('sample_count', 'N/A')} samples")
            print(f"  Trained At     : {self._meta.get('trained_at', 'N/A')}")
            print(f"  Inference Time : {self._meta.get('inference_latency_ms', 'N/A')}ms")

            dist = self._meta.get("class_distribution", {})
            if dist:
                print(f"\n  Class Distribution:")
                for label, count in dist.items():
                    print(f"    {label:>10s} : {count} samples")

            if cv:
                print(f"\n  Cross‑Validation Accuracy:")
                for model_name, metrics in cv.items():
                    mean_acc = metrics.get("mean_accuracy", 0) * 100
                    std_acc = metrics.get("std_accuracy", 0) * 100
                    marker = " ◀ SELECTED" if model_name == self._meta.get("model_name") else ""
                    print(f"    {model_name:>20s} : {mean_acc:.1f}% (±{std_acc:.1f}%){marker}")
        else:
            print("\n  No model metadata found. Using heuristic fallback.")
            print("  Accuracy: N/A (rule-based scoring)")

        print(f"\n  Model Status   : {'✅ Loaded' if self._model_loaded else '⚠️  Heuristic fallback'}")
        print("=" * 60 + "\n")

    def extract_features(self, audio_data: np.ndarray, sample_rate: int = 48000) -> dict:
        """Extract voice features from raw audio samples."""
        try:
            import librosa

            # Ensure float32
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)

            # Normalize
            max_val = np.max(np.abs(audio_data))
            if max_val > 0:
                audio_data = audio_data / max_val

            # Resample to 16kHz (model was trained on 16kHz)
            if sample_rate != 16000:
                audio_data = librosa.resample(audio_data, orig_sr=sample_rate, target_sr=16000)
                sample_rate = 16000

            # MFCC (13 coefficients)
            mfcc = librosa.feature.mfcc(y=audio_data, sr=sample_rate, n_mfcc=13)
            mfcc_mean = np.mean(mfcc, axis=1).tolist()
            mfcc_std = np.std(mfcc, axis=1).tolist()

            # Pitch (F0) via pyin
            f0, voiced_flag, _ = librosa.pyin(
                audio_data, fmin=50, fmax=500, sr=sample_rate
            )
            f0_clean = f0[~np.isnan(f0)] if f0 is not None else np.array([0])
            pitch_mean = float(np.mean(f0_clean)) if len(f0_clean) > 0 else 0.0
            pitch_std = float(np.std(f0_clean)) if len(f0_clean) > 0 else 0.0

            # Energy (RMS)
            rms = librosa.feature.rms(y=audio_data)[0]
            energy_mean = float(np.mean(rms))
            energy_std = float(np.std(rms))

            # Jitter (pitch period variation)
            jitter = self._compute_jitter(f0_clean)

            # Spectral features
            spectral_centroid = librosa.feature.spectral_centroid(y=audio_data, sr=sample_rate)[0]
            spectral_rolloff = librosa.feature.spectral_rolloff(y=audio_data, sr=sample_rate)[0]

            # Voiced ratio
            voiced_ratio = float(np.sum(voiced_flag) / len(voiced_flag)) if voiced_flag is not None and len(voiced_flag) > 0 else 0.0

            return {
                "mfcc_mean": mfcc_mean,
                "mfcc_std": mfcc_std,
                "pitch_mean": pitch_mean,
                "pitch_std": pitch_std,
                "energy_mean": energy_mean,
                "energy_std": energy_std,
                "jitter": jitter,
                "spectral_centroid": float(np.mean(spectral_centroid)),
                "spectral_rolloff": float(np.mean(spectral_rolloff)),
                "voiced_ratio": voiced_ratio,
            }

        except Exception as e:
            return self._empty_features(error=str(e))

    def predict_stress(self, features: dict) -> dict:
        """Predict stress from extracted voice features using trained model or heuristic."""
        if self._model_loaded and self._model is not None:
            return self._ml_predict(features)
        else:
            return self._heuristic_predict(features)

    def _ml_predict(self, features: dict) -> dict:
        """Predict using the trained sklearn model (SVM pipeline with scaler)."""
        try:
            # Build the 34-dim feature vector in the exact same order as training
            mfcc_mean = features.get("mfcc_mean", [0] * 13)
            mfcc_std = features.get("mfcc_std", [0] * 13)

            feature_vector = np.array(
                mfcc_mean
                + mfcc_std
                + [
                    features.get("pitch_mean", 0),
                    features.get("pitch_std", 0),
                    features.get("energy_mean", 0),
                    features.get("energy_std", 0),
                    features.get("jitter", 0),
                    features.get("spectral_centroid", 0),
                    features.get("spectral_rolloff", 0),
                    features.get("voiced_ratio", 0),
                ],
                dtype=np.float32,
            ).reshape(1, -1)

            # Get class probabilities
            proba = self._model.predict_proba(feature_vector)[0]  # [P(Low), P(Moderate), P(High)]
            predicted_class = int(np.argmax(proba))

            # Compute continuous stress score from probabilities
            # Low=0..33, Moderate=33..66, High=66..100
            stress_score = (
                proba[0] * 15    # Low contributes ~15
                + proba[1] * 50  # Moderate contributes ~50
                + proba[2] * 85  # High contributes ~85
            )
            stress_score = max(0, min(100, stress_score))

            # Confidence from max probability
            confidence = float(np.max(proba)) * 100

            return {
                "stress_score": round(stress_score, 1),
                "stress_level": STRESS_LABELS[predicted_class],
                "confidence": round(confidence, 1),
                "pitch_mean": features.get("pitch_mean", 0),
                "energy_mean": features.get("energy_mean", 0),
                "model": "svm_ravdess",
                "probabilities": {
                    "low": round(float(proba[0]), 3),
                    "moderate": round(float(proba[1]), 3),
                    "high": round(float(proba[2]), 3),
                },
            }

        except Exception as e:
            print(f"[ML] Model prediction failed: {e}, falling back to heuristic")
            return self._heuristic_predict(features)

    def _heuristic_predict(self, features: dict) -> dict:
        """Fallback heuristic scoring when no trained model is available."""
        score = self._heuristic_stress_score(features)
        return {
            "stress_score": round(score, 1),
            "stress_level": self._score_to_level(score),
            "confidence": round(self._compute_confidence(features), 1),
            "pitch_mean": features.get("pitch_mean", 0),
            "energy_mean": features.get("energy_mean", 0),
            "model": "heuristic",
        }

    def _heuristic_stress_score(self, features: dict) -> float:
        """
        Heuristic stress scoring based on known acoustic stress markers:
        - Higher pitch -> more stress
        - Higher pitch variability -> more stress
        - Higher energy -> more stress
        - Higher jitter -> more stress
        - Higher spectral centroid -> more stress (brighter voice)
        """
        score = 50.0

        pitch = features.get("pitch_mean", 150)
        pitch_std = features.get("pitch_std", 20)
        energy = features.get("energy_mean", 0.05)
        jitter = features.get("jitter", 0.01)
        spectral_centroid = features.get("spectral_centroid", 1500)

        if pitch > 200:
            score += min((pitch - 200) * 0.15, 15)
        elif pitch < 120:
            score -= min((120 - pitch) * 0.1, 10)

        if pitch_std > 40:
            score += min((pitch_std - 40) * 0.2, 10)

        if energy > 0.1:
            score += min((energy - 0.1) * 80, 10)

        if jitter > 0.02:
            score += min((jitter - 0.02) * 500, 15)

        if spectral_centroid > 2000:
            score += min((spectral_centroid - 2000) * 0.005, 10)

        return max(0, min(100, score))

    def _compute_jitter(self, f0: np.ndarray) -> float:
        if len(f0) < 2:
            return 0.0
        periods = 1.0 / f0[f0 > 0]
        if len(periods) < 2:
            return 0.0
        diffs = np.abs(np.diff(periods))
        return float(np.mean(diffs) / np.mean(periods))

    def _compute_confidence(self, features: dict) -> float:
        """Confidence based on signal quality (heuristic fallback)."""
        voiced = features.get("voiced_ratio", 0)
        energy = features.get("energy_mean", 0)
        conf = 50.0
        conf += voiced * 30
        conf += min(energy * 200, 20)
        return max(0, min(100, conf))

    def _score_to_level(self, score: float) -> str:
        if score < 25:
            return "Low"
        elif score < 50:
            return "Moderate"
        elif score < 75:
            return "High"
        return "Critical"

    def _empty_features(self, error: str = "") -> dict:
        return {
            "mfcc_mean": [0] * 13,
            "mfcc_std": [0] * 13,
            "pitch_mean": 0,
            "pitch_std": 0,
            "energy_mean": 0,
            "energy_std": 0,
            "jitter": 0,
            "spectral_centroid": 0,
            "spectral_rolloff": 0,
            "voiced_ratio": 0,
            "error": error,
        }


# Singleton
voice_analyzer = VoiceStressAnalyzer()
