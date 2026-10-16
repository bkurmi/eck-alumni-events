from PIL import Image, ImageFilter

def extract_diya():
    bg = Image.open('public/card-bg-vertical.jpg').convert('RGBA')
    crop_box = (45, 1205, 235, 1345)
    diya = bg.crop(crop_box)
    
    # Process pixels using PIL
    w, h = diya.size
    alpha = Image.new('L', (w, h), 0)
    
    src_pixels = diya.load()
    alpha_pixels = alpha.load()
    
    for y in range(h):
        for x in range(w):
            r, g, b, _ = src_pixels[x, y]
            # Warmth check
            brightness = (r + g + b) / 3.0
            is_warm = (r > 60 and r > b * 0.95)
            is_flame = (brightness > 60 and (r + g) > b * 1.6)
            
            if is_flame or is_warm:
                # Calculate opacity based on color intensity
                val = min(255, int(max(r, g) * 1.3))
                alpha_pixels[x, y] = val
            else:
                alpha_pixels[x, y] = 0

    # Smooth the alpha mask
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
    diya.putalpha(alpha)
    diya.save('public/diya-golden.png')
    print('Saved public/diya-golden.png with size:', diya.size)

if __name__ == '__main__':
    extract_diya()
