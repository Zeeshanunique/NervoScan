"""
Report Generation Service.
Generates PDF summaries and CSV exports of assessment data.
"""
import io
import csv
from datetime import datetime, timedelta
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.lib.enums import TA_CENTER, TA_LEFT


class ReportService:

    STRESS_COLORS = {
        "Low": colors.HexColor("#22c55e"),
        "Moderate": colors.HexColor("#eab308"),
        "High": colors.HexColor("#f97316"),
        "Critical": colors.HexColor("#ef4444"),
    }

    def generate_pdf(self, assessment: dict, history: list[dict] = None) -> bytes:
        """Generate PDF report for an assessment."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=20 * mm,
            leftMargin=20 * mm,
            topMargin=20 * mm,
            bottomMargin=20 * mm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "CustomTitle",
            parent=styles["Title"],
            fontSize=24,
            spaceAfter=12,
            textColor=colors.HexColor("#1e293b"),
        )
        heading_style = ParagraphStyle(
            "CustomHeading",
            parent=styles["Heading2"],
            fontSize=16,
            spaceBefore=16,
            spaceAfter=8,
            textColor=colors.HexColor("#334155"),
        )
        body_style = styles["BodyText"]

        elements = []

        # Title
        elements.append(Paragraph("NervoScan Stress Assessment Report", title_style))
        elements.append(Spacer(1, 8))

        # Date
        date_str = assessment.get("completed_at", datetime.utcnow().isoformat())
        elements.append(Paragraph(f"Generated: {date_str}", body_style))
        elements.append(Spacer(1, 20))

        # Summary table
        elements.append(Paragraph("Assessment Summary", heading_style))
        stress_level = assessment.get("stress_level", "Unknown")
        summary_data = [
            ["Metric", "Value"],
            ["Stress Score", f"{assessment.get('stress_score', 0)}/100"],
            ["Stress Level", stress_level],
            ["Confidence", f"{assessment.get('confidence', 0)}%"],
            ["Spoof Detected", "Yes" if assessment.get("spoof_detected") else "No"],
            ["Duration", f"{assessment.get('duration_sec', 60)}s"],
        ]

        table = Table(summary_data, colWidths=[200, 200])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 12),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("FONTSIZE", (0, 1), (-1, -1), 11),
            ("TOPPADDING", (0, 1), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 20))

        # Breakdown
        breakdown = assessment.get("breakdown", {})
        if breakdown:
            elements.append(Paragraph("Score Breakdown", heading_style))
            bd_data = [
                ["Signal", "Score", "Weight"],
                ["Voice Stress", f"{breakdown.get('voice_stress', 0)}", f"{breakdown.get('voice_weight', 0.5) * 100}%"],
                ["Face Tension", f"{breakdown.get('face_tension', 0)}", f"{breakdown.get('face_weight', 0.35) * 100}%"],
                ["Keystroke Modifier", f"{breakdown.get('keystroke_modifier', 0):+}", "Confidence adj."],
            ]
            bd_table = Table(bd_data, colWidths=[160, 120, 120])
            bd_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#475569")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            elements.append(bd_table)
            elements.append(Spacer(1, 20))

        # Recommendations
        recs = assessment.get("recommendations", [])
        if recs:
            elements.append(Paragraph("Recommendations", heading_style))
            for i, rec in enumerate(recs, 1):
                elements.append(Paragraph(f"{i}. {rec}", body_style))
                elements.append(Spacer(1, 4))
            elements.append(Spacer(1, 16))

        # Privacy note
        elements.append(Spacer(1, 30))
        privacy_style = ParagraphStyle(
            "Privacy",
            parent=body_style,
            fontSize=8,
            textColor=colors.HexColor("#94a3b8"),
        )
        elements.append(Paragraph(
            "Privacy Note: All biometric data is processed locally on your device. "
            "Only aggregated scores are stored. No audio or video recordings are retained. "
            "This report is generated for personal wellness tracking only and is not a medical diagnosis.",
            privacy_style,
        ))

        doc.build(elements)
        return buffer.getvalue()

    def generate_csv(self, assessments: list[dict]) -> str:
        """Generate CSV export of multiple assessments."""
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "Date",
            "Stress Score",
            "Stress Level",
            "Confidence",
            "Spoof Detected",
            "Voice Stress",
            "Face Tension",
            "Keystroke Modifier",
            "Duration (s)",
        ])

        for a in assessments:
            breakdown = a.get("breakdown", {})
            writer.writerow([
                a.get("completed_at", ""),
                a.get("stress_score", ""),
                a.get("stress_level", ""),
                a.get("confidence", ""),
                a.get("spoof_detected", False),
                breakdown.get("voice_stress", ""),
                breakdown.get("face_tension", ""),
                breakdown.get("keystroke_modifier", ""),
                a.get("duration_sec", 60),
            ])

        return output.getvalue()


# Singleton
report_service = ReportService()
