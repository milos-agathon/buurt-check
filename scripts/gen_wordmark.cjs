const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');

const fontPath = path.resolve(__dirname, '../backend/app/assets/fonts/Satoshi-Black.ttf');
const fontPath2 = path.resolve(__dirname, '../backend/app/assets/fonts/Satoshi-Bold.ttf');

function printPath(fPath, weight) {
    const font = opentype.loadSync(fPath);
    // Let's deduce font size to match height. Existing SVG had wordmark height ~25. 
    // Wait, let's just generate it at font size 72 and see. We can always scale.
    const path = font.getPath('Buurt Check', 0, 50, 36);
    console.log(`--- ${weight} ---`);
    console.log(path.toSVG());
}

try {
    printPath(fontPath, 'Black');
    printPath(fontPath2, 'Bold');
} catch (e) {
    console.error(e);
}
