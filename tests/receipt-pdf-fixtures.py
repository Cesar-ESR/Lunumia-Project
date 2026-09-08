"""Generate synthetic, non-personal receipt PDFs for manual/browser QA."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw

output = Path('tmp/pdfs')
output.mkdir(parents=True, exist_ok=True)
lines = ['BBVA Mexico', '19/05/2026', 'Importe de pago: 803.00 MXN',
         'Efectivo depositado: 850.00 MXN', 'Cambio: 47.00 MXN', 'COMPROBANTE SINTETICO - QA']
image = Image.new('RGB', (1200, 900), 'white')
draw = ImageDraw.Draw(image)
for index, line in enumerate(lines):
    draw.text((70, 80 + index * 110), line, fill='black', font_size=42)
image.save(output / 'receipt-synthetic.png')
pdf = canvas.Canvas(str(output / 'receipt-scanned.pdf'), pagesize=(600, 450))
pdf.drawImage(ImageReader(image), 0, 0, width=600, height=450)
pdf.save()
pdf = canvas.Canvas(str(output / 'receipt-text.pdf'), pagesize=(600, 450))
pdf.setFont('Helvetica', 18)
for index, line in enumerate(lines):
    pdf.drawString(35, 400 - index * 55, line)
pdf.save()
