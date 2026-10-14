import os
import glob
from PIL import Image, ImageDraw, ImageFont, ImageFilter

os.makedirs('store_assets', exist_ok=True)
os.makedirs('/home/muhammed/Masaüstü/store_assets', exist_ok=True)

# 1. Load Fonts
font_dir = 'node_modules/@expo-google-fonts/plus-jakarta-sans'
font_extrabold = glob.glob(f'{font_dir}/**/PlusJakartaSans_800ExtraBold.ttf', recursive=True)[0]
font_bold = glob.glob(f'{font_dir}/**/PlusJakartaSans_700Bold.ttf', recursive=True)[0]
font_semibold = glob.glob(f'{font_dir}/**/PlusJakartaSans_600SemiBold.ttf', recursive=True)[0]
font_medium = glob.glob(f'{font_dir}/**/PlusJakartaSans_500Medium.ttf', recursive=True)[0]
font_regular = glob.glob(f'{font_dir}/**/PlusJakartaSans_400Regular.ttf', recursive=True)[0]

print('Using fonts from:', font_dir)

# ─── Helper Functions ──────────────────────────────────────────────────────────

def create_gradient_bg(width, height, top_color, bottom_color):
    """Vertical linear gradient"""
    base = Image.new('RGB', (width, height), top_color)
    top_r, top_g, top_b = top_color
    bot_r, bot_g, bot_b = bottom_color
    
    gradient = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(gradient)
    for y in range(height):
        factor = y / float(height)
        r = int(top_r + (bot_r - top_r) * factor)
        g = int(top_g + (bot_g - top_g) * factor)
        b = int(top_b + (bot_b - top_b) * factor)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return gradient

def add_radial_glow(img, cx, cy, radius, glow_color, alpha_max=120):
    """Draw a soft glow circle"""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    steps = 40
    gr, gg, gb = glow_color
    for i in range(steps):
        r = radius * (1 - i / steps)
        a = int(alpha_max * (1 - i / steps) ** 1.8)
        bbox = [cx - r, cy - r, cx + r, cy + r]
        draw.ellipse(bbox, fill=(gr, gg, gb, a))
        
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius // 4))
    img.paste(overlay, (0, 0), overlay)

def create_rounded_mask(size, radius):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), size], radius=radius, fill=255)
    return mask

def draw_phone_frame(screen_img, target_w=840, target_h=1800, bezel=14, corner_radius=54):
    """Wraps an in-app screenshot inside a realistic modern phone mockup"""
    # Scale screenshot to fit inside bezel
    inner_w = target_w - bezel * 2
    inner_h = target_h - bezel * 2
    resized_screen = screen_img.resize((inner_w, inner_h), Image.Resampling.LANCZOS)
    
    # Inner mask for screen corners
    screen_mask = create_rounded_mask((inner_w, inner_h), corner_radius - 8)
    
    # Outer frame canvas with room for shadow
    pad = 60
    canvas_w = target_w + pad * 2
    canvas_h = target_h + pad * 2
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    
    # 1. Soft Drop Shadow
    shadow = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_bbox = [pad + 6, pad + 16, pad + target_w - 6, pad + target_h + 24]
    s_draw.rounded_rectangle(s_bbox, radius=corner_radius, fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas.paste(shadow, (0, 0), shadow)
    
    # 2. Outer Bezel / Chassis
    phone_layer = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 0))
    p_draw = ImageDraw.Draw(phone_layer)
    # Chassis body (Dark titanium #1E293B with metallic rim #475569)
    p_draw.rounded_rectangle([(0, 0), (target_w, target_h)], radius=corner_radius, fill=(24, 30, 42, 255), outline=(71, 85, 105, 255), width=2)
    
    # 3. Paste clipped screen
    phone_layer.paste(resized_screen, (bezel, bezel), screen_mask)
    
    # 4. Camera Punch Hole (Modern subtle punch hole)
    cam_size = 18
    cam_x = target_w // 2 - cam_size // 2
    cam_y = bezel + 12
    p_draw.ellipse([cam_x, cam_y, cam_x + cam_size, cam_y + cam_size], fill=(10, 10, 15, 255), outline=(40, 40, 50, 255), width=1)
    
    # Inner highlight rim
    p_draw.rounded_rectangle([(bezel, bezel), (bezel + inner_w, bezel + inner_h)], radius=corner_radius - 8, outline=(255, 255, 255, 25), width=1)
    
    # Composite phone on canvas
    canvas.paste(phone_layer, (pad, pad), phone_layer)
    return canvas

