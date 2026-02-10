"""
Face Emotion Analysis Module.
Uses MediaPipe Face Mesh landmarks to compute tension metrics.
Lightweight classifier for emotion → stress mapping.
"""
import numpy as np
from typing import Optional


class FaceEmotionAnalyzer:

    # Landmark indices (MediaPipe 478-point face mesh)
    LEFT_EYE_TOP = 159
    LEFT_EYE_BOTTOM = 145
    RIGHT_EYE_TOP = 386
    RIGHT_EYE_BOTTOM = 374
    LEFT_BROW_INNER = 107
    LEFT_BROW_OUTER = 70
    RIGHT_BROW_INNER = 336
    RIGHT_BROW_OUTER = 300
    UPPER_LIP = 13
    LOWER_LIP = 14
    LEFT_MOUTH = 61
    RIGHT_MOUTH = 291
    NOSE_TIP = 1
    CHIN = 152
    FOREHEAD = 10

    def analyze_landmarks(self, landmarks: list[dict]) -> dict:
        """
        Analyze face landmarks to extract stress-related metrics.
        landmarks: list of {x, y, z} dicts (478 points from MediaPipe)
        """
        if not landmarks or len(landmarks) < 400:
            return self._empty_result()

        try:
            pts = np.array([[lm["x"], lm["y"], lm.get("z", 0)] for lm in landmarks])

            eye_openness = self._eye_openness(pts)
            brow_tension = self._brow_tension(pts)
            lip_compression = self._lip_compression(pts)
            face_symmetry = self._face_symmetry(pts)
            jaw_clench = self._jaw_clench(pts)

            # Composite face tension score (0-100)
            tension_score = self._compute_tension_score(
                eye_openness, brow_tension, lip_compression, face_symmetry, jaw_clench
            )

            return {
                "tension_score": round(tension_score, 1),
                "eye_openness": round(eye_openness, 3),
                "brow_tension": round(brow_tension, 3),
                "lip_compression": round(lip_compression, 3),
                "face_symmetry": round(face_symmetry, 3),
                "jaw_clench": round(jaw_clench, 3),
                "stress_level": self._score_to_level(tension_score),
            }

        except Exception as e:
            return self._empty_result(error=str(e))

    def _eye_openness(self, pts: np.ndarray) -> float:
        """Average eye aspect ratio. Lower = more squinting/tension."""
        left = np.linalg.norm(pts[self.LEFT_EYE_TOP] - pts[self.LEFT_EYE_BOTTOM])
        right = np.linalg.norm(pts[self.RIGHT_EYE_TOP] - pts[self.RIGHT_EYE_BOTTOM])
        return float((left + right) / 2)

    def _brow_tension(self, pts: np.ndarray) -> float:
        """Distance between brows and eyes. Lower = furrowed/tense."""
        left_brow_eye = np.linalg.norm(pts[self.LEFT_BROW_INNER] - pts[self.LEFT_EYE_TOP])
        right_brow_eye = np.linalg.norm(pts[self.RIGHT_BROW_INNER] - pts[self.RIGHT_EYE_TOP])
        return float((left_brow_eye + right_brow_eye) / 2)

    def _lip_compression(self, pts: np.ndarray) -> float:
        """Lip opening distance. Lower = compressed/tense."""
        vertical = np.linalg.norm(pts[self.UPPER_LIP] - pts[self.LOWER_LIP])
        horizontal = np.linalg.norm(pts[self.LEFT_MOUTH] - pts[self.RIGHT_MOUTH])
        return float(vertical / max(horizontal, 0.001))

    def _face_symmetry(self, pts: np.ndarray) -> float:
        """Face symmetry score. Lower = more asymmetric (stress indicator)."""
        left_dist = np.linalg.norm(pts[self.LEFT_BROW_OUTER] - pts[self.CHIN])
        right_dist = np.linalg.norm(pts[self.RIGHT_BROW_OUTER] - pts[self.CHIN])
        return float(min(left_dist, right_dist) / max(left_dist, right_dist, 0.001))

    def _jaw_clench(self, pts: np.ndarray) -> float:
        """Jaw tension based on chin-to-nose distance."""
        return float(np.linalg.norm(pts[self.NOSE_TIP] - pts[self.CHIN]))

    def _compute_tension_score(
        self,
        eye_openness: float,
        brow_tension: float,
        lip_compression: float,
        face_symmetry: float,
        jaw_clench: float,
    ) -> float:
        """Composite tension score (0-100)."""
        score = 50.0

        # Squinting → stress
        if eye_openness < 0.02:
            score += 15
        elif eye_openness < 0.03:
            score += 8

        # Furrowed brows → stress
        if brow_tension < 0.03:
            score += 12
        elif brow_tension < 0.04:
            score += 6

        # Compressed lips → stress
        if lip_compression < 0.15:
            score += 10
        elif lip_compression < 0.25:
            score += 5

        # Asymmetry → stress
        if face_symmetry < 0.85:
            score += 8
        elif face_symmetry < 0.92:
            score += 4

        # Jaw clench → stress
        if jaw_clench < 0.12:
            score += 10

        return max(0, min(100, score))

    def _score_to_level(self, score: float) -> str:
        if score < 25:
            return "Low"
        elif score < 50:
            return "Moderate"
        elif score < 75:
            return "High"
        return "Critical"

    def _empty_result(self, error: str = "") -> dict:
        return {
            "tension_score": 0,
            "eye_openness": 0,
            "brow_tension": 0,
            "lip_compression": 0,
            "face_symmetry": 0,
            "jaw_clench": 0,
            "stress_level": "Unknown",
            "error": error,
        }


# Singleton
face_analyzer = FaceEmotionAnalyzer()
