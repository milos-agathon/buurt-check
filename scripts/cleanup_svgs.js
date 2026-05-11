const fs = require('fs');
const path = require('path');

const globPaths = [
    'assets/*.svg',
    'frontend/public/logos/*.svg',
    'frontend/dist/logos/*.svg'
];

const findFiles = (dir, ext) => {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    fs.readdirSync(dir).forEach(file => {
        let fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(findFiles(fullPath, ext));
        } else if (fullPath.endsWith(ext)) {
            results.push(fullPath);
        }
    });
    return results;
};

const allSvgs = globPaths.flatMap(p => {
    const parts = p.split('/');
    const ext = parts.pop().replace('*', '');
    const dir = path.resolve(__dirname, parts.join('/'));
    return findFiles(dir, ext);
});

allSvgs.forEach(svgPath => {
    let content = fs.readFileSync(svgPath, 'utf8');
    let changed = false;

    // 3. Update #111827 to #171D1C in mono SVGs
    if (path.basename(svgPath).includes('mono')) {
        if (content.includes('#111827')) {
            content = content.replace(/#111827/g, '#171D1C');
            changed = true;
        }
    }

    // 4. Remove anim-house and anim-check from buurt-check-mark.svg
    if (path.basename(svgPath) === 'buurt-check-mark.svg') {
        if (content.includes('class="anim-house"')) {
            content = content.replace(/\s*class="anim-house"/g, '');
            changed = true;
        }
        if (content.includes('class="anim-check"')) {
            content = content.replace(/\s*class="anim-check"/g, '');
            changed = true;
        }
    }

    // 5. Fix CSS indentation inside @media (prefers-reduced-motion)
    if (content.includes('@media (prefers-reduced-motion: no-preference) {')) {
        const badIndentation = `.anim-house {
      stroke-dasharray: 230;
      stroke-dashoffset: 230;
      animation: drawHouse 0.3s ease-out forwards;
    }
    .anim-check {
      clip-path: polygon(0% 100%, 0% 100%, 0% 100%);
      animation: revealCheck 0.4s ease-out 0.4s forwards;
    }`;
        const goodIndentation = `    .anim-house {
        stroke-dasharray: 230;
        stroke-dashoffset: 230;
        animation: drawHouse 0.3s ease-out forwards;
      }
      .anim-check {
        clip-path: polygon(0% 100%, 0% 100%, 0% 100%);
        animation: revealCheck 0.4s ease-out 0.4s forwards;
      }`;

        // a more robust regex replacement for the indentation
        if (content.includes('.anim-house {') && !content.includes('    .anim-house {')) {
            content = content.replace(
                /(\s*)\.anim-house {\s*stroke-dasharray: 230;\s*stroke-dashoffset: 230;\s*animation: drawHouse 0.3s ease-out forwards;\s*}\s*\.anim-check {\s*clip-path: polygon\(0% 100%, 0% 100%, 0% 100%\);\s*animation: revealCheck 0.4s ease-out 0.4s forwards;\s*}/g,
                `\n      .anim-house {\n        stroke-dasharray: 230;\n        stroke-dashoffset: 230;\n        animation: drawHouse 0.3s ease-out forwards;\n      }\n      .anim-check {\n        clip-path: polygon(0% 100%, 0% 100%, 0% 100%);\n        animation: revealCheck 0.4s ease-out 0.4s forwards;\n      }`
            );
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(svgPath, content);
        console.log('Cleaned:', path.basename(svgPath));
    }
});
