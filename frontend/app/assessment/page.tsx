"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getLocale, t, type Locale } from "@/app/lib/i18n";
import { AudioProcessor } from "@/app/lib/audio-processor";
import { FaceProcessor } from "@/app/lib/face-processor";
import { KeystrokeTracker } from "@/app/lib/keystroke-tracker";
import { computeStressSnapshot, type StressSnapshot } from "@/app/lib/stress-engine";
import { startAssessment, submitFinalAnalysis, createLiveSocket } from "@/app/lib/api";
import StressGauge from "@/app/components/StressGauge";
import StressLevel from "@/app/components/StressLevel";
import LiveChart from "@/app/components/LiveChart";
import PitchHeatmap from "@/app/components/PitchHeatmap";
import CountdownTimer from "@/app/components/CountdownTimer";
import SpoofBadge from "@/app/components/SpoofBadge";
import { isTermsAccepted } from "@/app/terms/page";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Phase = "idle" | "permission" | "recording" | "processing" | "complete" | "error";

interface FinalResult {
  stress_level: string;
  stress_score: number;
  confidence: number;
  spoof_detected: boolean;
  recommendations: string[];
  breakdown: {
    voice_stress: number;
    face_tension: number;
    keystroke_modifier: number;
  };
}

const TOTAL_DURATION = 60;
const UPDATE_INTERVAL = 5;

