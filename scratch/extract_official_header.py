from PIL import Image

def extract_official_header():
    # User's uploaded target image
    target = Image.open('C:/Users/BhaweshKurmi/.gemini/antigravity-ide/brain/2749f86e-181c-4dfb-8020-17264f9f709c/.user_uploaded/media_1792151051753.jpg')
    w, h = target.size
    print('Target image dimensions:', w, h)
    
    # In target image (572 x 1024):
    # Top banner ends right above the attendee card at y=228
    header_crop = target.crop((0, 0, w, 228))
    
    # Save as high quality JPEG and PNG
    header_crop.save('public/card-header-official.jpg', quality=98)
    header_crop.save('public/card-header-official.png', quality=98)
    print('Successfully saved public/card-header-official.jpg size:', header_crop.size)

if __name__ == '__main__':
    extract_official_header()
