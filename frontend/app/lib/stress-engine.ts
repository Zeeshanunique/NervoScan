/**
 * Offline Stress Engine — runs in-browser using heuristics.
 * Mirrors backend ensemble logic for offline-first 30-second capability.
 * In production, replace with TF.js model inference.
 */

import type { AudioFeatures } from "./audio-processor";
import type { FaceFeatures } from "./face-processor";

export interface StressSnapshot {
  timestamp_sec: number;
  stress_score: number;
  stress_level: string;
  confidence: number;
  voice: {
    stress_score: number;
    pitch_mean: number;
    energy_mean: number;
  };
  face: {
    tension_score: number;
    eye_openness: number;
    brow_tension: number;
  };
}

const VOICE_WEIGHT = 0.55;
const FACE_WEIGHT = 0.45;

export function computeStressSnapshot(
  audio: AudioFeatures,
  face: FaceFeatures,
  timestampSec: number
): StressSnapshot {
  // Voice stress heuristic
  let voiceStress = 50;
  if (audio.pitch > 200) voiceStress += Math.min((audio.pitch - 200) * 0.15, 15);
  if (audio.pitch > 0 && audio.pitch < 120) voiceStress -= Math.min((120 - audio.pitch) * 0.1, 10);
  if (audio.rms > 0.1) voiceStress += Math.min((audio.rms - 0.1) * 80, 10);
  if (audio.spectralCentroid > 2000) voiceStress += Math.min((audio.spectralCentroid - 2000) * 0.005, 10);
  voiceStress = clamp(voiceStress, 0, 100);

  // Face tension
  const faceTension = clamp(face.tensionScore, 0, 100);

  // Fusion
  const fused = voiceStress * VOICE_WEIGHT + faceTension * FACE_WEIGHT;
  const stressScore = clamp(fused, 0, 100);

  // Confidence based on signal quality
  let confidence = 50;
  if (audio.rms > 0.01) confidence += 20;
  if (audio.pitch > 0) confidence += 15;
  if (face.landmarks.length > 0) confidence += 15;
  else if (face.tensionScore > 0) confidence += 5;
  confidence = clamp(confidence, 0, 100);

  return {
    timestamp_sec: timestampSec,
    stress_score: round(stressScore, 1),
    stress_level: scoreToLevel(stressScore),
    confidence: round(confidence, 1),
    voice: {
      stress_score: round(voiceStress, 1),
      pitch_mean: round(audio.pitch, 1),
      energy_mean: round(audio.rms, 4),
    },
    face: {
      tension_score: round(faceTension, 1),
      eye_openness: round(face.eyeOpenness, 4),
      brow_tension: round(face.browTension, 4),
    },
  };
}

function scoreToLevel(score: number): string {
  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 75) return "High";
  return "Critical";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}