# ─── 1. App Icon (512 x 512 px) ────────────────────────────────────────────────
def generate_app_icon():
    print('Generating 512x512 App Icon...')
    src = Image.open('assets/icon.png').convert('RGBA')
    icon_512 = src.resize((512, 512), Image.Resampling.LANCZOS)
    out_path = 'store_assets/00_app_icon_512x512.png'
    icon_512.save(out_path, 'PNG', optimize=True)
    icon_512.save('/home/muhammed/Masaüstü/store_assets/00_app_icon_512x512.png', 'PNG', optimize=True)
    print('Saved:', out_path)

# ─── 2. Feature Graphic (1024 x 500 px) ─────────────────────────────────────────
def generate_feature_graphic():
    print('Generating 1024x500 Feature Graphic...')
    width, height = 1024, 500
    bg = create_gradient_bg(width, height, (15, 23, 42), (24, 39, 75))
    add_radial_glow(bg, 820, 250, 360, (59, 130, 246), alpha_max=100)
    add_radial_glow(bg, 180, 120, 260, (99, 102, 241), alpha_max=70)
    
    draw = ImageDraw.Draw(bg)
    
    # Left Content: App Icon badge
    icon_src = Image.open('assets/icon.png').convert('RGBA').resize((108, 108), Image.Resampling.LANCZOS)
    icon_mask = create_rounded_mask((108, 108), 26)
    
    # Icon shadow
    icon_shadow = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(icon_shadow)
    s_draw.rounded_rectangle([6, 8, 122, 124], radius=28, fill=(0, 0, 0, 140))
    icon_shadow = icon_shadow.filter(ImageFilter.GaussianBlur(10))
    bg.paste(icon_shadow, (50, 42), icon_shadow)
    bg.paste(icon_src, (60, 50), icon_mask)
    
    # App Title & Subtitle
    font_title = ImageFont.truetype(font_extrabold, 46)
    font_sub = ImageFont.truetype(font_semibold, 21)
    
    draw.text((188, 62), 'Atölye Defteri', font=font_title, fill=(255, 255, 255))
    draw.text((190, 120), 'Tekstil Puantaj, Avans & Bordro', font=font_sub, fill=(147, 197, 253))
    
    # Feature Bullet Points
    bullets = [
        '✓ Tek Dokunuşla Günlük Puantaj & Mesai',
        '✓ Otomatik Avans, Borç ve Taksit Takibi',
        '✓ Tek Tıkla Ay Sonu Net Bordro Hesabı',
        '✓ Çevrimdışı (İnternetsiz) & Güvenli Bulut',
    ]
    font_bullet = ImageFont.truetype(font_medium, 18)
    
    start_y = 200
    for b in bullets:
        # Subtle badge background for bullet
        draw.rounded_rectangle([60, start_y, 480, start_y + 36], radius=8, fill=(30, 41, 59, 180), outline=(51, 65, 85, 200), width=1)
        draw.text((74, start_y + 8), b, font=font_bullet, fill=(241, 245, 249))
        start_y += 48
    
    # Right Side: Phone mockup
    screen_src = Image.open('raw_screen_1_bugun.png').convert('RGBA')
    phone = draw_phone_frame(screen_src, target_w=360, target_h=780, bezel=10, corner_radius=36)
    
    # Paste phone overlapping right side (top at 40)
    bg.paste(phone, (590, 20), phone)
    
    out_path = 'store_assets/01_feature_graphic_1024x500.png'
    bg.save(out_path, 'PNG', optimize=True)
    bg.save('/home/muhammed/Masaüstü/store_assets/01_feature_graphic_1024x500.png', 'PNG', optimize=True)
    print('Saved:', out_path)

