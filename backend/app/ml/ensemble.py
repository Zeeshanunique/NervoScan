"""
Late-Fusion Ensemble Module.
Combines voice, face, and keystroke signals into final stress assessment.
"""
from typing import Optional


class StressEnsemble:

    # Modality weights for late fusion
    VOICE_WEIGHT = 0.50
    FACE_WEIGHT = 0.35
    KEYSTROKE_WEIGHT = 0.15

    def fuse(
        self,
        voice_result: dict,
        face_result: dict,
        keystroke_result: Optional[dict] = None,
        spoof_result: Optional[dict] = None,
    ) -> dict:
        """
        Fuse multimodal signals into final assessment.
        """
        voice_stress = voice_result.get("stress_score", 50)
        voice_conf = voice_result.get("confidence", 50)

        face_tension = face_result.get("tension_score", 50)

        # Keystroke confidence modifier
        ks_modifier = 0
        if keystroke_result:
            ks_modifier = keystroke_result.get("confidence_modifier", 0)

        # Weighted fusion
        if keystroke_result and keystroke_result.get("event_count", 0) > 10:
            # Use keystroke as modifier to confidence, not stress
            fused_stress = (
                voice_stress * self.VOICE_WEIGHT
                + face_tension * self.FACE_WEIGHT
                + voice_stress * self.KEYSTROKE_WEIGHT  # Proxy: just reweight voice
            )
        else:
            # No keystroke data — reweight between voice and face
            total = self.VOICE_WEIGHT + self.FACE_WEIGHT
            fused_stress = (
                voice_stress * (self.VOICE_WEIGHT / total)
                + face_tension * (self.FACE_WEIGHT / total)
            )

        # Confidence calculation
        base_confidence = voice_conf * 0.7 + 30  # Voice confidence is primary
        adjusted_confidence = base_confidence + ks_modifier

        # Spoof penalty
        if spoof_result and spoof_result.get("spoof_detected"):
            adjusted_confidence *= 0.5  # Halve confidence if spoof detected
            fused_stress = min(fused_stress + 10, 100)  # Slight stress bump

        fused_stress = max(0, min(100, fused_stress))
        adjusted_confidence = max(0, min(100, adjusted_confidence))

        # Recommendations
        recommendations = self._generate_recommendations(fused_stress, spoof_result)

        return {
            "stress_score": round(fused_stress, 1),
            "stress_level": self._score_to_level(fused_stress),
            "confidence": round(adjusted_confidence, 1),
            "spoof_detected": spoof_result.get("spoof_detected", False) if spoof_result else False,
            "recommendations": recommendations,
            "breakdown": {
                "voice_stress": round(voice_stress, 1),
                "face_tension": round(face_tension, 1),
                "keystroke_modifier": ks_modifier,
                "voice_weight": self.VOICE_WEIGHT,
                "face_weight": self.FACE_WEIGHT,
            },
        }

    def quick_fuse(self, voice_stress: float, face_tension: float) -> dict:
        """Quick fusion for live 5-second updates (no spoof check)."""
        total = self.VOICE_WEIGHT + self.FACE_WEIGHT
        fused = (
            voice_stress * (self.VOICE_WEIGHT / total)
            + face_tension * (self.FACE_WEIGHT / total)
        )
        fused = max(0, min(100, fused))

        return {
            "stress_score": round(fused, 1),
            "stress_level": self._score_to_level(fused),
            "confidence": 70.0,  # Default for quick estimate
        }

    def _generate_recommendations(self, stress: float, spoof_result: Optional[dict]) -> list[str]:
        recs = []

        if stress < 25:
            recs.append("Your stress levels appear low. Keep up your current routine!")
            recs.append("Consider maintaining your wellness practices.")
        elif stress < 50:
            recs.append("Moderate stress detected. Consider a short break or breathing exercise.")
            recs.append("Try the 4-7-8 breathing technique: inhale 4s, hold 7s, exhale 8s.")
        elif stress < 75:
            recs.append("High stress detected. Take a 10-minute break from your current task.")
            recs.append("Physical movement can help — try a short walk or stretching.")
            recs.append("Consider speaking with a colleague or friend about your current workload.")
        else:
            recs.append("Critical stress levels detected. Please prioritize your wellbeing.")
            recs.append("Step away from your workspace for at least 15 minutes.")
            recs.append("Deep breathing and progressive muscle relaxation can help immediately.")
            recs.append("If stress persists, consider reaching out to a mental health professional.")

        if spoof_result and spoof_result.get("spoof_detected"):
            recs.append("Note: Some inconsistencies were detected between your voice and facial expressions. For accurate results, try to respond naturally.")

        return recs

    def _score_to_level(self, score: float) -> str:
        if score < 25:
            return "Low"
        elif score < 50:
            return "Moderate"
        elif score < 75:
            return "High"
        return "Critical"


# Singleton
ensemble = StressEnsemble()
