"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getLocale, t, type Locale } from "@/app/lib/i18n";

const TERMS_ACCEPTED_KEY = "nervoscan-terms-accepted";

export function isTermsAccepted(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(TERMS_ACCEPTED_KEY) === "true";
}

export default function TermsPage() {
    const router = useRouter();
    const [locale, setLoc] = useState<Locale>("en");
    const [accepted, setAccepted] = useState(false);

    useEffect(() => {
        setLoc(getLocale());
        setAccepted(isTermsAccepted());
        const handler = () => setLoc(getLocale());
        window.addEventListener("nervoscan-locale-change", handler);
        return () => window.removeEventListener("nervoscan-locale-change", handler);
    }, []);

    const handleAccept = () => {
        localStorage.setItem(TERMS_ACCEPTED_KEY, "true");
        setAccepted(true);
        router.push("/assessment");
    };

    const handleDecline = () => {
        router.push("/");
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] px-4 py-8 max-w-3xl mx-auto">
            <div className="glass-card p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-100">{t("terms.title", locale)}</h1>
                </div>

                <p className="text-sm text-slate-400 mb-6">{t("terms.lastUpdated", locale)}: March 27, 2026</p>

                <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using the NervoScan web application ("Service"), you agree to be bound by these
                            Terms and Conditions. If you do not agree to these terms, please do not use the Service.
                            NervoScan is a stress detection tool designed for wellness monitoring purposes only.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">2. Service Description</h2>
                        <p>
                            NervoScan provides AI-powered stress detection through analysis of voice patterns, facial expressions,
                            and keystroke dynamics. The Service records a 60-second session and generates stress level assessments
                            with confidence scores. The results are intended for informational and self-awareness purposes only
                            and should not be considered medical advice.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">3. Data Collection & Privacy</h2>
                        <ul className="list-disc list-inside space-y-1.5 ml-2">
                            <li>Voice, facial expression, and keystroke data are captured during assessment sessions</li>
                            <li>All biometric data is processed locally in your browser first (offline-first architecture)</li>
                            <li><strong>No audio or video recordings are stored</strong> on our servers</li>
                            <li>Only aggregated stress scores and metadata are persisted to our database</li>
                            <li>You can export or delete your data at any time</li>
                            <li>Anonymous user IDs are used by default — no login is required</li>
                            <li>If you sign in with Google, only your email and profile name are stored</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">4. Usage Guidelines</h2>
                        <ul className="list-disc list-inside space-y-1.5 ml-2">
                            <li>The Service is for personal wellness monitoring only</li>
                            <li>Do not use the Service as a substitute for professional medical or mental health advice</li>
                            <li>Ensure you have a stable internet connection for backend analysis features</li>
                            <li>Grant camera and microphone permissions only when you intend to take an assessment</li>
                            <li>Do not attempt to manipulate or spoof the assessment (spoof detection is active)</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">5. Medical Disclaimer</h2>
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                            <p className="text-amber-300">
                                <strong>⚠️ Important:</strong> NervoScan is NOT a medical device and is NOT intended to diagnose,
                                treat, cure, or prevent any disease or medical condition. The stress scores and recommendations
                                provided are based on machine learning algorithms and should be used for informational purposes
                                only. If you are experiencing severe stress, anxiety, or any mental health concerns, please consult
                                a qualified healthcare professional immediately.
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">6. Intellectual Property</h2>
                        <p>
                            All content, features, and functionality of the NervoScan Service — including but not limited to
                            the ML models, algorithms, user interface design, and documentation — are owned by NervoScan and
                            are protected by intellectual property laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">7. Limitation of Liability</h2>
                        <p>
                            NervoScan and its developers shall not be liable for any indirect, incidental, special, consequential,
                            or punitive damages resulting from your use of or inability to use the Service. The Service is
                            provided "as is" without any warranties, express or implied. The maximum accuracy of the ML model
                            is approximately 79.7% (cross-validated on the RAVDESS dataset).
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">8. Changes to Terms</h2>
                        <p>
                            We reserve the right to modify these Terms and Conditions at any time. Changes will be effective
                            immediately upon posting. Your continued use of the Service after changes constitutes acceptance
                            of the revised terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-slate-200 mb-2">9. Contact Information</h2>
                        <p>
                            For questions or concerns about these Terms and Conditions, please reach out through the
                            application's support channels or contact the development team directly.
                        </p>
                    </section>
                </div>

                {/* Accept / Decline */}
                <div className="mt-8 pt-6 border-t border-slate-700">
                    {accepted ? (
                        <div className="flex items-center gap-2 text-green-400 text-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t("terms.alreadyAccepted", locale)}
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={handleAccept}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/25"
                            >
                                {t("terms.accept", locale)}
                            </button>
                            <button
                                onClick={handleDecline}
                                className="flex-1 px-6 py-3 bg-slate-800 text-slate-300 font-semibold rounded-xl hover:bg-slate-700 transition-colors border border-slate-700"
                            >
                                {t("terms.decline", locale)}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
