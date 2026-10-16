from PIL import Image, ImageDraw, ImageFilter

def make_vignette_diya():
    bg = Image.open('public/card-bg-vertical.jpg').convert('RGBA')
    # Center-left diya on the floor
    diya = bg.crop((45, 1205, 235, 1345))
    w, h = diya.size
    
    # Create radial feather mask centered on flame & diya bowl
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    # Flame is around x=95, y=35. Bowl is around x=95, y=95.
    d.ellipse((10, 10, w - 10, h - 10), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(12))
    
    diya.putalpha(mask)
    # Resize to convenient badge size (e.g. 70x52)
    diya_small = diya.resize((76, 56), Image.Resampling.LANCZOS)
    diya_small.save('public/diya-golden-flame.png')
    print('Saved public/diya-golden-flame.png')

if __name__ == '__main__':
    make_vignette_diya()
