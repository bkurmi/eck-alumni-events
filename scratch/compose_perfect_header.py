import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def make_perfect_header():
    # 1. Base top from card-bg-vertical.jpg
    bg = Image.open('public/card-bg-vertical.jpg')
    w, _ = bg.size
    # Top 380px captures the full marigold garland, mandala, and hanging lamps
    top_h = 390
    header = bg.crop((0, 0, w, top_h)).convert('RGBA')

    # 2. Golden DeepAura Lockup
    lockup = Image.open('public/deepaura-gold-lockup.png').convert('RGBA')
    target_w = 600
    scale = target_w / lockup.width
    target_h = int(lockup.height * scale)
    lockup_resized = lockup.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Paste centered
    lockup_x = int((w - target_w) / 2)
    lockup_y = 120
    header.paste(lockup_resized, (lockup_x, lockup_y), lockup_resized)

    # 3. Two glowing diyas flanking DEEPAURA 2K26
    # Let's crop clean diya from card-bg-vertical bottom floor
    diya_crop = bg.crop((45, 1215, 230, 1340)).convert('RGBA')
    # Soft circular feather on diya
    mask = Image.new('L', diya_crop.size, 0)
    d_mask = ImageDraw.Draw(mask)
    d_mask.ellipse((10, 10, diya_crop.width - 10, diya_crop.height - 10), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(8))
    diya_crop.putalpha(mask)

    diya_scale = 100 / diya_crop.width
    diya_h = int(diya_crop.height * diya_scale)
    diya_resized = diya_crop.resize((100, diya_h), Image.Resampling.LANCZOS)
    diya_mirrored = diya_resized.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    # Place on left and right
    header.paste(diya_resized, (8, 195), diya_resized)
    header.paste(diya_mirrored, (w - 108, 195), diya_mirrored)

    # 4. Text overlays
    draw = ImageDraw.Draw(header)
    try:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 24)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 15)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/Nirmala.ttc', 26)
    except:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 24)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 15)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 26)

    # ECK-RTU ALUMNI KOTA CHAPTER
    t1 = "ECK-RTU ALUMNI KOTA CHAPTER"
    bb1 = draw.textbbox((0, 0), t1, font=font_cinzel)
    tw1 = bb1[2] - bb1[0]
    draw.text(((w - tw1) / 2, 45), t1, font=font_cinzel, fill=(255, 255, 255), stroke_width=2, stroke_fill=(10, 20, 50))

    # ANNUAL ALUMNI MEET
    t2 = "ANNUAL ALUMNI MEET"
    bb2 = draw.textbbox((0, 0), t2, font=font_sub)
    tw2 = bb2[2] - bb2[0]
    draw.text(((w - tw2) / 2, 80), t2, font=font_sub, fill=(253, 224, 71), stroke_width=1, stroke_fill=(10, 20, 50))

    # Hindi Tagline: “दीप जले, यादें मुस्कुराएँ।”
    t3 = "“दीप जले, यादें मुस्कुराएँ।”"
    bb3 = draw.textbbox((0, 0), t3, font=font_hindi)
    tw3 = bb3[2] - bb3[0]
    draw.text(((w - tw3) / 2, 335), t3, font=font_hindi, fill=(254, 240, 138), stroke_width=2, stroke_fill=(15, 25, 60))

    # Convert to RGB and save
    final_img = header.convert('RGB')
    final_img.save('public/card-header-art.jpg', quality=95)
    print('Successfully created public/card-header-art.jpg (size:', final_img.size, ')')

if __name__ == '__main__':
    make_perfect_header()