# ─── 3. Phone Screenshots (1080 x 2400 px, 9:20 ratio) ────────────────────────
def generate_phone_screenshot(index, raw_img_path, tag, headline, subheadline, glow_color, out_name):
    print(f'Generating Screenshot {index}: {headline}...')
    width, height = 1080, 2400
    
    # Top-to-bottom dark gradient
    bg = create_gradient_bg(width, height, (13, 19, 33), (20, 29, 50))
    add_radial_glow(bg, width // 2, 1300, 520, glow_color, alpha_max=95)
    add_radial_glow(bg, width // 2, 350, 400, (30, 41, 59), alpha_max=60)
    
    draw = ImageDraw.Draw(bg)
    
    # 1. Tag Badge Pill
    font_tag = ImageFont.truetype(font_bold, 28)
    tag_w = int(draw.textlength(tag, font=font_tag))
    tag_pad_x = 28
    tag_pad_y = 12
    tag_x1 = width // 2 - (tag_w // 2 + tag_pad_x)
    tag_x2 = width // 2 + (tag_w // 2 + tag_pad_x)
    tag_y1 = 120
    tag_y2 = tag_y1 + 52
    
    # Pill bg
    draw.rounded_rectangle([tag_x1, tag_y1, tag_x2, tag_y2], radius=26, fill=(30, 41, 59, 220), outline=glow_color, width=2)
    draw.text((tag_x1 + tag_pad_x, tag_y1 + 10), tag, font=font_tag, fill=glow_color)
    
    # 2. Main Headline (Bold, White, Centered)
    font_head = ImageFont.truetype(font_extrabold, 62)
    head_w = int(draw.textlength(headline, font=font_head))
    draw.text((width // 2 - head_w // 2, 205), headline, font=font_head, fill=(255, 255, 255))
    
    # 3. Subheadline (Medium, Soft Gray, Centered)
    font_sub = ImageFont.truetype(font_medium, 33)
    sub_w = int(draw.textlength(subheadline, font=font_sub))
    draw.text((width // 2 - sub_w // 2, 295), subheadline, font=font_sub, fill=(148, 163, 184))
    
    # 4. Smartphone Mockup
    screen_src = Image.open(raw_img_path).convert('RGBA')
    phone = draw_phone_frame(screen_src, target_w=820, target_h=1800, bezel=14, corner_radius=54)
    
    # Center phone horizontally, position Y at 420
    phone_x = width // 2 - phone.width // 2
    phone_y = 420
    bg.paste(phone, (phone_x, phone_y), phone)
    
    out_path = f'store_assets/{out_name}'
    bg.save(out_path, 'PNG', optimize=True)
    bg.save(f'/home/muhammed/Masaüstü/store_assets/{out_name}', 'PNG', optimize=True)
    print(f'Saved: {out_path}')

# ─── Run All ───────────────────────────────────────────────────────────────────
generate_app_icon()
generate_feature_graphic()

screenshots_config = [
    (
        1,
        'raw_screen_1_bugun.png',
        'GÜNLÜK ATÖLYE DURUMU',
        'Bugünün Özeti ve Yoklaması',
        'Atölyedeki çalışan sayısı, devamsızlık ve tahmini maaş',
        (59, 130, 246),
        'screenshot_1_bugun.png'
    ),
    (
        2,
        'raw_screen_2_puantaj.png',
        'HIZLI VE PRATİK',
        'Tek Dokunuşla Günlük Puantaj',
        'Geldi, mesai, izin veya rapor; saniyeler içinde kaydedin',
        (16, 185, 129),
        'screenshot_2_puantaj.png'
    ),
    (
        3,
        'raw_screen_3_personel.png',
        'KADRO YÖNETİMİ',
        'Tüm Çalışanlar Tek Listede',
        'Bölümler, maaş tipleri, kalan avans bakiyeleri ve iletişim',
        (139, 92, 246),
        'screenshot_3_personel.png'
    ),
    (
        4,
        'raw_screen_4_para.png',
        'FİNANS VE KASA',
        'Avans ve Borç Taksit Takibi',
        'Verilen avanslar, taksitler ve kalan borçlar otomatik düşülür',
        (245, 158, 11),
        'screenshot_4_avans.png'
    ),
    (
        5,
        'raw_screen_5_bordro.png',
        'AY SONU HAKEDİŞ',
        'Maaş ve Bordro Yönetimi',
        'Her ay için net hesaplama, hakediş kontrolü ve kesinleştirme',
        (6, 182, 212),
        'screenshot_5_bordro.png'
    ),
]

for idx, raw_path, tag, head, sub, glow, out_name in screenshots_config:
    generate_phone_screenshot(idx, raw_path, tag, head, sub, glow, out_name)

print('\nAll Play Store assets generated successfully!')