export default function AssessmentPage() {
  const [locale, setLoc] = useState<Locale>("en");
  const [phase, setPhase] = useState<Phase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_DURATION);
  const [snapshots, setSnapshots] = useState<StressSnapshot[]>([]);
  const [pitchValues, setPitchValues] = useState<number[]>([]);
  const [chartData, setChartData] = useState<Array<{ time: number; stress: number; voice: number; face: number }>>([]);
  const [currentScore, setCurrentScore] = useState(0);
  const [currentLevel, setCurrentLevel] = useState("Unknown");
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState<string>("");
  const [isPaused, setIsPaused] = useState(false);

  // Refs to avoid stale closures in setInterval/setTimeout callbacks
  const audioRef = useRef<AudioProcessor | null>(null);
  const faceRef = useRef<FaceProcessor | null>(null);
  const keystrokeRef = useRef<KeystrokeTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mutable refs that interval callbacks can read without stale closures
  const snapshotsRef = useRef<StressSnapshot[]>([]);
  const scoreRef = useRef(0);
  const levelRef = useRef("Unknown");
  const confidenceRef = useRef(0);
  const assessmentIdRef = useRef("");
  const userIdRef = useRef("");
  const elapsedRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    setLoc(getLocale());
    let anonId = localStorage.getItem("nervoscan-anon-id");
    if (!anonId) {
      anonId = "anon-" + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("nervoscan-anon-id", anonId);
    }
    const handler = () => setLoc(getLocale());
    window.addEventListener("nervoscan-locale-change", handler);
    return () => window.removeEventListener("nervoscan-locale-change", handler);
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (updateRef.current) clearInterval(updateRef.current);
    audioRef.current?.stop();
    faceRef.current?.stop();
    keystrokeRef.current?.stop();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    audioRef.current = null;
    faceRef.current = null;
    keystrokeRef.current = null;
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const router = useRouter();

  const requestPermissions = async () => {
    // Check T&C acceptance first
    if (!isTermsAccepted()) {
      router.push("/terms");
      return;
    }
    setPhase("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      startRecording();
    } catch {
      setError("Camera and microphone access are required for the assessment.");
      setPhase("error");
    }
  };

  const startRecording = async () => {
    setPhase("recording");
    setSecondsLeft(TOTAL_DURATION);
    setSnapshots([]);
    setPitchValues([]);
    setChartData([]);
    setCurrentScore(0);
    setCurrentLevel("Unknown");
    setCurrentConfidence(0);
    setFinalResult(null);
    setError("");

    // Reset refs
    snapshotsRef.current = [];
    scoreRef.current = 0;
    levelRef.current = "Unknown";
    confidenceRef.current = 0;
    assessmentIdRef.current = "";
    userIdRef.current = "";
    elapsedRef.current = 0;
    finishedRef.current = false;

    try {
      // Initialize processors
      const audio = new AudioProcessor();
      await audio.start();
      audioRef.current = audio;

      const face = new FaceProcessor();
      if (videoRef.current) {
        await face.start(videoRef.current);
      }
      faceRef.current = face;

      const keystrokes = new KeystrokeTracker();
      keystrokes.start();
      keystrokeRef.current = keystrokes;

      // Try to connect to backend
      try {
        const anonId = localStorage.getItem("nervoscan-anon-id") || "anonymous";
        const session = await startAssessment(anonId, locale);
        assessmentIdRef.current = session.assessment_id;
        userIdRef.current = session.user_id;

        // Persist user_id so reports page can fetch history
        localStorage.setItem("nervoscan-user-id", session.user_id);

        // WebSocket for live updates
        const ws = createLiveSocket();
        wsRef.current = ws;
      } catch {
        console.log("Running in offline mode");
      }

      // Countdown timer (1s tick)
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        const remaining = TOTAL_DURATION - elapsedRef.current;
        setSecondsLeft(remaining);

        if (remaining <= 0 && !finishedRef.current) {
          finishedRef.current = true;
          finishRecording();
        }
      }, 1000);

      // 5-second feature extraction loop
      updateRef.current = setInterval(() => {
        extractAndUpdate();
      }, UPDATE_INTERVAL * 1000);

      // First extraction after 2s
      setTimeout(() => extractAndUpdate(), 2000);

    } catch (err: any) {
      setError(err.message || "Failed to start recording");
      setPhase("error");
    }
  };

  const extractAndUpdate = async () => {
    if (!audioRef.current || !faceRef.current) return;

    const audioFeatures = audioRef.current.extractFeatures();
    const faceFeatures = await faceRef.current.extractFeatures();
    const timestampSec = Math.max(5, elapsedRef.current);

    const snapshot = computeStressSnapshot(audioFeatures, faceFeatures, timestampSec);

    // Update refs (for finishRecording to read)
    snapshotsRef.current = [...snapshotsRef.current, snapshot];
    scoreRef.current = snapshot.stress_score;
    levelRef.current = snapshot.stress_level;
    confidenceRef.current = snapshot.confidence;

    // Update state (for UI to render)
    setSnapshots((prev) => [...prev, snapshot]);
    setPitchValues((prev) => [...prev, snapshot.voice.pitch_mean].slice(-12));
    setChartData((prev) => [
      ...prev,
      {
        time: timestampSec,
        stress: snapshot.stress_score,
        voice: snapshot.voice.stress_score,
        face: snapshot.face.tension_score,
      },
    ]);
    setCurrentScore(snapshot.stress_score);
    setCurrentLevel(snapshot.stress_level);
    setCurrentConfidence(snapshot.confidence);

    // Send to WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "snapshot",
          timestamp_sec: timestampSec,
          voice: snapshot.voice,
          face: snapshot.face,
        })
      );
    }
  };

  const finishRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (updateRef.current) clearInterval(updateRef.current);

    setPhase("processing");

    // Read from refs (NOT state — state would be stale here)
    const allSnapshots = snapshotsRef.current;
    const lastScore = scoreRef.current;
    const lastLevel = levelRef.current;
    const lastConfidence = confidenceRef.current;
    const currentAssessmentId = assessmentIdRef.current;
    const keystrokeEvents = keystrokeRef.current?.getEvents() || [];

    // Grab raw audio BEFORE stopping (for backend ML inference)
    const audioData = audioRef.current?.getRecentSamples(5) || { samples: [], sample_rate: 16000 };

    // Stop processors
    audioRef.current?.stop();
    faceRef.current?.stop();
    keystrokeRef.current?.stop();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Try backend final analysis
    try {
      if (currentAssessmentId) {
        const lastSnap = allSnapshots.length > 0 ? allSnapshots[allSnapshots.length - 1] : null;

        // Build voice features: include raw audio samples for ML model + snapshot features as fallback
        const voiceFeatures = {
          ...(lastSnap?.voice || {}),
          audio_samples: audioData.samples,
          sample_rate: audioData.sample_rate,
        };

        const result = await submitFinalAnalysis({
          assessment_id: currentAssessmentId,
          voice_features: voiceFeatures,
          face_features: lastSnap?.face,
          keystroke_events: keystrokeEvents,
          snapshots: allSnapshots.map((s) => ({
            timestamp_sec: s.timestamp_sec,
            stress_score: s.stress_score,
            confidence: s.confidence,
            voice: s.voice,
            face: s.face,
          })),
        });

        setFinalResult(result);
      } else {
        // Offline result
        const avgStress =
          allSnapshots.length > 0
            ? allSnapshots.reduce((sum, s) => sum + s.stress_score, 0) / allSnapshots.length
            : lastScore;

        const lastSnap = allSnapshots.length > 0 ? allSnapshots[allSnapshots.length - 1] : null;

        setFinalResult({
          stress_level: lastLevel,
          stress_score: Math.round(avgStress * 10) / 10,
          confidence: lastConfidence,
          spoof_detected: false,
          recommendations: getOfflineRecommendations(avgStress),
          breakdown: {
            voice_stress: lastSnap?.voice.stress_score ?? 50,
            face_tension: lastSnap?.face.tension_score ?? 50,
            keystroke_modifier: 0,
          },
        });
      }
    } catch {
      // Fallback to local scores
      const lastSnap = allSnapshots.length > 0 ? allSnapshots[allSnapshots.length - 1] : null;
      setFinalResult({
        stress_level: lastLevel,
        stress_score: lastScore,
        confidence: lastConfidence,
        spoof_detected: false,
        recommendations: getOfflineRecommendations(lastScore),
        breakdown: {
          voice_stress: lastSnap?.voice.stress_score ?? 50,
          face_tension: lastSnap?.face.tension_score ?? 50,
          keystroke_modifier: 0,
        },
      });
    }

    setPhase("complete");
  };

  const getOfflineRecommendations = (stress: number): string[] => {
    if (stress < 25) return ["Your stress levels appear low. Keep up your current routine!"];
    if (stress < 50)
      return [
        "Moderate stress detected. Consider a short break.",
        "Try the 4-7-8 breathing technique: inhale 4s, hold 7s, exhale 8s.",
      ];
    if (stress < 75)
      return [
        "High stress detected. Take a 10-minute break.",
        "Physical movement can help — try a short walk or stretching.",
      ];
    return [
      "Critical stress levels. Please prioritize your wellbeing.",
      "Step away from your workspace for at least 15 minutes.",
      "Deep breathing and progressive muscle relaxation can help.",
    ];
  };

  const togglePause = useCallback(() => {
    if (!isPaused) {
      // Pause: clear timers but keep processors alive
      if (timerRef.current) clearInterval(timerRef.current);
      if (updateRef.current) clearInterval(updateRef.current);
      timerRef.current = null;
      updateRef.current = null;
      setIsPaused(true);
    } else {
      // Resume: restart timers from where we left off
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        const remaining = TOTAL_DURATION - elapsedRef.current;
        setSecondsLeft(remaining);
        if (remaining <= 0 && !finishedRef.current) {
          finishedRef.current = true;
          finishRecording();
        }
      }, 1000);
      updateRef.current = setInterval(() => {
        extractAndUpdate();
      }, UPDATE_INTERVAL * 1000);
      setIsPaused(false);
    }
  }, [isPaused]);

  const resetAssessment = () => {
    cleanup();
    setPhase("idle");
    setSecondsLeft(TOTAL_DURATION);
    setSnapshots([]);
    setPitchValues([]);
    setChartData([]);
    setCurrentScore(0);
    setCurrentLevel("Unknown");
    setCurrentConfidence(0);
    setFinalResult(null);
    setError("");
    setIsPaused(false);
    finishedRef.current = false;
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">{t("assessment.title", locale)}</h1>

      {/* IDLE STATE */}
      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="glass-card p-10 text-center max-w-md">
            <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-200 mb-2">
              {t("assessment.ready", locale)}
            </h2>
            <p className="text-sm text-slate-400 mb-8">
              This assessment will record your voice, face, and typing patterns for 60 seconds. All processing happens locally first.
            </p>
            <button
              onClick={requestPermissions}
              className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t("assessment.start", locale)}
            </button>
          </div>
        </div>
      )}

      {/* PERMISSION REQUEST */}
      {phase === "permission" && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="glass-card p-10 text-center max-w-md">
            <div className="animate-spin w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full mx-auto mb-6" />
            <p className="text-slate-300">{t("assessment.permissionNeeded", locale)}</p>
          </div>
        </div>
      )}

      {/* RECORDING STATE */}
      {phase === "recording" && (
        <div className="space-y-6">
          {/* Top row: Timer + Score + Level */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-6 flex flex-col items-center justify-center">
              <div className="relative">
                <div className="recording-pulse relative">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                </div>
              </div>
              <span className="text-xs text-red-400 font-medium mt-3 mb-4">
                {isPaused ? t("assessment.paused", locale) : t("assessment.recording", locale)}
              </span>
              <CountdownTimer seconds={secondsLeft} total={TOTAL_DURATION} />
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={togglePause}
                  className={`px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${isPaused
                    ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                    }`}
                >
                  {isPaused ? (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      {t("assessment.resume", locale)}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                      {t("assessment.pause", locale)}
                    </>
                  )}
                </button>
                <button
                  onClick={finishRecording}
                  className="px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z" />
                  </svg>
                  {t("assessment.stop", locale)}
                </button>
              </div>
            </div>

            <div className="glass-card p-6 flex flex-col items-center justify-center">
              <StressGauge score={currentScore} size={180} label={t("score.stress", locale)} />
              <StressLevel level={currentLevel} />
            </div>

            <div className="glass-card p-6 flex flex-col items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t("score.confidence", locale)}</p>
                <p className="text-3xl font-bold text-slate-200">{Math.round(currentConfidence)}%</p>
              </div>
              <SpoofBadge status="analyzing" />
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-1">Keystroke Events</p>
                <p className="text-lg font-semibold text-slate-300">
                  {keystrokeRef.current?.getStats().count || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Video feed (small) */}
          <div className="glass-card p-4">
            <div className="flex gap-4 items-start">
              <div className="relative w-40 h-30 rounded-lg overflow-hidden bg-slate-900 flex-shrink-0">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 bg-black/50 rounded-full">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[10px] text-white">LIVE</span>
                </div>
              </div>
              <div className="flex-1">
                <PitchHeatmap pitchValues={pitchValues} />
              </div>
            </div>
          </div>

          {/* Live chart */}
          <LiveChart data={chartData} title={t("chart.stressOverTime", locale)} />

          {/* Type here prompt for keystroke capture */}
          <div className="glass-card p-4">
            <p className="text-xs text-slate-500 mb-2">Optional: Type anything below to enhance accuracy with keystroke analysis</p>
            <textarea
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:border-indigo-500/50"
              rows={2}
              placeholder="Type freely — describe your day, how you're feeling, or anything..."
            />
          </div>
        </div>
      )}

      {/* PROCESSING STATE */}
      {phase === "processing" && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="glass-card p-10 text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-6 relative">
              <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-indigo-500 rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-slate-200 mb-2">{t("assessment.processing", locale)}</h2>
            <p className="text-sm text-slate-400">Running final analysis with spoof detection and confidence calibration...</p>
          </div>
        </div>
      )}

      {/* COMPLETE STATE */}
      {phase === "complete" && finalResult && (
        <div className="space-y-6">
          <div className="glass-card p-8 text-center">
            <h2 className="text-2xl font-bold text-slate-100 mb-6">{t("assessment.complete", locale)}</h2>

            <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-8">
              <StressGauge score={finalResult.stress_score} size={220} label={t("score.stress", locale)} />

              <div className="space-y-4 text-left">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">{t("score.level", locale)}</p>
                  <StressLevel level={finalResult.stress_level} large />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">{t("score.confidence", locale)}</p>
                  <p className="text-2xl font-bold text-slate-200">{finalResult.confidence}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">{t("score.spoof", locale)}</p>
                  <SpoofBadge status={finalResult.spoof_detected ? "flagged" : "authentic"} />
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-800/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Voice Stress</p>
                <p className="text-xl font-bold text-green-400">{finalResult.breakdown.voice_stress}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Face Tension</p>
                <p className="text-xl font-bold text-amber-400">{finalResult.breakdown.face_tension}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Keystroke Mod.</p>
                <p className="text-xl font-bold text-indigo-400">{finalResult.breakdown.keystroke_modifier >= 0 ? "+" : ""}{finalResult.breakdown.keystroke_modifier}</p>
              </div>
            </div>
          </div>

          {/* Chart history */}
          {chartData.length > 0 && (
            <LiveChart data={chartData} title="Assessment Timeline" />
          )}

          {/* Recommendations */}
          {finalResult.recommendations.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">{t("recommendation.title", locale)}</h3>
              <ul className="space-y-3">
                {finalResult.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className="w-6 h-6 bg-indigo-500/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-indigo-400 font-medium">{i + 1}</span>
                    </span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={resetAssessment}
              className="px-6 py-3 bg-slate-800 text-slate-200 font-medium rounded-xl hover:bg-slate-700 transition-colors border border-slate-700"
            >
              {t("assessment.retry", locale)}
            </button>
            <Link
              href="/reports"
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all"
            >
              {t("assessment.viewReport", locale)}
            </Link>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {phase === "error" && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="glass-card p-10 text-center max-w-md">
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-200 mb-2">Error</h2>
            <p className="text-sm text-slate-400 mb-6">{error}</p>
            <button
              onClick={resetAssessment}
              className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-colors"
            >
              {t("assessment.retry", locale)}
            </button>
          </div>
        </div>
      )}

      {/* Hidden video element for face processing */}
      {phase !== "recording" && (
        <video ref={videoRef} className="hidden" autoPlay playsInline muted />
      )}
    </div>
  );
}
