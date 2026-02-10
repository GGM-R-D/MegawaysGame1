const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'JungleRelicsReelsets.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const symbolOrder = ['Sym1','Sym2','Sym3','Sym4','Sym5','Sym6','Sym7','Sym8','Sym9','Sym10','Sym11','Sym12','Sym13'];

for (const [reelsetName, reels] of Object.entries(data)) {
  console.log('\n========== ' + reelsetName + ' ==========');
  console.log('Number of reel strips: ' + reels.length);
  reels.forEach((strip, reelIndex) => {
    const count = {};
    strip.forEach(s => { count[s] = (count[s] || 0) + 1; });
    console.log('\n  --- Reel ' + (reelIndex + 1) + ' ---  Total symbols: ' + strip.length);
    symbolOrder.forEach(s => {
      if (count[s]) console.log('    ' + s + ': ' + count[s]);
    });
    Object.keys(count).filter(s => !symbolOrder.includes(s)).forEach(s => {
      console.log('    ' + s + ': ' + count[s]);
    });
  });
}
