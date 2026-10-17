from PIL import Image, ImageDraw, ImageFont
import os

fonts = [f for f in os.listdir('C:/Windows/Fonts') if 'nirmala' in f.lower() or 'mangal' in f.lower() or 'aparaj' in f.lower()]
print('Hindi fonts found:', fonts)
for f in fonts:
    try:
        font = ImageFont.truetype(f'C:/Windows/Fonts/{f}', 30)
        im = Image.new('RGB', (500, 100), (5, 14, 44))
        d = ImageDraw.Draw(im)
        d.text((10, 20), "“दीप जले, यादें मुस्कुराएँ।”", font=font, fill=(254, 240, 138))
        im.save(f'scratch/font_test_{f}.png')
        print('Success with font:', f)
    except Exception as e:
        print(f, e)
