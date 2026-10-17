from PIL import Image, ImageDraw, ImageFont, ImageFilter

def compose_target_header():
    # 1. Base from card-bg-vertical.jpg
    bg = Image.open('public/card-bg-vertical.jpg').convert('RGBA')
    w = 768
    # We want a clean header of height ~450px
    header = bg.crop((0, 0, w, 450))

    # 2. Extract crown + Eck-RTU Alumni + DEEPAURA 2K26 directly from deepaura-banner.jpg for 100% authenticity
    banner = Image.open('public/deepaura-banner.jpg').convert('RGBA')
    # In deepaura-banner (1376x768):
    # Crown is at y=170..280
    # Eck-RTU Alumni is at y=280..370
    # DEEPAURA 2K26 is at y=370..500
    # Center x is 688. Crop width 860 centered
    emblem_crop = banner.crop((258, 170, 1118, 505))
    
    # Scale emblem to fit 560px width
    target_w = 560
    scale = target_w / emblem_crop.width
    target_h = int(emblem_crop.height * scale)
    emblem_resized = emblem_crop.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Soft vignette mask on emblem crop so it blends into card-bg-vertical navy background
    mask = Image.new('L', (target_w, target_h), 255)
    d_mask = ImageDraw.Draw(mask)
    # Fade left and right edges
    fade_px = 35
    for x in range(fade_px):
        alpha_val = int(255 * (x / fade_px))
        d_mask.line([(x, 0), (x, target_h)], fill=alpha_val)
        d_mask.line([(target_w - 1 - x, 0), (target_w - 1 - x, target_h)], fill=alpha_val)
    # Fade top and bottom slightly
    for y in range(15):
        alpha_val = int(255 * (y / 15))
        for x in range(target_w):
            current = mask.getpixel((x, y))
            mask.putpixel((x, y), min(current, alpha_val))
            current_b = mask.getpixel((x, target_h - 1 - y))
            mask.putpixel((x, target_h - 1 - y), min(current_b, alpha_val))
    
    emblem_resized.putalpha(mask)

    # Paste emblem centered at y = 135
    emblem_x = int((w - target_w) / 2)
    emblem_y = 130
    header.paste(emblem_resized, (emblem_x, emblem_y), emblem_resized)

    # 3. Flanking glowing diyas on left and right of DEEPAURA 2K26
    # Left diya from banner
    diya_left = banner.crop((130, 310, 260, 440))
    # resize diya to 85px wide
    diya_w = 85
    diya_h = int(diya_left.height * (diya_w / diya_left.width))
    diya_left_res = diya_left.resize((diya_w, diya_h), Image.Resampling.LANCZOS)
    
    # Feather mask for diya
    diya_mask = Image.new('L', (diya_w, diya_h), 0)
    dm = ImageDraw.Draw(diya_mask)
    dm.ellipse((6, 6, diya_w - 6, diya_h - 6), fill=255)
    diya_mask = diya_mask.filter(ImageFilter.GaussianBlur(6))
    diya_left_res.putalpha(diya_mask)
    diya_right_res = diya_left_res.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    header.paste(diya_left_res, (18, 230), diya_left_res)
    header.paste(diya_right_res, (w - 18 - diya_w, 230), diya_right_res)

    # 4. Draw Typography
    draw = ImageDraw.Draw(header)
    
    try:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 23)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 14)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/Nirmala.ttc', 28)
    except:
        font_cinzel = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 23)
        font_sub = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 14)
        font_hindi = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 28)

    # ECK-RTU ALUMNI KOTA CHAPTER
    t1 = "ECK-RTU ALUMNI KOTA CHAPTER"
    bb1 = draw.textbbox((0, 0), t1, font=font_cinzel)
    tw1 = bb1[2] - bb1[0]
    t1_x = (w - tw1) / 2
    t1_y = 50
    # Soft golden glow
    for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (0, 2)]:
        draw.text((t1_x + ox, t1_y + oy), t1, font=font_cinzel, fill=(10, 20, 50))
    draw.text((t1_x, t1_y), t1, font=font_cinzel, fill=(255, 255, 255))

    # ANNUAL ALUMNI MEET
    t2 = "ANNUAL ALUMNI MEET"
    bb2 = draw.textbbox((0, 0), t2, font=font_sub)
    tw2 = bb2[2] - bb2[0]
    t2_x = (w - tw2) / 2
    t2_y = 86
    for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        draw.text((t2_x + ox, t2_y + oy), t2, font=font_sub, fill=(10, 20, 50))
    draw.text((t2_x, t2_y), t2, font=font_sub, fill=(253, 224, 71))

    # Hindi Tagline: “दीप जले, यादें मुस्कुराएँ।”
    t3 = "“दीप जले, यादें मुस्कुराएँ।”"
    bb3 = draw.textbbox((0, 0), t3, font=font_hindi)
    tw3 = bb3[2] - bb3[0]
    t3_x = (w - tw3) / 2
    t3_y = 365
    for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1), (0, 2)]:
        draw.text((t3_x + ox, t3_y + oy), t3, font=font_hindi, fill=(15, 25, 60))
    draw.text((t3_x, t3_y), t3, font=font_hindi, fill=(254, 240, 138))

    # Save final header
    final_img = header.convert('RGB')
    final_img.save('public/card-header-target.jpg', quality=95)
    print('Successfully created public/card-header-target.jpg size:', final_img.size)

if __name__ == '__main__':
    compose_target_header()
