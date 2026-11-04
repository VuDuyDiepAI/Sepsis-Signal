"""Generate licensed-by-author fictional PDF/DOCX samples, with Unicode text."""

from pathlib import Path
from xml.sax.saxutils import escape

from docx import Document
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parents[1]
SECTIONS = [
    (
        "1. Chuẩn bị buổi thực hành",
        "Điều dưỡng chuẩn bị phiếu bàn giao giả lập trước buổi đào tạo. Sử dụng mã mô phỏng DEMO-01 trên phiếu. Dữ liệu trong bài tập phải là dữ liệu giả lập, không nhập tên, mã hồ sơ hoặc thông tin người bệnh thật.",
    ),
    (
        "2. Đối soát thông tin bàn giao",
        "Người giao và người nhận cùng đọc thông tin trên phiếu bàn giao mô phỏng. Hai bên đối chiếu mã DEMO-01 và nội dung đã ghi. Nếu thông tin trong bài tập không khớp, ghi nhận điểm chưa rõ và hỏi người hướng dẫn đào tạo.",
    ),
    (
        "3. Xác nhận và lưu bài tập",
        "Sau buổi thực hành, người giao và người nhận cùng ký xác nhận trên phiếu bàn giao giả lập. Phiếu được lưu tại thư mục đào tạo thử nghiệm. Người hướng dẫn ghi nhận kết quả và các điểm cần ôn tập; không dùng bài tập để xác nhận năng lực pháp lý.",
    ),
]
DISCLAIMER = "TÌNH HUỐNG GIẢ LẬP — CHỈ DÙNG THỬ PHẦN MỀM. Không phải quy trình chuyên môn chính thức. Không dùng cho chăm sóc người bệnh hoặc quyết định điều trị."


def create_samples():
    folder = ROOT / "demo"
    folder.mkdir(exist_ok=True)
    fonts = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    font = next((p for p in fonts if p.exists()), None)
    if not font:
        raise RuntimeError("Install DejaVu Sans for Vietnamese PDF samples.")
    pdfmetrics.registerFont(TTFont("DemoUnicode", str(font)))
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            "DemoTitle",
            fontName="DemoUnicode",
            fontSize=20,
            leading=30,
            textColor=HexColor("#14666a"),
            spaceAfter=20,
        )
    )
    styles.add(
        ParagraphStyle(
            "DemoBody", fontName="DemoUnicode", fontSize=12, leading=22, spaceAfter=20
        )
    )
    story = []
    for i, (heading, text) in enumerate(SECTIONS):
        story.extend(
            [
                Paragraph("Quy trình bàn giao giả lập", styles["DemoTitle"]),
                Paragraph(escape(DISCLAIMER), styles["DemoBody"]),
                Spacer(1, 25),
                Paragraph(escape(heading), styles["DemoTitle"]),
                Paragraph(escape(text), styles["DemoBody"]),
            ]
        )
        if i < len(SECTIONS) - 1:
            story.append(PageBreak())

    def footer(c, d):
        c.setFont("DemoUnicode", 9)
        c.setFillColor(HexColor("#70868e"))
        c.drawString(45, 35, f"Tài liệu demo tự tạo • Phiên bản 1.0 • Trang {d.page}")

    pdf = folder / "ban-giao-gia-lap.pdf"
    SimpleDocTemplate(
        str(pdf),
        title="Quy trình bàn giao giả lập",
        author="Clinical Training Hub prototype",
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    doc = Document()
    doc.add_heading("Quy trình bàn giao giả lập", 0)
    doc.add_paragraph(DISCLAIMER)
    for heading, text in SECTIONS:
        doc.add_heading(heading, 1)
        doc.add_paragraph(text)
    docx = folder / "ban-giao-gia-lap.docx"
    doc.save(docx)
    return pdf, docx


if __name__ == "__main__":
    for path in create_samples():
        print(path)
