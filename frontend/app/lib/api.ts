const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export async function startAssessment(anonymousId: string, locale: string = "en") {
  const res = await fetch(`${API_URL}/assessment/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymous_id: anonymousId, locale }),
  });
  if (!res.ok) throw new Error("Failed to start assessment");
  return res.json();
}

export async function submitFinalAnalysis(data: {
  assessment_id: string;
  voice_features?: any;
  face_features?: any;
  keystroke_events?: any[];
  snapshots?: any[];
}) {
  const res = await fetch(`${API_URL}/assessment/final`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit analysis");
  return res.json();
}

export function createLiveSocket(): WebSocket {
  return new WebSocket(`${WS_URL}/assessment/live`);
}

export async function getReports(userId: string, days: number = 30) {
  const res = await fetch(`${API_URL}/reports/${userId}?days=${days}`);
  if (!res.ok) throw new Error("Failed to get reports");
  return res.json();
}

export function getExportPdfUrl(assessmentId: string): string {
  return `${API_URL}/export/pdf?assessment_id=${assessmentId}`;
}

export function getExportCsvUrl(userId: string, days: number = 30): string {
  return `${API_URL}/export/csv?user_id=${userId}&days=${days}`;
}
