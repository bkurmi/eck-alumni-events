from PIL import Image, ImageDraw, ImageFont, ImageFilter

def make_perfect_banner():
    # 1. Base top from card-bg-vertical.jpg
    bg = Image.open('public/card-bg-vertical.jpg')
    w = 768
    # Top 380px of card-bg-vertical has the full marigold garland
    top_garland = bg.crop((0, 0, w, 380)).convert('RGBA')

    # 2. Load deepaura-title-banner-feathered.png
    emblem = Image.open('public/deepaura-title-banner-feathered.png').convert('RGBA')
    ew, eh = emblem.size
    # In emblem:
    # y=0..120 is crown
    # y=120..220 is Eck-RTU Alumni
    # y=220..330 is DEEPAURA 2K26
    # y=330..414 is A ROYAL DIWALI REUNION (we can paint over this with dark navy or crop)
    emblem_clean = emblem.crop((0, 0, ew, 325))
    
    # Scale emblem to 590px width
    target_w = 590
    scale = target_w / emblem_clean.width
    target_h = int(emblem_clean.height * scale)
    emblem_res = emblem_clean.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Feather bottom of emblem_res so it merges into deep navy
    em_mask = Image.new('L', (target_w, target_h), 255)
    dm = ImageDraw.Draw(em_mask)
    fade_h = 30
    for y in range(fade_h):
        alpha_val = int(255 * (1.0 - y / fade_h))
        dm.line([(0, target_h - 1 - y), (target_w, target_h - 1 - y)], fill=255 - alpha_val)
    emblem_res.putalpha(em_mask)

    # Base image for top section: width 768, height 400
    canvas = Image.new('RGBA', (w, 400), (5, 14, 44, 255))
    # Paste top garland
    canvas.paste(top_garland, (0, 0))

    # Paste emblem centered at y = 105
    paste_x = int((w - target_w) / 2)
    paste_y = 105
    canvas.paste(emblem_res, (paste_x, paste_y), emblem_res)

    draw = ImageDraw.Draw(canvas)
    
    try:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 24)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 14)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/Nirmala.ttc', 28)
    except:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 24)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 14)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 28)

    # ECK-RTU ALUMNI KOTA CHAPTER
    t1 = "ECK-RTU ALUMNI KOTA CHAPTER"
    bb1 = draw.textbbox((0, 0), t1, font=font_cinzel)
    tw1 = bb1[2] - bb1[0]
    t1_x = (w - tw1) / 2
    t1_y = 42
    # Glowing shadow
    for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (0, 2)]:
        draw.text((t1_x + ox, t1_y + oy), t1, font=font_cinzel, fill=(8, 16, 40))
    draw.text((t1_x, t1_y), t1, font=font_cinzel, fill=(255, 255, 255))

    # ANNUAL ALUMNI MEET
    t2 = "ANNUAL ALUMNI MEET"
    bb2 = draw.textbbox((0, 0), t2, font=font_sub)
    tw2 = bb2[2] - bb2[0]
    t2_x = (w - tw2) / 2
    t2_y = 74
    for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        draw.text((t2_x + ox, t2_y + oy), t2, font=font_sub, fill=(8, 16, 40))
    draw.text((t2_x, t2_y), t2, font=font_sub, fill=(253, 224, 71))

    # Hindi Tagline: “दीप जले, यादें मुस्कुराएँ।”
    t3 = "“दीप जले, यादें मुस्कुराएँ।”"
    bb3 = draw.textbbox((0, 0), t3, font=font_hindi)
    tw3 = bb3[2] - bb3[0]
    t3_x = (w - tw3) / 2
    t3_y = 330
    for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1), (0, 2)]:
        draw.text((t3_x + ox, t3_y + oy), t3, font=font_hindi, fill=(10, 18, 45))
    draw.text((t3_x, t3_y), t3, font=font_hindi, fill=(254, 240, 138))

    # Save
    out = canvas.convert('RGB')
    out.save('public/card-header-target-perfect.jpg', quality=95)
    print('Saved public/card-header-target-perfect.jpg size:', out.size)

if __name__ == '__main__':
    make_perfect_banner()
