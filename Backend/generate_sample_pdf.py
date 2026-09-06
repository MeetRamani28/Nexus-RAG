import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_sample_pdf(output_path: str):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Title'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0f172a'),
        alignment=0
    )
    
    heading1 = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0284c7'),
        spaceAfter=10
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=15,
        textColor=colors.HexColor('#334155'),
        spaceAfter=10
    )

    story = []

    # ================= PAGE 1 =================
    story.append(Paragraph("Nexus Tech Corp - Enterprise Financial Report", title_style))
    story.append(Paragraph("<b>Period:</b> Q3 Fiscal Year 2026 | <b>Date:</b> September 2026", body_style))
    story.append(Spacer(1, 15))

    story.append(Paragraph("1. Executive Summary & Financial Highlights", heading1))
    story.append(Paragraph(
        "Nexus Tech Corp delivered strong financial results for the third quarter. "
        "Q3 Net Revenue reached <b>$142.5 Million</b>, representing a <b>18.4% year-over-year growth</b> compared to $120.3 Million in Q3 of the prior fiscal year. "
        "The growth was primarily driven by enterprise software subscription renewals and cloud migration services.",
        body_style
    ))
    story.append(Paragraph(
        "Net Operating Income for the quarter stood at <b>$38.2 Million</b>, yielding an EBITDA margin of <b>26.8%</b>. "
        "Capital expenditure for Research & Development (R&D) was <b>$24.5 Million</b>, focused on artificial intelligence models, vector indexing engines, and infrastructure scalability. "
        "Total Cash Flow from Operating Activities reached <b>$45.1 Million</b>, strengthening our overall liquidity position.",
        body_style
    ))

    # Table 1: Financial Summary
    table_data = [
        ["Financial Metric", "Q3 2025", "Q3 2026", "YoY Change"],
        ["Net Revenue", "$120.3M", "$142.5M", "+18.4%"],
        ["Net Operating Income", "$31.0M", "$38.2M", "+23.2%"],
        ["EBITDA Margin", "25.1%", "26.8%", "+1.7%"],
        ["R&D Expenditure", "$19.8M", "$24.5M", "+23.7%"],
        ["Operating Cash Flow", "$36.5M", "$45.1M", "+23.5%"]
    ]
    t1 = Table(table_data, colWidths=[160, 110, 110, 110])
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8fafc')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1e293b')),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(t1)
    story.append(Spacer(1, 20))

    # ================= PAGE 2 =================
    story.append(PageBreak())
    story.append(Paragraph("2. Regional Performance & Operational Metrics", heading1))
    story.append(Paragraph(
        "<b>North America Division:</b> Generated <b>$85.0 Million</b> in revenue, maintaining a dominant market share of 60% across enterprise accounts. "
        "The region achieved a customer retention rate of 94.2% with a Net Promoter Score (NPS) of <b>+68</b>.",
        body_style
    ))
    story.append(Paragraph(
        "<b>European Division:</b> Delivered <b>$42.5 Million</b> in revenue with EBITDA margins of <b>24.5%</b>. "
        "Growth in Europe accelerated following GDPR regulatory compliance certifications and localized cloud data residency options.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Customer Acquisition & Dividend Policy:</b> Average Customer Acquisition Cost (CAC) was reduced by 12% to <b>$450 per enterprise client</b> due to marketing efficiency. "
        "The Board of Directors declared a quarterly dividend of <b>$0.35 per share</b>, representing a dividend payout ratio of 32%.",
        body_style
    ))

    # Table 2: Regional Breakdown
    table_data_2 = [
        ["Region", "Q3 Revenue", "Market Share", "EBITDA Margin"],
        ["North America", "$85.0 Million", "60.0%", "28.2%"],
        ["Europe", "$42.5 Million", "30.0%", "24.5%"],
        ["Asia-Pacific & Rest of World", "$15.0 Million", "10.0%", "21.0%"]
    ]
    t2 = Table(table_data_2, colWidths=[160, 110, 110, 110])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0284c7')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f0f9ff')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bae6fd')),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#0c4a6e')),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(t2)
    story.append(Spacer(1, 20))

    # ================= PAGE 3 =================
    story.append(PageBreak())
    story.append(Paragraph("3. Risk Factors, Compliance & Infrastructure SLA", heading1))
    story.append(Paragraph(
        "<b>Foreign Exchange Risk:</b> Approximately 30% of revenue is derived outside the United States and subject to EUR/USD and GBP exchange rate volatility. "
        "The company actively hedges foreign currency exposures using forward currency contracts.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Cybersecurity & Compliance:</b> Nexus Tech Corp maintains full compliance with ISO 27001, SOC 2 Type II, and GDPR data privacy frameworks. "
        "Independent third-party audits completed in Q3 reported zero critical security vulnerabilities.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Capital Structure & Outstanding Debt:</b> The total debt-to-equity ratio stands at <b>0.42</b>. "
        "Outstanding senior convertible notes total $50 Million, maturing in 2029 with an annual coupon rate of 3.5%.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Infrastructure & SLA Commitments:</b> Cloud infrastructure maintained an average uptime SLA of <b>99.99%</b> "
        "across multi-region deployments on AWS and Azure. Average vector query retrieval latency was benchmarked at under 150 milliseconds.",
        body_style
    ))

    doc.build(story)
    print(f"Sample PDF successfully generated at: {output_path}")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "sample_financial_report.pdf")
    generate_sample_pdf(os.path.abspath(out))
