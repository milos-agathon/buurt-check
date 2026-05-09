const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'public/logos/app_icons');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// Common SVG template for the Micro Mark (with closed roof)
// We will scale it into a 512x512 canvas. Safe zone means it shouldn't hit the edges.
// Android and iOS typically put the logo in the center 60-70% of the canvas.
const generateSvg = (houseColor, checkColor, bgColor) => `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${bgColor ? `<rect width="512" height="512" fill="${bgColor}" />` : ''}
  <g transform="translate(136, 136) scale(2.4)">
    <!-- House: closed roof micro mark -->
    <path d="M80,52 L80,80 L20,80 L20,20 L38,5 L64,20 L80,30 Z"
          stroke="${houseColor}" stroke-width="7" stroke-linejoin="round" stroke-linecap="butt" 
          fill="${bgColor === 'transparent' ? 'none' : (bgColor || 'none')}" />
    <!-- Checkmark -->
    <path d="M29.5 54 C31 56, 34 68, 42 78 C48 85, 53 84, 58 78 C65 68, 80 40, 94 18 C95 16, 96 15, 95 14 C93 13, 91 14, 88 18 C78 35, 58 64, 52 70 C47 75, 45 74, 40 68 C34 58, 31 52, 28 50 C26.5 49, 28 52, 29.5 54 Z" 
          fill="${checkColor}"/>
  </g>
</svg>
`;

const tasks = [
    // 3A: Native App Icon badges
    {
        name: 'AppIcon_Dark.png',
        svg: generateSvg('#FFFFFF', '#0D9488', '#171D1C')
    },
    {
        name: 'AppIcon_Light.png',
        svg: generateSvg('#171D1C', '#0D9488', '#FFFFFF')
    },
    {
        name: 'AppIcon_Mono.png',
        svg: generateSvg('#FFFFFF', '#FFFFFF', '#000000') // or polar slate, we'll just export Black/White
    },
    // 3B: PWA manifest icons
    {
        name: 'pwa-512x512.png',
        svg: generateSvg('#171D1C', '#0D9488', null), // transparent bg
        size: 512
    },
    {
        name: 'pwa-192x192.png',
        svg: generateSvg('#171D1C', '#0D9488', null), // transparent bg
        size: 192
    },
    {
        name: 'pwa-512x512-maskable.png',
        svg: generateSvg('#171D1C', '#0D9488', '#F0F4F8'), // light tile bg for maskable
        size: 512
    },
    {
        name: 'pwa-192x192-maskable.png',
        svg: generateSvg('#171D1C', '#0D9488', '#F0F4F8'),
        size: 192
    }
];

async function build() {
    for (const t of tasks) {
        let sh = sharp(Buffer.from(t.svg));
        if (t.size) {
            sh = sh.resize(t.size, t.size);
        }
        await sh.png().toFile(path.join(outDir, t.name));
        console.log("Created", t.name);
    }
}

build().catch(console.error);
