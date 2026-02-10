"""
Keystroke Dynamics Module.
Analyzes typing patterns as a confidence modifier.
Not a core stress signal — used to adjust confidence.
"""
import numpy as np
from typing import Optional


class KeystrokeAnalyzer:

    def analyze(self, events: list[dict]) -> dict:
        """
        Analyze keystroke events.
        events: list of {key, timestamp_ms, event_type: 'down'|'up'}
        """
        if not events or len(events) < 10:
            return self._empty_result()

        try:
            down_events = [e for e in events if e.get("event_type") == "down"]
            up_events = [e for e in events if e.get("event_type") == "up"]

            # Dwell times (key down → key up for same key)
            dwell_times = self._compute_dwell_times(down_events, up_events)

            # Flight times (key up → next key down)
            flight_times = self._compute_flight_times(down_events)

            # Error rate (backspace ratio)
            error_rate = self._compute_error_rate(down_events)

            # Typing speed (chars per minute)
            if len(down_events) >= 2:
                total_time_ms = down_events[-1]["timestamp_ms"] - down_events[0]["timestamp_ms"]
                typing_speed = (len(down_events) / max(total_time_ms, 1)) * 60000
            else:
                typing_speed = 0

            # Rhythm regularity (coefficient of variation of flight times)
            rhythm_cv = float(np.std(flight_times) / max(np.mean(flight_times), 1)) if flight_times else 0

            # Stress modifier: higher irregularity and error rate → less confidence in baseline
            confidence_modifier = self._compute_confidence_modifier(
                dwell_times, flight_times, error_rate, rhythm_cv
            )

            return {
                "dwell_mean_ms": round(float(np.mean(dwell_times)), 1) if dwell_times else 0,
                "dwell_std_ms": round(float(np.std(dwell_times)), 1) if dwell_times else 0,
                "flight_mean_ms": round(float(np.mean(flight_times)), 1) if flight_times else 0,
                "flight_std_ms": round(float(np.std(flight_times)), 1) if flight_times else 0,
                "error_rate": round(error_rate, 4),
                "typing_speed_cpm": round(typing_speed, 1),
                "rhythm_cv": round(rhythm_cv, 4),
                "confidence_modifier": round(confidence_modifier, 1),
                "event_count": len(events),
            }

        except Exception as e:
            return self._empty_result(error=str(e))

    def _compute_dwell_times(self, down_events: list, up_events: list) -> list[float]:
        up_map = {}
        for e in up_events:
            key = e.get("key", "")
            if key not in up_map:
                up_map[key] = []
            up_map[key].append(e["timestamp_ms"])

        dwells = []
        for de in down_events:
            key = de.get("key", "")
            if key in up_map and up_map[key]:
                up_ts = up_map[key].pop(0)
                dwell = up_ts - de["timestamp_ms"]
                if 0 < dwell < 2000:
                    dwells.append(dwell)
        return dwells

    def _compute_flight_times(self, down_events: list) -> list[float]:
        flights = []
        for i in range(1, len(down_events)):
            flight = down_events[i]["timestamp_ms"] - down_events[i - 1]["timestamp_ms"]
            if 0 < flight < 5000:
                flights.append(flight)
        return flights

    def _compute_error_rate(self, down_events: list) -> float:
        if not down_events:
            return 0
        backspaces = sum(1 for e in down_events if e.get("key") in ("Backspace", "Delete"))
        return backspaces / len(down_events)

    def _compute_confidence_modifier(
        self, dwell_times: list, flight_times: list, error_rate: float, rhythm_cv: float
    ) -> float:
        """
        Returns a modifier from -20 to +10 for overall confidence.
        Positive = typing patterns consistent (more confident in assessment)
        Negative = erratic typing (less confident in assessment)
        """
        modifier = 0.0

        # High error rate → reduce confidence
        if error_rate > 0.15:
            modifier -= 10
        elif error_rate > 0.08:
            modifier -= 5

        # High rhythm irregularity → reduce confidence
        if rhythm_cv > 0.8:
            modifier -= 8
        elif rhythm_cv > 0.5:
            modifier -= 3

        # Very consistent typing → boost confidence slightly
        if rhythm_cv < 0.3 and error_rate < 0.05:
            modifier += 5

        return max(-20, min(10, modifier))

    def _empty_result(self, error: str = "") -> dict:
        return {
            "dwell_mean_ms": 0,
            "dwell_std_ms": 0,
            "flight_mean_ms": 0,
            "flight_std_ms": 0,
            "error_rate": 0,
            "typing_speed_cpm": 0,
            "rhythm_cv": 0,
            "confidence_modifier": 0,
            "event_count": 0,
            "error": error,
        }


# Singleton
keystroke_analyzer = KeystrokeAnalyzer()
