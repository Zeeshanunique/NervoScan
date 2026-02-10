const translations: Record<string, Record<string, string>> = {
  en: {
    "app.title": "NervoScan",
    "app.subtitle": "AI Stress Detection",
    "app.tagline": "Privacy-aware stress analysis using voice, face & keystroke patterns",
    "nav.home": "Home",
    "nav.assessment": "Assessment",
    "nav.reports": "Reports",
    "nav.settings": "Settings",
    "home.start": "Start Assessment",
    "home.history": "View Reports",
    "home.description": "60-second assessment using your voice, facial expressions, and typing patterns to detect stress levels in real-time.",
    "assessment.title": "Stress Assessment",
    "assessment.ready": "Ready to Begin",
    "assessment.recording": "Recording...",
    "assessment.processing": "Processing...",
    "assessment.complete": "Assessment Complete",
    "assessment.start": "Start Assessment",
    "assessment.stop": "Stop",
    "assessment.retry": "Try Again",
    "assessment.viewReport": "View Full Report",
    "assessment.permissionNeeded": "Camera and microphone access required",
    "assessment.grantAccess": "Grant Access",
    "assessment.countdown": "Time Remaining",
    "score.stress": "Stress Score",
    "score.confidence": "Confidence",
    "score.level": "Stress Level",
    "score.spoof": "Authenticity",
    "level.Low": "Low",
    "level.Moderate": "Moderate",
    "level.High": "High",
    "level.Critical": "Critical",
    "level.Unknown": "Unknown",
    "chart.voicePitch": "Voice Pitch",
    "chart.faceTension": "Face Tension",
    "chart.stressOverTime": "Stress Over Time",
    "report.title": "Assessment Reports",
    "report.trend": "Stress Trend",
    "report.daily": "Daily",
    "report.weekly": "Weekly",
    "report.monthly": "Monthly",
    "report.exportPdf": "Export PDF",
    "report.exportCsv": "Export CSV",
    "report.noData": "No assessments yet. Complete your first assessment to see trends.",
    "privacy.note": "All biometric data is processed locally. No recordings are stored.",
    "spoof.authentic": "Authentic",
    "spoof.flagged": "Inconsistency Detected",
    "recommendation.title": "Recommendations",
  },
  hi: {
    "app.title": "NervoScan",
    "app.subtitle": "AI तनाव पहचान",
    "app.tagline": "आवाज़, चेहरे और कीस्ट्रोक पैटर्न का उपयोग करके गोपनीयता-जागरूक तनाव विश्लेषण",
    "nav.home": "होम",
    "nav.assessment": "आकलन",
    "nav.reports": "रिपोर्ट",
    "nav.settings": "सेटिंग्स",
    "home.start": "आकलन शुरू करें",
    "home.history": "रिपोर्ट देखें",
    "home.description": "आपकी आवाज़, चेहरे के भावों और टाइपिंग पैटर्न का उपयोग करके वास्तविक समय में तनाव स्तर का पता लगाने के लिए 60-सेकंड का आकलन।",
    "assessment.title": "तनाव आकलन",
    "assessment.ready": "शुरू करने के लिए तैयार",
    "assessment.recording": "रिकॉर्डिंग...",
    "assessment.processing": "प्रसंस्करण...",
    "assessment.complete": "आकलन पूर्ण",
    "assessment.start": "आकलन शुरू करें",
    "assessment.stop": "रोकें",
    "assessment.retry": "पुनः प्रयास करें",
    "assessment.viewReport": "पूरी रिपोर्ट देखें",
    "assessment.permissionNeeded": "कैमरा और माइक्रोफ़ोन एक्सेस आवश्यक",
    "assessment.grantAccess": "एक्सेस दें",
    "assessment.countdown": "शेष समय",
    "score.stress": "तनाव स्कोर",
    "score.confidence": "विश्वास",
    "score.level": "तनाव स्तर",
    "score.spoof": "प्रामाणिकता",
    "level.Low": "कम",
    "level.Moderate": "मध्यम",
    "level.High": "उच्च",
    "level.Critical": "गंभीर",
    "level.Unknown": "अज्ञात",
    "chart.voicePitch": "आवाज़ पिच",
    "chart.faceTension": "चेहरे का तनाव",
    "chart.stressOverTime": "समय के साथ तनाव",
    "report.title": "आकलन रिपोर्ट",
    "report.trend": "तनाव प्रवृत्ति",
    "report.daily": "दैनिक",
    "report.weekly": "साप्ताहिक",
    "report.monthly": "मासिक",
    "report.exportPdf": "PDF निर्यात",
    "report.exportCsv": "CSV निर्यात",
    "report.noData": "अभी तक कोई आकलन नहीं। रुझान देखने के लिए अपना पहला आकलन पूरा करें।",
    "privacy.note": "सभी बायोमेट्रिक डेटा स्थानीय रूप से संसाधित होता है। कोई रिकॉर्डिंग संग्रहीत नहीं की जाती।",
    "spoof.authentic": "प्रामाणिक",
    "spoof.flagged": "असंगति पाई गई",
    "recommendation.title": "सिफारिशें",
  },
};

export type Locale = "en" | "hi";

export function t(key: string, locale: Locale = "en"): string {
  return translations[locale]?.[key] || translations["en"]?.[key] || key;
}

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("nervoscan-locale");
  if (stored === "hi" || stored === "en") return stored;
  return "en";
}

export function setLocale(locale: Locale) {
  if (typeof window !== "undefined") {
    localStorage.setItem("nervoscan-locale", locale);
  }
}
