from PIL import Image, ImageFilter

def make_clean_diya():
    # Load banner or card-bg-vertical
    im = Image.open('public/card-bg-vertical.jpg')
    # Center bottom diya is at x=340..428, y=1160..1250 in card-bg-vertical
    # Let's crop it precisely
    diya = im.crop((345, 1155, 425, 1245)).convert('RGBA')
    w, h = diya.size
    
    # Create mask: center flame and bowl
    alpha = Image.new('L', (w, h), 0)
    d_pixels = diya.load()
    a_pixels = alpha.load()
    
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            r, g, b, _ = d_pixels[x, y]
            # Diya flame / brass check
            brightness = (r + g + b) / 3.0
            is_flame = (r > 160 and g > 120 and b < 120)
            is_bowl = (r > 80 and r > b * 1.1)
            is_glow = (brightness > 60 and r > b * 1.2)
            
            # Distance from center
            dist = ((x - cx)**2 + (y - cy)**2)**0.5
            if dist < 42 and (is_flame or is_bowl or is_glow):
                # Smooth edge
                fade = min(1.0, max(0.0, (42 - dist) / 10.0))
                a_pixels[x, y] = int(255 * fade)
            else:
                a_pixels[x, y] = 0

    alpha = alpha.filter(ImageFilter.GaussianBlur(1.0))
    diya.putalpha(alpha)
    diya.save('public/diya-glow-clean.png')
    print('Saved public/diya-glow-clean.png size:', diya.size)

if __name__ == '__main__':
    make_clean_diya()
