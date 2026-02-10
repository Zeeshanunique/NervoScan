"""
Spoof Detection Module.
Detects faked/acted emotions via voice-face mismatch,
emotion latency inconsistency, and over-regular facial motion.
"""
import numpy as np
from typing import Optional


class SpoofDetector:

    def __init__(self, mismatch_threshold: float = 0.35):
        self.mismatch_threshold = mismatch_threshold

    def detect(
        self,
        voice_scores: list[dict],
        face_scores: list[dict],
        keystroke_data: Optional[dict] = None,
    ) -> dict:
        """
        Run spoof detection across modalities.

        voice_scores: list of {stress_score, confidence, ...} per 5s window
        face_scores: list of {tension_score, ...} per 5s window
        """
        checks = []

        # Check 1: Voice-Face mismatch
        mismatch = self._voice_face_mismatch(voice_scores, face_scores)
        checks.append(mismatch)

        # Check 2: Emotion latency inconsistency
        latency = self._emotion_latency_check(voice_scores, face_scores)
        checks.append(latency)

        # Check 3: Over-regular facial motion (too robotic)
        regularity = self._facial_regularity_check(face_scores)
        checks.append(regularity)

        # Check 4: Monotone voice (unnaturally steady)
        monotone = self._voice_monotone_check(voice_scores)
        checks.append(monotone)

        # Aggregate
        spoof_flags = [c for c in checks if c["flagged"]]
        spoof_score = len(spoof_flags) / len(checks)
        spoof_detected = spoof_score >= self.mismatch_threshold

        return {
            "spoof_detected": spoof_detected,
            "spoof_score": round(spoof_score, 3),
            "checks": checks,
            "flags_triggered": len(spoof_flags),
            "total_checks": len(checks),
        }

    def _voice_face_mismatch(self, voice_scores: list, face_scores: list) -> dict:
        """If voice says stressed but face says calm (or vice versa), flag it."""
        if not voice_scores or not face_scores:
            return {"name": "voice_face_mismatch", "flagged": False, "reason": "insufficient data"}

        mismatches = 0
        comparisons = min(len(voice_scores), len(face_scores))

        for i in range(comparisons):
            v_stress = voice_scores[i].get("stress_score", 50)
            f_tension = face_scores[i].get("tension_score", 50)
            diff = abs(v_stress - f_tension)

            if diff > 35:  # Large divergence
                mismatches += 1

        ratio = mismatches / max(comparisons, 1)
        return {
            "name": "voice_face_mismatch",
            "flagged": ratio > 0.5,
            "reason": f"{mismatches}/{comparisons} windows had >35pt divergence",
            "score": round(ratio, 3),
        }

    def _emotion_latency_check(self, voice_scores: list, face_scores: list) -> dict:
        """Check if face emotion changes always follow voice with constant delay (acting)."""
        if len(voice_scores) < 4 or len(face_scores) < 4:
            return {"name": "emotion_latency", "flagged": False, "reason": "insufficient data"}

        v_deltas = [voice_scores[i + 1].get("stress_score", 0) - voice_scores[i].get("stress_score", 0) for i in range(len(voice_scores) - 1)]
        f_deltas = [face_scores[i + 1].get("tension_score", 0) - face_scores[i].get("tension_score", 0) for i in range(len(face_scores) - 1)]

        min_len = min(len(v_deltas), len(f_deltas))
        if min_len < 2:
            return {"name": "emotion_latency", "flagged": False, "reason": "insufficient deltas"}

        # Check correlation of changes
        correlation = np.corrcoef(v_deltas[:min_len], f_deltas[:min_len])[0, 1]

        # Perfect negative or zero correlation is suspicious
        flagged = not np.isnan(correlation) and correlation < -0.3

        return {
            "name": "emotion_latency",
            "flagged": flagged,
            "reason": f"Voice-face change correlation: {round(correlation, 3) if not np.isnan(correlation) else 'N/A'}",
            "score": round(abs(correlation), 3) if not np.isnan(correlation) else 0,
        }

    def _facial_regularity_check(self, face_scores: list) -> dict:
        """Over-regular facial movement suggests acting."""
        if len(face_scores) < 4:
            return {"name": "facial_regularity", "flagged": False, "reason": "insufficient data"}

        tensions = [f.get("tension_score", 50) for f in face_scores]
        std = np.std(tensions)

        # Very low variance = possibly acting (keeping face too steady)
        flagged = std < 2.0

        return {
            "name": "facial_regularity",
            "flagged": flagged,
            "reason": f"Tension std dev: {round(std, 2)} (threshold: 2.0)",
            "score": round(max(0, 1 - std / 10), 3),
        }

    def _voice_monotone_check(self, voice_scores: list) -> dict:
        """Check for unnaturally monotone voice."""
        if len(voice_scores) < 4:
            return {"name": "voice_monotone", "flagged": False, "reason": "insufficient data"}

        stresses = [v.get("stress_score", 50) for v in voice_scores]
        std = np.std(stresses)

        flagged = std < 1.5

        return {
            "name": "voice_monotone",
            "flagged": flagged,
            "reason": f"Stress std dev: {round(std, 2)} (threshold: 1.5)",
            "score": round(max(0, 1 - std / 8), 3),
        }


# Singleton
spoof_detector = SpoofDetector()
