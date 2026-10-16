import sys
from PIL import Image, ImageDraw, ImageFont

def make_perfect_header():
    im = Image.open('public/banner-raw-top.jpg')
    w, h = im.size

    # In banner-raw-top.jpg:
    # Top marigolds are at y=0..120
    # Left logo is around x=30, y=30
    # Right logo is around x=1200, y=30
    # Crown is at y=170..280
    # ECK-RTU ALUMNI is at y=280..360
    # DEEPAURA 2K26 is at y=360..480
    # A ROYAL DIWALI REUNION is at y=490..530

    # Let's crop sides slightly if needed, or keep full 1376 width
    # Extend bottom by 90px to comfortably place 'दीप जले, यादें मुस्कुराएँ।'
    total_h = h + 90
    new_im = Image.new('RGB', (w, total_h), (5, 14, 44))
    new_im.paste(im, (0, 0))

    draw = ImageDraw.Draw(new_im)

    try:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 28)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 18)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/Nirmala.ttc', 34)
    except:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 28)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 30)

    # 1. ECK RTU ALUMNI KOTA CHAPTER at top
    t1 = "ECK RTU ALUMNI KOTA CHAPTER"
    bb1 = draw.textbbox((0, 0), t1, font=font_cinzel)
    tw1 = bb1[2] - bb1[0]
    draw.text(((w - tw1) / 2, 80), t1, font=font_cinzel, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))

    # 2. ANNUAL ALUMNI MEET
    t2 = "ANNUAL ALUMNI MEET"
    bb2 = draw.textbbox((0, 0), t2, font=font_sub)
    tw2 = bb2[2] - bb2[0]
    draw.text(((w - tw2) / 2, 120), t2, font=font_sub, fill=(253, 224, 71), stroke_width=2, stroke_fill=(0, 0, 0))

    # 3. Hindi tagline: दीप जले, यादें मुस्कुराएँ।
    t3 = "\u201c\u0926\u0940\u095code\u0020\u091c\u0932\u0947\u002c\u0020\u092f\u093e\u0926\u0947\u0902\u0020\u092e\u0941\u0938\u094d\u0915\u0941\u0930\u093e\u090f\u0901\u0964\u201d"
    t3 = "“दीप जले, यादें मुस्कुराएँ।”"
    bb3 = draw.textbbox((0, 0), t3, font=font_hindi)
    tw3 = bb3[2] - bb3[0]
    draw.text(((w - tw3) / 2, h + 18), t3, font=font_hindi, fill=(254, 240, 138), stroke_width=3, stroke_fill=(20, 10, 0))

    new_im.save('public/card-header-banner.jpg', quality=95)
    print("Successfully created public/card-header-banner.jpg with dimensions:", new_im.size)

if __name__ == '__main__':
    make_perfect_header()
