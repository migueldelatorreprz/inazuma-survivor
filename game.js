/* ======================================================================
   INAZUMA SURVIVOR
   Fan game inspirado en el género "survivor" (oleadas) con ambientación
   de Inazuma Eleven. El partido dura 30 minutos.
   ====================================================================== */

/* ======================================================================
   CAMPO — el campo de tierra del Instituto Raimon, hasta las vallas bajas
   Se dibuja con CASILLAS de la hoja de Kenney ("Roguelike Modern City pack",
   CC0, en assets/city). Una casilla = 16 px en la hoja = 48 px de mundo.
   La distribución sale SOLO de este bloque; el dibujo está en drawPitch().
   ====================================================================== */
const TILE = 48;                  // lado de una casilla en el mundo
const TILE_SRC = 16;              // lado de una casilla en la hoja de sprites
const TILE_GAP = 1;               // separación entre casillas en la hoja
const PX = TILE / TILE_SRC;       // 3 px de mundo por cada píxel de la hoja

const CAMPUS = {
  cols: 64, rows: 40,             // zona jugable (toda de tierra), cerrada por las vallas bajas
  /* líneas del campo en px de mundo, centradas en la tierra */
  pitch: { x: 234, y: 210, w: 2604, h: 1500 },
  /* vallas bajas de hormigón alrededor de la tierra (en px de la hoja) */
  fence: { block: 20, gap: 10, thick: 8 },
  /* decorado de fuera de las vallas (césped y árboles, no se puede pisar) */
  border: 21,                     // casillas de decorado a cada lado
  treeEvery: 9,                   // 1 de cada ~9 casillas de césped lleva árbol o arbusto
};

/* Dimensiones del campo (coordenadas de mundo). El jugador y los rivales
   quedan confinados dentro de estos límites (las vallas) durante todo el partido. */
const FIELD_W = CAMPUS.cols * TILE;   // 3072
const FIELD_H = CAMPUS.rows * TILE;   // 1920
const FIELD_MARGIN = 24;

/* Campo del duelo contra el boss: pequeño, en vertical y lleno de rocas rotas */
const ARENA_W = 760;
const ARENA_H = 1100;
const ARENA_ROCKS = 8;          // cuántas rocas hay en el campo del duelo

/* límites del campo en el que está el jugador ahora mismo */
function fieldW(){ return match.inArena ? ARENA_W : FIELD_W; }
function fieldH(){ return match.inArena ? ARENA_H : FIELD_H; }

/* Alcance inicial del disparo (ya no hay mejora de alcance) */
const START_RANGE_MULT = 1.0;   // (antes 0,9: un pelín más de alcance base)
/* Radio inicial del imán que atrae las gemas de experiencia */
const BASE_PICKUP = 80;           // radio inicial del imán de recogida (antes 60)


/* ---------------------- ARQUETIPOS (elementos) ----------------------
   Ciclo: Aire → Montaña → Fuego → Bosque → Aire   ("A vence a B")
   Para añadir personajes basta con poner  element:'air'|'mountain'|'fire'|'forest'
   en su ficha de CHARACTERS. Si no tiene (o es desconocido) se trata como NEUTRO.
   orb  = emoji de los balones que orbitan (supertécnica de órbita)
   drop = emoji de lo que cae del cielo (supertécnica de lluvia) */
const ELEMENTS = {
  // 6 afinidades equilibradas: cada una gana a 2, pierde con 2 y es neutra con 1
  //   Aire     > Montaña, Celestial    · pierde con Bosque, Dragón   · neutra con Fuego
  //   Montaña  > Fuego, Celestial      · pierde con Aire, Dragón     · neutra con Bosque
  //   Fuego    > Bosque, Dragón        · pierde con Montaña, Celestial · neutra con Aire
  //   Bosque   > Aire, Dragón          · pierde con Fuego, Celestial · neutra con Montaña
  //   Dragón   > Aire, Montaña         · pierde con Fuego, Bosque    · neutra con Celestial
  //   Celestial> Fuego, Bosque         · pierde con Aire, Montaña    · neutra con Dragón
  air:       { name:'Aire',      emoji:'🌀', color:'#5ec8f2', beats:['mountain', 'celestial'], orb:'🌀', drop:'☄️' },
  mountain:  { name:'Montaña',   emoji:'⛰️', color:'#d29a5a', beats:['fire', 'celestial'],     orb:'🪨', drop:'🪨' },
  fire:      { name:'Fuego',     emoji:'🔥', color:'#ff6b5e', beats:['forest', 'dragon'],      orb:'🔥', drop:'💣' },
  forest:    { name:'Bosque',    emoji:'🌿', color:'#62c96c', beats:['air', 'dragon'],         orb:'🍃', drop:'🎩' },
  dragon:    { name:'Dragón',    emoji:'🐉', color:'#3f5fd8', beats:['air', 'mountain'],       orb:'🔷', drop:'🔷' },
  celestial: { name:'Celestial', emoji:'✨', color:'#f2d34b', beats:['fire', 'forest'],        orb:'⭐', drop:'⭐' },
};
const NEUTRAL_ELEMENT = { name:'Neutro', emoji:'⚪', color:'#eafff3', beats:null, orb:'⚽', drop:'⚽' };
const ELEMENT_ORDER = ['air', 'mountain', 'fire', 'forest', 'dragon', 'celestial'];
/* segunda afinidad de las técnicas definitivas (R): es su pareja neutra, que gana
   justo a las dos afinidades que le hacen counter (p. ej. Fuego pierde con Montaña
   y Celestial, y Aire gana a las dos). Así la R siempre tiene una salida. */
const ULT_DUAL = {
  //           pierce        orbit          bounce        rain           melee
  fire:      { pierce:'mountain', orbit:'forest',    bounce:'air',       rain:'celestial', melee:'dragon'   },
  air:       { pierce:'dragon',   orbit:'celestial', bounce:'fire',      rain:'mountain',  melee:'forest'   },
  mountain:  { pierce:'fire',     orbit:'celestial', bounce:'air',       rain:'dragon',    melee:'forest'   },
  forest:    { pierce:'dragon',   orbit:'air',       bounce:'celestial', rain:'mountain',  melee:'fire'     },
  dragon:    { pierce:'fire',     orbit:'air',       bounce:'celestial', rain:'forest',    melee:'mountain' },
  celestial: { pierce:'air',      orbit:'mountain',  bounce:'fire',      rain:'forest',    melee:'dragon'   },
};
/* segunda afinidad de una R concreta (según su afinidad base y el tipo de supertécnica) */
function ultSecond(el, kind){ return (ULT_DUAL[el] && ULT_DUAL[el][kind]) || null; }
function ultDualText(el, kind){ const e2 = ultSecond(el, kind); return e2 ? `Doble afinidad: ${getElement(el).name} + ${getElement(e2).name}` : null; }
const ELEMENT_ADV = 1.6;    // daño que hace / recibe con ventaja (antes x1,3)
const ELEMENT_DIS = 0.35;   // daño que hace / recibe con desventaja (antes la mitad; ahora mucho menos)

function getElement(key){ return ELEMENTS[key] || NEUTRAL_ELEMENT; }

/* ---- sprites en píxeles: moneda arcade y bolas de experiencia (PE) ---- */
function pixelSprite(size, paint){
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){ const c = paint(x, y); if (c){ g.fillStyle = c; g.fillRect(x, y, 1, 1); } }
  return cv;
}
// moneda dorada: borde oscuro, brillo arriba a la izquierda, sombra abajo a la derecha y ranura en relieve
// (mismo tamaño y mismo borde negro que las bolas de experiencia: 11x11, se dibuja a 22)
const COIN_SPRITE = pixelSprite(11, (x, y) => {
  const r = 5, c = 5, d = Math.hypot(x - c, y - c);
  if (d > r + 0.4) return null;
  if (d > r - 0.6) return '#10131f';                              // borde
  if (y >= 3 && y <= 7 && (x === 4 || x === 5)) return x === 4 ? '#fff6c4' : '#a86a00';   // ranura
  if (x - c + y - c < -r * 0.7) return '#fff2a8';                 // brillo
  if (x - c + y - c > r * 0.6) return '#c98a0a';                  // sombra
  return '#f6c218';
});
// letras P y E (3x5) para las bolas de experiencia
const PE_GLYPHS = { P:['111','101','111','100','100'], E:['111','100','110','100','111'] };
function peSprite(size, cMain, cDark, cLight){
  const r = size / 2 - 0.5, c = (size - 1) / 2;
  const tx = Math.floor((size - 7) / 2), ty = Math.floor((size - 5) / 2);
  return pixelSprite(size, (x, y) => {
    const d = Math.hypot(x - c, y - c);
    if (d > r + 0.4) return null;
    if (d > r - 0.6) return '#10131f';                              // borde
    const lx = x - tx, ly = y - ty;
    if (ly >= 0 && ly < 5){
      if (lx >= 0 && lx < 3 && PE_GLYPHS.P[ly][lx] === '1') return '#ffffff';
      if (lx >= 4 && lx < 7 && PE_GLYPHS.E[ly][lx - 4] === '1') return '#ffffff';
    }
    if (x - c + y - c < -r * 0.7) return cLight;                    // brillo
    if (x - c + y - c > r * 0.6) return cDark;                      // sombra
    return cMain;
  });
}
const PE_SPRITES = {
  s: peSprite(11, '#5ec8f2', '#2f86b4', '#c4ecff'),   // básica: azul celeste, como la barra de experiencia
  m: peSprite(11, '#3fbf5a', '#257a38', '#9ff0a8'),   // media: verde
  l: peSprite(11, '#9a55e0', '#5f2f99', '#dcb6ff'),   // mucha: morada
  big: peSprite(15, '#f2b705', '#a86a00', '#fff2a8'), // gema grande (boss, cofre, Willy): dorada
};
const COIN_HTML = '<i class="coin-ico"></i>';

/* objetos del suelo en píxeles (16x16): botella de agua, brick de leche y silbato */
const ITEM_PAL = {"K": "#1b1d26", "W": "#ffffff", "w": "#dfe6ee", "B": "#3fa9f5", "b": "#1f6fd1", "L": "#a8e0ff", "C": "#e9f6ff", "c": "#5ec8f2", "S": "#c3cbd6", "s": "#8d97a6", "R": "#e0453a", "r": "#a8281f", "Y": "#f2b705", "G": "#cfd6de", "D": "#7d8794", "H": "#ffffff", "O": "#ff9f43", "N": "#3a3f4b", "n": "#262a33", "M": "#6b7385", "f": "#c9a26b"};
const ITEM_ART = {
  bomb: [                                     // bomba: bola negra con brillo, tapón gris y mecha encendida
    '..........Y.O...',
    '...........OYR..',
    '..........fY.O..',
    '.........f......',
    '......KSSfK.....',
    '....KKNNNNNKK...',
    '...KNMMNNNNnK...',
    '..KNMWMNNNNNnK..',
    '..KNMMNNNNNNnK..',
    '..KNNNNNNNNNnK..',
    '..KNNNNNNNNnnK..',
    '..KnNNNNNNnnnK..',
    '...KnnNNNnnnK...',
    '....KKnnnnKK....',
    '......KKKK......',
    '................',
  ],
  water: [
    '................',
    '......KKKK......',
    '......KccK......',
    '......KKKK......',
    '.....KKWWKK.....',
    '.....KLBBbK.....',
    '....KLBBBBbK....',
    '....KLBBBBbK....',
    '....KWWWWWwK....',
    '....KWcccWwK....',
    '....KWWWWWwK....',
    '....KLBBBBbK....',
    '....KLBBBBbK....',
    '....KBBBBBbK....',
    '.....KKKKKK.....',
    '................',
  ],
  milk: [
    '................',
    '......KKKKK.....',
    '.....KWWWWwK....',
    '....KWWWWWWwK...',
    '...KWWWWWWWWsK..',
    '...KKKKKKKKKsK..',
    '...KWWWWWWWKsK..',
    '...KbbbbbbbKsK..',
    '...KbWbbbWbKsK..',
    '...KbbWWWbbKsK..',
    '...KbbbbbbbKsK..',
    '...KWWWWWWWKsK..',
    '...KWWWWwWWKsK..',
    '...KWWWWWWWKKK..',
    '...KKKKKKKKK....',
    '................',
  ],
  whistle: [
    '................',
    '................',
    '................',
    '....KKKKK.......',
    '...KGHHGGK......',
    '..KGHKKKGGKKKKK.',
    '.KGGKsssKGGGGGGK',
    'KGGGGKKKGGGGGGGK',
    'KGHGGGGGGGGDDDDK',
    'KGGGGGGGGGDKKKK.',
    '.KDGGGGGGDK.....',
    'RRKDDDDDDK......',
    'R.RKKKKKK.......',
    'R..R............',
    '.RRR............',
    '................',
  ],
};
function spriteFromArt(rows){ return pixelSprite(16, (x, y) => { const ch = rows[y][x]; return ch === '.' ? null : ITEM_PAL[ch]; }); }
const ITEM_SPRITES = { bomb: spriteFromArt(ITEM_ART.bomb), water: spriteFromArt(ITEM_ART.water), nectar: spriteFromArt(ITEM_ART.milk), whistle: spriteFromArt(ITEM_ART.whistle) };
/* cofre azul y flechas indicadoras (en píxeles) */
const CHEST_ART = ["................","..KKKKKKKKKKKK..",".KLLLLLLLLLLLLK.",".KBBYBBBBBBYBBK.",".KBBYBBBBBBYBBK.",".KbbYbbbbbbYbbK.",".KKKKKKKKKKKKKK.",".KYYYYYKKYYYYYK.",".KBBYBKOOKBYBBK.",".KBBYBKOKKBYBBK.",".KBBYBBKKBBYBBK.",".KBBYBBBBBBYBBK.",".KbbYbbbbbbYbbK.",".KbbYbbbbbbYbbK.",".KKKKKKKKKKKKKK.","................"];
const CHEST_PAL = { K:'#1b1d26', L:'#7cc4ff', B:'#2f7fd6', b:'#1b4f9a', Y:'#f2b705', O:'#ffe27a' };
const CHEST_SPRITE = pixelSprite(16, (x, y) => { const ch = CHEST_ART[y][x]; return ch === '.' ? null : CHEST_PAL[ch]; });
const ARROW_ART = ["...............",".......K.......",".......KK......",".......KLK.....",".......KLCK....","KKKKKKKKLCCK...","KLLLLLLLLCCCK..","KCCCCCCCCCCCCK.","KDDDDDDDDCCCK..","KKKKKKKKDCCK...",".......KDCK....",".......KDK.....",".......KK......",".......K.......","..............."];
const _arrowCache = {};
function shadeHex(hex, k){                       // k > 0 aclara, k < 0 oscurece
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  return '#' + c.map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)).toString(16).padStart(2, '0')).join('');
}
function arrowSprite(color){
  if (_arrowCache[color]) return _arrowCache[color];
  const pal = { K:'#1b1d26', C:color, L:shadeHex(color, 0.5), D:shadeHex(color, -0.35) };
  return (_arrowCache[color] = pixelSprite(15, (x, y) => { const ch = ARROW_ART[y][x]; return ch === '.' ? null : pal[ch]; }));
}
const POINTER_COLORS = { chest:'#3fa9f5', referee:'#f2d000', hillman:'#e0453a' };
const ITEM_SPRITE_URL = {};

/* iconos arcade (16x16) de las mejoras permanentes y de algunos objetos del suelo */
const PX_PAL = {"K": "#1b1d26", "W": "#ffffff", "w": "#d9dde4", "R": "#e8463a", "r": "#a82418", "P": "#ff9a8f", "Y": "#f2b705", "y": "#b47d00", "L": "#ffe27a", "B": "#3f8fe0", "b": "#1f5aa8", "C": "#9fd2ff", "G": "#4fbf45", "g": "#257a2a", "H": "#a6e36e", "S": "#c3cbd6", "s": "#7d8794", "O": "#ff8a2a", "o": "#b85410", "N": "#8a5a2b", "n": "#5a3815", "T": "#f1e3c8", "V": "#9a55e0", "v": "#5f2f99", "M": "#e86a9a", "U": "#2b2f8a", "u": "#1a1d5e", "Q": "#7d3fc9", "q": "#4a1f80", "X": "#c7a6ff", "E": "#7a5a3a", "e": "#4a3218", "F": "#d9c49a", "f": "#a8935f", "Z": "#6bd3ff", "A": "#d6a12a"};
const PX_ART = {
  vitalidad: ['................','..KKKK....KKKK..','.KRRRRK..KRRRRK.','KRPPRRRKKRRRRRrK','KRPRRRRRRRRRRRrK','KRRRRRRRRRRRRRrK','KRRRRRRRRRRRRRrK','.KRRRRRRRRRRRrK.','..KRRRRRRRRRrK..','...KRRRRRRRrK...','....KRRRRRrK....','.....KRRRrK.....','......KRrK......','.......KK.......','................','................'],
  fuerza: ['................','....KKKKKKK.....','...KRRRRRRRK....','..KRPPRRRRRRK...','..KRPRRRRRRRrK..','..KRRRRRRRRRrK..','..KRRKRRKRRRrK..','..KRRKRRKRRRrK..','..KRRRRRRRRrK...','...KRRRRRRrK....','....KKKKKKK.....','....KWWWWWK.....','....KwwwwwK.....','....KRRRRRK.....','....KKKKKKK.....','................'],
  zancada: ['................','................','.WW.............','KWWWK...........','.KWWWK..KKKK....','..KWWK.KBBBBK...','...KK.KBBCBBK...','......KBBBBBK...','.....KBBBBBBBKK.','....KBBBBBBBBBBK','...KBBWBWBWBBBBK','..KBBBBBBBBBBBBK','..KWWWWWWWWWWWWK','..KsssssssssssK.','...KKKKKKKKKKK..','................'],
  reflejos: ['......KKK.......','......KSK.......','....KKKKKKK.....','...KWWWWWWWK.K..','..KWWWWKWWWWKSK.','.KWWWWWKWWWWWK..','.KWWWWWKWWWWWK..','.KWWWWWKKKKWWK..','.KWWWWWWWWWWWK..','.KWWWWWWWWWWWK..','..KWWWWWWWWWK...','...KwwwwwwwK....','....KKKKKKK.....','................','................','................'],
  coraza: ['................','..KKKKKKKKKKKK..','..KCBBBBBBBBbK..','..KCBBBYYBBBbK..','..KCBBBYYBBBbK..','..KCBYYYYYYBbK..','..KCBYYYYYYBbK..','..KCBBBYYBBBbK..','..KCBBBYYBBBbK..','...KCBBBBBBbK...','...KCBBBBBBbK...','....KCBBBBbK....','.....KCBBbK.....','......KKKK......','................','................'],
  sintesis: ['............L...','...........LWL..','.....KKKK...L...','.....KHGK.......','.....KHGK.......','.KKKKKHGKKKKK...','.KHHHHHGGGGGK...','.KGGGGGGGGGgK...','.KKKKKGGgKKKK...','.....KGGgK......','.....KGGgK...L..','.....KKKKK..LWL.','.............L..','................','................','................'],
  iman: ['................','...KKKK..KKKK...','...KWWK..KWWK...','...KSSK..KSSK...','...KRRK..KRRK...','...KRRK..KRRK...','...KRRK..KRRK...','...KRRK..KRRK...','...KRRKKKKRRK...','...KRRRRRRRRK...','....KrRRRRrK....','.....KKKKKK.....','................','..C..........C..','.C............C.','................'],
  sabiduria: ['................','................','.KKKKKK..KKKKKK.','KBWWWWWKKWWWWWBK','KBWsssWKKWsssWBK','KBWWWWWKKWWWWWBK','KBWsssWKKWsssWBK','KBWWWWWKKWWWWWBK','KBWsssWKKWsssWBK','KBWWWWWKKWWWWWBK','KBBBBBBKKBBBBBBK','.KKKKKKKKKKKKKK.','................','................','................','................'],
  fortuna: ['................','......KKKK......','.....KNNNNK.....','......KYYK......','.....KNNNNK.....','....KNNNNNNK....','...KNNTNNNNNK...','..KNNTNNKKNNNK..','..KNNNNKYYKNNK..','..KNNNNKYYKNNK..','..KNNNNNKKNNnK..','..KNNNNNNNNNnK..','...KnnnnnnnnK...','....KKKKKKKK....','................','................'],
  critico: ['.......KK.......','......KYYK......','......KYYK......','.....KYLYYK.....','KKKKKKYLYYKKKKKK','KYYYYYLLYYYYYYyK','.KYYYYYYYYYYYyK.','..KYYYYYYYYYyK..','...KYYYYYYYyK...','...KYYYYYYYyK...','..KYYYyKKYYYyK..','..KYYyK..KYYyK..','.KYyKK....KKYyK.','.KKK........KKK.','................','................'],
  cambio: ['................','..KKKKKK........','..KWWWWKK.......','..KWBBWKBK......','..KWBBWKKKKKK...','..KWWWWKWWWWK...','..KKKKKKWRRWK...','....K...WRRWK...','...KKK..WWWWK...','..KYYYK.KKKKK...','...KYK....KYK...','..........KYYYK.','...........KKK..','................','................','................'],
  veto: ['................','.....KKKKKK.....','...KKRRRRRRKK...','..KRRKKKKKKRRK..','..KRKKK....RRK..','.KRK.KRK...KRRK.','.KRK..KRK...KRK.','.KRK...KRK..KRK.','.KRK....KRK.KRK.','.KRRK....KRKKRK.','..KRR....KKKRK..','..KRRKKKKKKRRK..','...KKRRRRRRKK...','.....KKKKKK.....','................','................'],
  inicial: ['................','....KKK.........','....KOOKK.......','....KOOOOKK.....','....KOOOOOOKK...','....KOOOOOOOOKK.','....KOOOOOOOOOK.','....KOOOOOOOOKK.','....KOOOOOOKK...','....KOOOOKK.....','....KoooKK......','....KKKK........','................','................','................','................'],
  rice: ['................','......KKKK......','.....KWWWWK.....','....KWWWWWWK....','...KWWWWWWwWK...','...KWWWWWWWwK...','..KWWWWWWWWWwK..','..KWWWKKKKWWwK..','.KWWWKggggKWWwK.','.KWWWKggggKWWwK.','.KWWWKggggKWWwK.','.KwWWKggggKWwwK.','..KKKKKKKKKKKK..','................','................','................'],
  ticket: ['................','................','................','.KKKKKKKKKKKKKK.','.KMMMMMKMMMMMMK.','.KMWWMM.MMMMMMK.','..KMMMMKMMLMMK..','..KMWWMM.MLLMK..','..KMMMMKMMLMMK..','.KMWWMM.MMMMMMK.','.KMMMMMKMMMMMMK.','.KKKKKKKKKKKKKK.','................','................','................','................'],
};
PX_ART.bag = PX_ART.fortuna;
/* objetos y Veto de objeto: 16x16 con el mismo estilo pixel que el resto de iconos */
PX_ART.r_botasInazuma = ["................", "................", "...KKKKK........", "...KRRRRK.......", "...KRYYRK.......", "...KRRYRK.......", "...KRYRRKKK.....", "...KRRYRPPRKK...", "...KRRRRRRRRRK..", "..KRRRRRRRRRRRK.", "..KrrrrrrrrrrrK.", "..KWWWWWWWWWWWK.", "..KKKKKKKKKKKKK.", "...KsK..KsK.....", "................", "................"];
PX_ART.r_amuleto = ["................", "....KK....KK....", ".....KY..YK.....", "......KYYK......", ".......KK.......", "......KYYK......", ".....KKYYKK.....", "....KYLLLYYK....", "...KYLYYYYYyK...", "...KYYYRRYYyK...", "...KYYRRRRYyK...", "...KYYYRRYYyK...", "....KyYYYYyK....", ".....KKyyKK.....", ".......KK.......", "................"];
PX_ART.r_pulsera = ["................", "................", ".....KKKKKK.....", "...KKLYYYYLKK...", "..KYLKKKKKKYYK..", ".KYLK......KYyK.", ".KYK........KyK.", ".KRK........KRK.", ".KYK........KyK.", ".KYyK......KYyK.", "..KYyKKKKKKyyK..", "...KKyyYYyyKK...", ".....KKKKKK.....", "................", "................", "................"];
PX_ART.r_chapa = ["................", "....K.KKK.K.....", "...KSKSSSKSK....", "..KSSYYYYYSSK...", ".KSSYLYYYYYSSK..", "..KSYYYYRRYYSK..", ".KSYYYYRRYYYSSK.", ".KSYYYRRRRYYYSK.", ".KSSYYYRRYYYSK..", "..KSYYRRYYYYSSK.", "..KSSYRYYYySSK..", "...KSSYyyySSK...", "....KSKSSSKSK...", ".....K.KKK.K....", "................", "................"];
PX_ART.r_gafas = ["................", "................", "................", "................", ".KKKKKK..KKKKKK.", "KKCCCCKKKKCCCCKK", "KKCWWCBKKKCWWCBK", "KKCWCCBKKKCWCCBK", "KKCCCBBK.KCCCBBK", ".KKBBBK...KBBBK.", "..KKKK.....KKKK.", "................", "................", "................", "................", "................"];
PX_ART.r_pinchito = ["................", "............KK..", "...........KGHK.", "..........KGGGK.", "..........KgGgK.", ".........KTKgK..", "........KHHKK...", ".......KHGGK....", "......KNNNK.....", ".....KNwNK......", "....KGHKK.......", "...KGGGK........", "...KgGgK........", "..KTKK..........", ".KTK............", "..K............."];
PX_ART.r_nectarDioses = ["...........K....", "..........KWK...", "...KKKKKKKKKK...", "..KYWWWWWWWWYK..", "..KYYWWWWWWYYK..", "..KLYYYYYYYYyK..", "..KYLYYYYYYyyK..", "...KYLYYYYyyK...", "....KYYYYyyK....", ".....KKYyKK.....", ".......KYK......", ".......KYK......", ".....KKYyyKK....", "....KYLYYYyyK...", "....KKKKKKKKK...", "................"];
PX_ART.r_artefacto = ["................", "......KKKK......", ".....KNNNNK.....", "......KNNK......", ".....KNNNNK.....", "...KKNTNNNNKK...", "..KNTNNNNNNnnK..", "..KNYYYYYYYYnK..", "..KNTNNZZNNNnK..", "..KNNNZNNZNNnK..", "..KNNNNZZNNNnK..", "..KNYYYYYYYYnK..", "...KNNNNNNNnK...", "....KKnnnnKK....", "......KKKK......", "................"];
PX_ART.r_tecnica = ["................", "..KKKKKKKKKKK...", "..KNNNNNNNNNTK..", "..KNnNNNNNNNTK..", "..KNnNNYYNNNTK..", "..KNnNNYNNNNTK..", "..KNnNYYYYNNTK..", "..KNnNNNYNNNTK..", "..KNnNNYYNNNTK..", "..KNnNNYNNNNTK..", "..KNnNNNNNNNTK..", "..KNnNNNNNNNTK..", "..KNnnnnnnnnTK..", "..KKKKKKKKKKKK..", "................", "................"];
PX_ART.r_botasHalcon = ["................", ".KK.............", "KWWK..KKKKK.....", ".KWWK.KBBBBK....", "KWWWWKKBYYBK....", ".KWWWWKBBYBK....", "..KWWWKBYBBKKK..", "...KWWKBBYBCCKK.", "....KKKBBBBBBBBK", ".....KBBBBBBBBBK", ".....KbbbbbbbbbK", ".....KWWWWWWWWWK", ".....KKKKKKKKKKK", "......KsK..KsK..", "................", "................"];
PX_ART.r_cintaMark = ["................", "................", "....KKKKKKK.....", "..KKOOOOOOOKK...", ".KOOKKKKKKKOOK..", "KOOK.......KOOK.", "KOK.........KOK.", "KOK.........KOK.", "KOoK.......KOOK.", ".KOoKKKKKKKOOKK.", "..KKooooooOKOOK.", "....KKKKKKKOOoK.", "..........KOOoK.", "...........KOK..", "...........KoK..", "............K..."];
PX_ART.r_balonAlius = ["................", ".....KKKKKK.....", "...KKXXVVVVKK...", "..KXVVKKKVVVVK..", "..KVVKuuuKVVvK..", ".KVVVKuuuKVVVvK.", ".KKKVVKKKVVKKvK.", ".KuKVVVVVVVKuKK.", ".KuuKVVVVVKuuKK.", ".KKKVVVKVVVKKvK.", "..KVVVKuKVVVvK..", "..KvVVKKKVVvvK..", "...KKvvvvvvKK...", ".....KKKKKK.....", "................", "................"];
PX_ART.r_guantes = ["................", "..KK.KK.........", ".KOKKOKKK.......", ".KOKKOKOK.KKKK..", ".KOOKOKOK.KOKOK.", ".KOOOOOOK.KOKOK.", "KKOOOOOOK.KOOOOK", "KOKOOOOOK.KOOOOK", "KOOOOOOOKKOOOOOK", ".KOOOOOOKKOOOOOK", "..KWWWWWK.KOOOK.", "..KWWWWWK.KWWWWK", "..KKKKKKK.KWWWWK", "..........KKKKKK", "................", "................"];
PX_ART.r_camiseta = ["................", "...KKKK..KKKK...", "..KBBBKYYKBBBK..", ".KBBBBYYYYBBBBK.", "KBBBYYYYYYYYBBBK", "KBBKYYYYYYYYKBBK", ".KK.KYYYBYYK.KK.", "....KYYBBYYK....", "....KYYYBYYK....", "....KYYBYYYK....", "....KYYYYYYK....", "....KyYYYYyK....", "....KyyyyyyK....", "....KKKKKKKK....", "................", "................"];
PX_ART.r_manto = ["................", ".....KKKKKK.....", "....KYYLLYYK....", "...KWWKYYKWWK...", "..KWWWWKKWWWWK..", "..KWWWWWWWWWwK..", ".KWWWWWWWWWWwK..", ".KWWwWWWWWWWwwK.", ".KWWwWWWWWWWwwK.", "KWWWwWWWwWWWwwK.", "KWWWwWWWwWWWwwwK", "KWWwwWWWwWWwwwwK", "KYYYYYYYYYYYYYYK", ".KKKKKKKKKKKKKK.", "................", "................"];
PX_ART.vetoObj = ["................", "................", "...KKKKKKKKKK...", "..KNYNNNNNNYNK..", "..KNYNNNNNNYNK..", ".KKKKKKKKKKKKKK.", ".KYYYYYKKYYYYYK.", ".KNNNNKSSKNNNNK.", ".KNYNNKsSKNNKKKK", ".KNYNNNKKNNKRRRK", ".KNYNNNNNNKRWRWK", ".KNYNNNNNNKRRWRK", ".KYYYYYYYYKRWRWK", ".KKKKKKKKKKKRRRK", "............KKKK", "................"];
PX_ART.m_packs = ["................", ".KKKKKK.........", ".KXXVVK.........", ".KXVVVKKKKKKKKK.", ".KVVVKWWWWWWWWK.", ".KVVVKKKKKKKKKK.", ".KVVVKYYYYYRRYK.", ".KVVVKYYYYRRYYK.", ".KvVVKYYYRRYYYK.", ".KvVVKYYRRRRRYK.", ".KvvvKYYYYRRYYK.", ".KKKKKYYYRRYYYK.", ".....KYYRRYYYYK.", ".....KyyyyyyyyK.", ".....KKKKKKKKKK.", "................"];   // icono de la Tienda de sobres
/* tickets de sobres: amarillo (normal) y morado (épico) */
PX_ART.ticketY = PX_ART.ticket.map(r => r.replace(/M/g, 'Y').replace(/L/g, 'W'));
PX_ART.ticketP = PX_ART.ticket.map(r => r.replace(/M/g, 'V').replace(/L/g, 'X'));
/* objetos (reliquias) en píxeles */
/* objetos (reliquias) dibujados con formas a 32x32 y pasados a píxel:
   alfa recortado (sin semitransparencias) + contorno oscuro automático */
function vecSprite(draw, size = 32){
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  draw(g);
  const im = g.getImageData(0, 0, size, size), d = im.data;
  const solid = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++){ if (d[i * 4 + 3] >= 110){ d[i * 4 + 3] = 255; solid[i] = 1; } else d[i * 4 + 3] = 0; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
    const i = y * size + x; if (solid[i]) continue;
    const n = (x > 0 && solid[i - 1]) || (x < size - 1 && solid[i + 1]) || (y > 0 && solid[i - size]) || (y < size - 1 && solid[i + size]);
    if (n){ d[i * 4] = 27; d[i * 4 + 1] = 29; d[i * 4 + 2] = 38; d[i * 4 + 3] = 255; }
  }
  g.putImageData(im, 0, 0);
  return cv;
}
const V = {
  poly(g, pts, fill){ g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill(); },
  rect(g, x, y, w, h, fill){ g.fillStyle = fill; g.fillRect(x, y, w, h); },
  rr(g, x, y, w, h, r, fill){ g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); },
  circ(g, x, y, r, fill){ g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); },
  ell(g, x, y, rx, ry, fill, rot = 0){ g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); },
  line(g, pts, w, col){ g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'square'; g.lineJoin = 'miter'; g.stroke(); },
  bolt(g, x, y, s, fill){ V.poly(g, [[x + 2*s, y], [x - 1.5*s, y + 4.5*s], [x + 0.6*s, y + 4.5*s], [x - 1.4*s, y + 9*s], [x + 3*s, y + 3.4*s], [x + 0.8*s, y + 3.4*s], [x + 2.6*s, y]], fill); },
};
// bota de fútbol de perfil (puntera a la derecha), con tacos
function bootShape(g, base, dark, light){
  V.poly(g, [[5, 12], [14, 11], [17, 15], [24, 17], [28, 19], [28, 23], [4, 23], [4, 15]], base);   // empeine
  V.poly(g, [[5, 12], [14, 11], [15, 13], [6, 14]], light);                                        // brillo
  V.rect(g, 4, 21, 24, 2, dark);                                                                    // borde de la suela
  V.rect(g, 3, 23, 26, 2, '#f1f1f1');                                                               // suela
  for (const x of [5, 10, 17, 23]) V.rect(g, x, 25, 3, 2, '#9aa3ad');                              // tacos
  V.line(g, [[15, 15], [20, 17]], 1, '#ffffff'); V.line(g, [[15, 17], [21, 19]], 1, '#ffffff');      // cordones
  V.rect(g, 4, 11, 4, 3, dark);                                                                     // talón
}
const RELIC_DRAW = {
  botasInazuma(g){ bootShape(g, '#c8231a', '#7a120c', '#f05a4e'); V.bolt(g, 7, 13, 1.1, '#ffd21f'); },
  botasHalcon(g){
    // dos alas blancas por detrás del talón, por debajo de la bota (la bota las tapa por delante)
    const wing = (dy, shade) => {
      V.poly(g, [[11, 16 + dy], [1, 9 + dy], [3, 13 + dy], [0, 14 + dy], [4, 17 + dy], [1, 19 + dy], [6, 20 + dy], [4, 23 + dy], [11, 22 + dy]], shade ? '#c9d4e2' : '#ffffff');
      V.line(g, [[3, 13 + dy], [9, 17 + dy]], 1, shade ? '#9fb0c4' : '#c9d4e2');
      V.line(g, [[4, 17 + dy], [9, 19 + dy]], 1, shade ? '#9fb0c4' : '#c9d4e2');
    };
    wing(-3, true);                                                   // ala de atrás (más oscura)
    wing(1, false);                                                   // ala de delante
    g.save(); g.translate(3, 0);
    bootShape(g, '#1f5aa8', '#0e2f60', '#4f8fe0'); V.bolt(g, 14, 13, 1.0, '#ffd21f');
    g.restore();
  },
  chapa(g){
    // chapa de botella: borde dentado, interior dorado con rayo
    for (let k = 0; k < 21; k++){ const a = k / 21 * Math.PI * 2; V.circ(g, 16 + Math.cos(a) * 12.5, 16 + Math.sin(a) * 12.5, 2.2, '#9aa3ad'); }
    V.circ(g, 16, 16, 12, '#c7cdd4'); V.circ(g, 16, 16, 10, '#e0b33a'); V.circ(g, 16, 16, 8.5, '#f2c84b');
    V.ell(g, 12, 11, 4, 2, '#fff1a8', -0.6);                                                        // brillo
    V.bolt(g, 12.5, 8.5, 1.65, '#c7231a'); V.bolt(g, 12, 8, 1.6, '#ffffff');
  },
  pinchito(g){
    // gilda: palillo en diagonal con guindillas, anchoa y aceitunas
    V.line(g, [[4, 28], [27, 5]], 1.6, '#d8b27a');
    V.ell(g, 23, 9, 3.6, 3.2, '#5f8f2a', -0.8); V.ell(g, 22.2, 8.2, 1.2, 0.8, '#b8d870', -0.8);     // aceituna
    V.ell(g, 18, 14, 2.4, 6, '#c8d65a', 0.8); V.ell(g, 17.4, 13.2, 0.8, 4, '#eef59a', 0.8);          // guindilla
    V.ell(g, 13, 19, 4.2, 2.6, '#6e5a4a', 0.75); V.ell(g, 13, 18.4, 3, 1, '#b9b4ae', 0.75);           // anchoa
    V.ell(g, 9, 23, 3.4, 3, '#5f8f2a', -0.8); V.ell(g, 8.2, 22.3, 1.1, 0.7, '#b8d870', -0.8);        // aceituna
  },
  nectarDioses(g){
    // copa dorada con néctar blanco que brilla, gotas y destellos
    const gl = g.createRadialGradient(16, 10, 2, 16, 10, 15);
    gl.addColorStop(0, 'rgba(255,255,240,0.55)'); gl.addColorStop(1, 'rgba(255,255,240,0)');
    g.fillStyle = gl; g.fillRect(0, 0, 32, 20);                                                     // aura (se recorta al pasar a píxel)
    V.ell(g, 16, 6, 11, 2.6, '#c9a03a');                                                            // borde dorado
    V.poly(g, [[5, 6], [27, 6], [24, 15], [19, 19], [13, 19], [8, 15]], '#d8b44a');                 // copa
    V.poly(g, [[7, 7], [25, 7], [22.5, 14.5], [18.5, 17.5], [13.5, 17.5], [9.5, 14.5]], '#b8862a'); // interior en sombra
    V.ell(g, 16, 7, 9.5, 2, '#ffffff'); V.ell(g, 16, 7, 7, 1.2, '#eaf4ff');                         // néctar blanco
    V.ell(g, 21, 7.2, 2.2, 0.6, '#cfe4ff');                                                         // reflejo azulado
    V.poly(g, [[6, 6], [8, 6], [9.5, 12], [8, 12]], '#ffffff');                                     // gota cayendo por fuera
    V.circ(g, 8.6, 13.3, 1.2, '#ffffff');
    V.poly(g, [[9, 9], [12, 9], [13, 15], [11, 14]], '#f6dc7c');                                    // brillo de la copa
    V.rect(g, 14.5, 19, 3, 2, '#c9a03a'); V.circ(g, 16, 22, 2.2, '#d8b44a');                        // tallo con nudo
    V.rect(g, 15, 23, 2, 3, '#c9a03a');
    V.ell(g, 16, 27, 7, 2.2, '#b8862a'); V.ell(g, 16, 26.4, 5.4, 1.3, '#f6dc7c');                   // pie
    for (const [x, y] of [[27, 2], [4, 3], [29, 12]]){ V.rect(g, x, y - 1, 1, 3, '#ffffff'); V.rect(g, x - 1, y, 3, 1, '#ffffff'); }   // destellos
  },
  artefacto(g){
    // casco con visor y cables colgando
    V.ell(g, 16, 15, 11, 10, '#9aa3ad'); V.ell(g, 16, 13, 10, 8, '#c7cdd4'); V.ell(g, 12, 9, 4, 2.4, '#eef2f6', -0.4);
    V.rect(g, 5, 15, 22, 5, '#5a6370');
    V.rr(g, 8, 15, 16, 5, 2, '#46e0ff'); V.rect(g, 9, 16, 5, 1, '#c9f6ff');                          // visor
    V.circ(g, 16, 5, 2, '#ff4d4d');                                                                  // luz
    V.line(g, [[6, 19], [4, 24], [6, 28]], 1.4, '#ff4d4d');
    V.line(g, [[10, 21], [9, 26], [11, 30]], 1.4, '#3fbf5a');
    V.line(g, [[22, 21], [23, 26], [21, 30]], 1.4, '#ffd21f');
    V.line(g, [[26, 19], [28, 24], [26, 28]], 1.4, '#3f8fe0');
  },
  tecnica(g){
    // cuaderno antiguo y destrozado: tapa marrón con manchas, hojas amarillentas rotas
    V.poly(g, [[6, 5], [24, 4], [26, 8], [25, 27], [7, 28], [5, 22], [6, 15]], '#e8d9b0');           // hojas
    V.poly(g, [[5, 4], [22, 3], [24, 7], [23, 25], [20, 27], [6, 26], [4, 20], [5, 13]], '#7a4a22');  // tapa
    V.poly(g, [[5, 4], [8, 4], [8, 26], [6, 26]], '#4e2c12');                                        // lomo
    V.ell(g, 16, 12, 4, 3, '#5e3818'); V.ell(g, 19, 20, 3, 2, '#6a4019');                            // manchas
    V.rect(g, 11, 8, 9, 1, '#c99a5a'); V.rect(g, 11, 10, 6, 1, '#c99a5a');                           // título gastado
    V.poly(g, [[20, 27], [23, 25], [24, 29]], '#e8d9b0');                                            // hoja rota saliendo
    V.poly(g, [[22, 3], [25, 2], [24, 7]], '#7a4a22');
    V.bolt(g, 13, 14, 0.9, '#c9a03a');                                                               // rayo gastado
  },
  cintaMark(g){
    // cinta naranja grande atada, con nudo y dos tiras colgando
    V.ell(g, 14, 16, 13, 8.5, '#f07a12');
    g.globalCompositeOperation = 'destination-out'; V.ell(g, 14, 16.8, 10.5, 5.8, '#000'); g.globalCompositeOperation = 'source-over';
    V.ell(g, 13, 9.6, 9, 1.6, '#ffb35c');                                                           // brillo
    V.ell(g, 14, 23.4, 9, 1, '#c25a0a');                                                            // sombra de abajo
    V.rr(g, 23, 12, 7, 8, 2, '#d8640c'); V.rect(g, 24, 13, 2, 3, '#ffb35c');                        // nudo
    V.poly(g, [[25, 19], [30, 31], [27, 32], [23, 21]], '#f07a12');                                 // tira 1
    V.poly(g, [[27, 18], [32, 27], [30, 29], [26, 20]], '#d8640c');                                 // tira 2
  },
  balonAlius(g){
    // balón morado oscuro con parches negros y brillo morado
    V.circ(g, 16, 16, 12, '#6a2fc0');
    g.save(); g.beginPath(); g.arc(16, 16, 12, 0, Math.PI * 2); g.clip();
    V.circ(g, 15, 15, 10.5, '#8a4fe0');
    const pent = (cx, cy, s, a0) => { const pts = []; for (let k = 0; k < 5; k++){ const a = a0 + k * Math.PI * 2 / 5; pts.push([cx + Math.cos(a) * s, cy + Math.sin(a) * s]); } V.poly(g, pts, '#24103f'); };
    pent(16, 16, 4.2, -Math.PI / 2);
    for (let k = 0; k < 5; k++){ const a = -Math.PI / 2 + Math.PI / 5 + k * Math.PI * 2 / 5; pent(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 3.4, a); }
    g.restore();
    V.ell(g, 11, 10, 3.5, 2, '#d9b8ff', -0.6);                                                       // brillo
  },
  guantes(g){
    // los dos guantes de portero (izquierdo y derecho), naranjas con muñequera negra
    const glove = (ox, flip) => {
      g.save(); g.translate(ox, 0); if (flip){ g.translate(14, 0); g.scale(-1, 1); }
      V.rr(g, 2, 13, 11, 10, 3, '#f08a1c');
      for (const [x, h] of [[2, 6], [4.8, 8], [7.6, 7.6], [10.4, 6]]) V.rr(g, x, 13 - h, 2.8, h + 2, 1.4, '#f08a1c');   // dedos
      V.rr(g, -1, 15, 4, 4, 2, '#f08a1c');                                                          // pulgar
      for (const x of [2.6, 5.4, 8.2, 11]) V.rect(g, x, 7, 1, 4, '#ffb35c');                         // brillo
      V.rect(g, 3, 17, 9, 1.6, '#ffffff');                                                          // banda
      V.rr(g, 3, 22, 9, 5, 1, '#1f2430'); V.rect(g, 4, 24, 7, 1, '#f2c84b');                        // muñequera
      g.restore();
    };
    glove(2, false); glove(16, true);
  },
  camiseta(g){
    // camiseta amarilla con las mangas azules (vista de frente)
    V.poly(g, [[9, 5], [13, 4], [16, 7], [19, 4], [23, 5], [24, 12], [24, 28], [8, 28], [8, 12]], '#ffd21f');     // cuerpo
    V.poly(g, [[9, 5], [1, 11], [4, 17], [8.5, 14], [8.5, 9]], '#1f5aa8');                                    // manga izquierda
    V.poly(g, [[23, 5], [31, 11], [28, 17], [23.5, 14], [23.5, 9]], '#1f5aa8');                               // manga derecha
    V.poly(g, [[3, 12], [5, 15.5], [7, 14.3], [5, 11]], '#4f8fe0');                                           // brillo manga
    V.poly(g, [[13, 4], [16, 7], [19, 4], [18, 3.2], [16, 5], [14, 3.2]], '#e0b012');                          // cuello
    V.poly(g, [[10, 8], [12, 8], [12, 26], [10, 26]], '#ffe25a');                                             // luz
    V.poly(g, [[20, 9], [22.5, 9], [22.5, 27], [20, 27]], '#e8b80e');                                         // sombra
  },
  amuleto(g){
    // colgante dorado completo: cadena, anilla y medalla con un rayo grabado
    V.line(g, [[8, 3], [16, 10], [24, 3]], 1.2, '#c9a03a');
    V.circ(g, 16, 11, 2, '#c9a03a'); V.circ(g, 16, 11, 1, '#5a3a10');                             // anilla
    V.circ(g, 16, 20, 7.5, '#b8862a'); V.circ(g, 16, 20, 6.3, '#f2c84b'); V.circ(g, 16, 20, 4.6, '#e0b33a');
    V.bolt(g, 14.8, 16.3, 0.85, '#fff1a8');                                                         // rayo grabado
    V.ell(g, 12.8, 16.6, 1.8, 1, '#fff6c8', -0.6);                                                  // brillo
  },
  pulsera(g){
    for (let k = 0; k < 12; k++){ const a = k / 12 * Math.PI * 2; V.ell(g, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 7, 3, 2.2, k % 2 ? '#c7cdd4' : '#f2c84b', a + Math.PI / 2); }
    V.ell(g, 16, 9, 3, 2, '#ffffff');
  },
  gafas(g){
    V.rect(g, 2, 13, 28, 2, '#1f2430');
    V.rr(g, 4, 12, 11, 9, 3, '#1f2430'); V.rr(g, 17, 12, 11, 9, 3, '#1f2430');
    V.rr(g, 5.5, 13.5, 8, 6, 2, '#46b8ff'); V.rr(g, 18.5, 13.5, 8, 6, 2, '#46b8ff');
    V.rect(g, 6.5, 14.5, 3, 1.5, '#d6f3ff'); V.rect(g, 19.5, 14.5, 3, 1.5, '#d6f3ff');
  },
};
const RELIC_URL = {};
for (const k in RELIC_DRAW){ try { RELIC_URL[k] = vecSprite(RELIC_DRAW[k]).toDataURL(); } catch (e) {} }
function relicIcon(k, size = 32){
  if (PX_ICON_URL['r_' + k]) return pxImg('r_' + k, size);               // pixel 16x16 (mismo estilo que los demás iconos)
  if (RELIC_URL[k]) return `<img class="px-mini" src="${RELIC_URL[k]}" width="${size}" height="${size}" alt="">`;
  return RELICS[k] ? RELICS[k].emoji : '';
}

PX_ART.bolt = ['................','.......KKKKK....','......KYYYYK....','.....KYLYYK.....','....KYLYYK......','...KYLYYKKKKK...','..KYYYYYYYYYK...','..KKKKKYYYYK....','......KYYYK.....','.....KYYyK......','....KYYyK.......','...KYyK.........','..KYyK..........','..KKK...........','................','................'];
PX_ART.boom = ['................','...K....K....K..','...KK..KOK..KK..','...KOK.KOK.KOK..','....KOKKYKKOK...','.KKKKOYYLYYOKKK.','..KOOYLLLLYOOK..','...KOYLWWLYOK...','..KOOYLLLLYOOK..','.KKKKOYYLYYOKKK.','....KOKKYKKOK...','...KOK.KOK.KOK..','...KK..KOK..KK..','...K....K....K..','................','................'];
PX_ART.dash = ['................','................','....KKKKKKK.....','..KK.CCCCCCKK...','........WWWCCK..','..KKKKKKKKWWCK..','.KCCCCCCCCCWWK..','..KKKKKKKKWWCK..','........WWWCCK..','..KK.CCCCCCKK...','....KKKKKKK.....','................','.KKKK..KKK......','................','................','................'];
PX_ART.range = ['................','.......KK.......','.....KKRRKK.....','....KR.KK.RK....','...KR..KK..RK...','..KR...KK...RK..','..KR........RK..','.KKKKK.RR.KKKKK.','.KKKKK.RR.KKKKK.','..KR........RK..','..KR...KK...RK..','...KR..KK..RK...','....KR.KK.RK....','.....KKRRKK.....','.......KK.......','................'];
function pxImg(key, size = 18){ return PX_ICON_URL[key] ? `<img class="px-mini" src="${PX_ICON_URL[key]}" width="${size}" height="${size}" alt="">` : ''; }
/* logos de afinidad en versión arcade (16x16): hexágono con borde plateado y símbolo blanco */
const EL_GLYPH = {
  air:      ['..WWWW..','.W....W.','......W.','WWWWW.W.','........','WWWWWWW.','......W.','..WWWW..'],
  mountain: ['........','...W....','..WWW...','..WWWW.W','.WWWWWWW','.WWWWWWW','WWWWWWWW','........'],
  fire:     ['...W....','...WW...','..WWW.W.','.WWWWWW.','.WWW.WW.','.WW..WW.','..W..W..','...WW...'],
  forest:   ['......WW','....WWWW','..WWWW.W','.WWW.WWW','.WW.WWWW','.W.WWWW.','W.WWW...','W.......'],
  talent:   ['...WW...','...WW...','WWWWWWWW','.WWWWWW.','..WWWW..','.WWWWWW.','.WW..WW.','W......W'],   // logo de Talento: estrella
  dragon:   ['.....WW.','...WWWW.','..WWW...','.WWWWWW.','WWW.WWWW','WW....WW','W.....W.','........'],   // cabeza de dragón
  celestial:['...WW...','.W.WW.W.','..WWWW..','WWWWWWWW','WWWWWWWW','..WWWW..','.W.WW.W.','...WW...'],   // destello de luz
};
const EL_PX_COL = { talent:['#c48af0','#6a2fa8'], dragon:['#6f8bff','#1d2b8a'], celestial:['#ffe680','#c9921a'], air:['#8fd3ff','#2f7fd6'], mountain:['#e8b26a','#8a4f1e'], fire:['#ff8a5c','#c41e1e'], forest:['#86e06a','#2c8a2a'] };
const EL_PX_URL = {};
function elPxSprite(key){
  const hex = r => [0,1,2,3,4,5].map(k => [7.5 + r * Math.cos(Math.PI / 6 + k * Math.PI / 3), 7.5 + r * Math.sin(Math.PI / 6 + k * Math.PI / 3)]);
  const H1 = hex(8.2), H2 = hex(7.1), H3 = hex(5.9), col = EL_PX_COL[key], gl = EL_GLYPH[key];
  return pixelSprite(16, (x, y) => {
    const cx = x + 0.5, cy = y + 0.5;
    if (!pointInPoly(cx, cy, H1)) return null;
    if (!pointInPoly(cx, cy, H2)) return '#141c2b';                     // contorno
    if (!pointInPoly(cx, cy, H3)) return (x + y < 15) ? '#e6ebf2' : '#8d97a6';   // borde plateado
    if (!col) return '#eafff3';
    const gx = x - 4, gy = y - 4;
    if (gl && gx >= 0 && gx < 8 && gy >= 0 && gy < 8 && gl[gy][gx] === 'W') return '#ffffff';
    return y < 8 ? col[0] : col[1];
  });
}
function elPxURL(key){
  const k = EL_PX_COL[key] ? key : 'neutral';
  if (!EL_PX_URL[k]){ try { EL_PX_URL[k] = elPxSprite(k).toDataURL(); } catch (e) { EL_PX_URL[k] = ''; } }
  return EL_PX_URL[k];
}
function talentLogo(size = 18){ const u = elPxURL('talent'); return u ? `<img class="px-mini" src="${u}" width="${size}" height="${size}" alt="">` : ''; }
/* icono de una supertécnica: logo arcade de su afinidad (los cuadernos, que no tienen, un cuaderno) */
function techLogo(kind, el, size = 18){
  if (isBuffKind(kind)) return pxImg('sabiduria', size);
  const u = elPxURL(el !== undefined ? el : (typeof match !== 'undefined' && match ? match.element : null));
  return u ? `<img class="px-mini" src="${u}" width="${size}" height="${size}" alt="">` : '';
}
const UPGRADE_PX = { power:'fuerza', speed:'zancada', atkspeed:'reflejos', health:'vitalidad', dodge:'dash', xp:'sabiduria', magnet:'iman', defense:'coraza', regen:'sintesis', heal:'rice' };
/* talentos con su icono arcade (reutiliza los de las mejoras) */
const TALENT_PX = { ahorro:'fortuna', ataque:'fuerza', defensa:'coraza', rapidez:'zancada', portero:'coraza', aMuerte:'boom', ultra:'critico',
  tiro:'boom', lance:'range', fuerzaDef:'coraza', cargaElem:'bolt', antiAfin:'cambio', piscinazo:'dash', vagueza:'sabiduria', suerte:'critico', vamos:'reflejos', vamosTodos:'m_team' };
/* icono arcade de una carta de subida de nivel (si no tiene, su emoji) */
function optionIcon(u, size = 28){
  if (u.tech) return u.emoji;                                      // supertécnicas: ya es el logo de su afinidad
  if (u.talent){ const k = TALENT_PX[String(u.id).replace('talent-', '')]; return talentLogo(size) + (k ? pxImg(k, size) : u.emoji); }
  return UPGRADE_PX[u.id] ? pxImg(UPGRADE_PX[u.id], size) : u.emoji;
}

/* tarjetas amarilla y roja (icono de la flecha que señala al árbitro) */
PX_ART.ref_cards = ['................', '..KKKKKK........', '..KYYYLK........', '..KYYYYKKKKKK...', '..KYYYYKRRRPK...', '..KYYYYKRRRRK...', '..KYYYYKRRRRK...', '..KYYYYKRRRRK...', '..KYYYYKRRRRK...', '..KyyyyKRRRRK...', '..KKKKKKRRRRK...', '.......KRRRRK...', '.......KrrrrK...', '.......KKKKKK...', '................', '................'];
/* iconos del menú principal (16x16, como los de Mejoras) */
PX_ART.m_ball = ['................', '.....KKKKKK.....', '...KKWKKKKWKK...', '..KWWWWKKWWWWK..', '.KWWWWWWWWWWWWK.', '.KKWWWWKKWWWWKK.', 'KKKKWWKKKKWWKKKK', 'KKKWWWKKKKWWWsKK', 'KWWWWWWKKWWWWssK', 'KWWWWWWWWWWWsssK', '.KWKKWWWWWWsKKsK', '.KKKKWWWWWsKKKK.', '..KKKWWKKsssKK..', '...KKWKKKKsKK...', '.....KKKKKK.....', '................'];
PX_ART.m_up = ['................', '.......KK.......', '......KGGK......', '.....KGHGGK.....', '....KGHGGGGK....', '...KGHGGGGGGK...', '..KGHGGGGGGGgK..', '..KKKKGHGgKKKK..', '.....KHGGgK.....', '.....KHGGgK.....', '.....KHGGgK.....', '.....KHGGgK.....', '.....KHGGgK.....', '.....KKKKKK.....', '................', '................'];
PX_ART.m_team = ['................', '..........KKKK..', '.........KnnnnK.', '...KKKK..KnTTnK.', '..KnnnnK.KTTTTK.', '..KnTTnK..KTTK..', '..KTTTTK.KKRRKK.', '...KTTK.KRRRRRRK', '..KKBBKKKRRRRRRK', '.KBBBBBBKRRrRRRK', 'KBBBBBBBBKRrRRRK', 'KBBBbBBBBKKKKKKK', 'KBBBbBBBBK......', 'KKKKKKKKKK......', '................', '................'];
PX_ART.m_medal = ['................', '...KKKK..KKKK...', '...KRRK..KBBK...', '....KRRKKBBK....', '.....KRRBBK.....', '......KRBK......', '.....KKKKKK.....', '....KYYYYYYK....', '...KYLLYYYYyK...', '...KYLYYAYYyK...', '...KYYYAAAYyK...', '...KYYAAAAAyK...', '...KYYYAYAYyK...', '....KyYYYYyK....', '.....KKKKKK.....', '................'];
PX_ART.m_slot = ['................', '...KKKKKKKKK....', '...KYYYYYYYK.KK.', '..KRRRRRRRRRKKRK', '..KRKKKKKKKRKKRK', '..KRKWKWKWKRK.sK', '..KRKYKRKYKRKKsK', '..KRKWKWKWKRKssK', '..KRKKKKKKKRKKK.', '..KRRRRRRRRRK...', '..KrrrKKKrrrK...', '..KrrrKYKrrrK...', '..KrrrKKKrrrK...', '..KKKKKKKKKKK...', '................', '................'];
PX_ART.m_save = ['................', '..KKKKKKKKKKKK..', '..KBKSSSSSSKBK..', '..KBKSSSKSSKBK..', '..KBKSSSKSSKBK..', '..KBKSSSSSSKBK..', '..KBBKKKKKKBBK..', '..KBBBBBBBBBBK..', '..KBKKKKKKKKBK..', '..KBKWWWWWWKBK..', '..KBKWssssWKBK..', '..KBKWWWWWWKBK..', '..KBKWssssWKBK..', '..KBKWWWWWWKBK..', '..KKKKKKKKKKKK..', '................'];
PX_ART.m_book = null;   // (se rellena abajo con el libro de Aprendizaje)
PX_ART.m_bell = ['................', '.......KK.......', '......KyyK......', '.....KYYYYK.....', '....KYLYYYyK....', '....KYLYYYyK....', '....KYLYYYyK....', '...KYLYYYYYyK...', '...KYLYYYYYyK...', '..KYLYYYYYYYyK..', '.KYYYYYYYYYYYyK.', '.KKKKKKKKKKKKKK.', '......KyyK......', '.......KK.......', '................', '................'];
/* balón y engranaje a 16x16 con contorno automático */
function outlinedSprite(fn){
  const grid = []; for (let y = 0; y < 16; y++){ grid.push([]); for (let x = 0; x < 16; x++) grid[y].push(fn(x, y)); }
  return pixelSprite(16, (x, y) => { if (grid[y][x]) return grid[y][x]; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const c = grid[y + dy] && grid[y + dy][x + dx]; if (c) return '#1b1d26'; } return null; });
}
const MENU_BALL = () => outlinedSprite((x, y) => {
  const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy); if (d > 6.3) return null;
  const a = Math.atan2(dy, dx);
  if (pointInPoly(x + 0.5, y + 0.5, [0,1,2,3,4].map(k => [8 + 2.1 * Math.cos(-Math.PI / 2 + k * 1.2566), 8 + 2.1 * Math.sin(-Math.PI / 2 + k * 1.2566)]))) return '#1b1d26';
  for (let k = 0; k < 5; k++){ const b = -Math.PI / 2 + k * 1.2566; if (Math.hypot(dx - 6.6 * Math.cos(b), dy - 6.6 * Math.sin(b)) < 1.75) return '#1b1d26'; }
  if (x <= 4 && y <= 4 && d > 3) return '#ffffff';
  return (dx + dy > 4) ? '#c3cbd6' : '#ffffff';
});
const MENU_GEAR = () => outlinedSprite((x, y) => {
  const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  if (d < 2) return null;
  const tooth = Math.abs(((a + Math.PI / 8) % (Math.PI / 4) + Math.PI / 4) % (Math.PI / 4) - Math.PI / 8) < 0.26;
  if (d <= 4.6 || (tooth && d <= 6.6)) return (dx + dy > 2) ? '#7d8794' : (d < 3 ? '#9aa3ad' : '#c3cbd6');
  return null;
});
function pxIcon(rows){ return pixelSprite(16, (x, y) => { const ch = rows[y][x]; return ch === '.' ? null : PX_PAL[ch]; }); }
PX_ART.m_book = PX_ART.sabiduria;   // icono de la Guía
const PX_ICONS = {}, PX_ICON_URL = {};
for (const k in PX_ART){ PX_ICONS[k] = pxIcon(PX_ART[k]); try { PX_ICON_URL[k] = PX_ICONS[k].toDataURL(); } catch (e) {} }
ITEM_SPRITES.rice = PX_ICONS.rice;
try { for (const k in ITEM_SPRITES) ITEM_SPRITE_URL[k] = ITEM_SPRITES[k].toDataURL(); } catch (e) {}

try { document.documentElement.style.setProperty('--coin-img', `url(${COIN_SPRITE.toDataURL()})`); } catch (e) {}
/* ======================================================================
   CUERPO COMÚN (estilo chibi arcade: cabezón y cuerpo pequeño)
   Jugadores y rivales comparten el mismo cuerpo y las mismas animaciones;
   solo cambia la ropa (chándal del jugador, equipación de cada equipo rival)
   y, más adelante, la cabeza de cada uno (por ahora, una cabeza blanca vacía).
   Cuerpo dibujado por Miguel (22x19) · pequeño 20 de ancho, grande 26 · direcciones: abajo, arriba, izquierda, derecha
   · andar: 4 fotogramas en bucle · quieto: 2 fotogramas (respiración)
   ====================================================================== */
const SKIN = '#f3c9a0', SKIN_D = '#d9a57a';
const HEAD_COL = { head:'#f6f7fb', headD:'#cdd3de', headL:'#ffffff' };
/* ropa: chándal Inazuma del jugador y equipación de cada equipo rival */
const OUTFITS = {
  player:   { track:true, shirt:'#2c55c4', shirtD:'#1b3485', shirtL:'#4f7ff0', collar:'#ffd21f', stripe:'#ffffff', bolt:'#ffd21f', boltD:'#d39a00', pants:'#2c55c4', pantsD:'#1b3485', shoe:'#1f2330', sole:'#f1f1f1' },
  Occult:   { shirt:'#7a2fb8', shirtD:'#4f1d80', shirtL:'#9a55e0', collar:'#c7a6ff', shorts:'#8d97a6', socks:'#7a2fb8', socksD:'#4f1d80' },
  Wild:     { shirt:'#3a9a3a', shirtD:'#24702a', shirtL:'#5fbf4f', collar:'#ffffff', shorts:'#8d97a6', socks:'#3a9a3a', socksD:'#24702a' },
  Brain:    { shirt:'#d0d5dc', shirtD:'#a3abb6', shirtL:'#eef1f5', collar:'#4a505a', shorts:'#4a505a', socks:'#d0d5dc', socksD:'#a3abb6' },
  Otaku:    { shirt:'#3f7fe0', shirtD:'#2a5aa8', shirtL:'#6fa3f0', collar:'#ff7ac0', sleeve:'#ff7ac0', shorts:'#ff7ac0', socks:'#3f7fe0', socksD:'#2a5aa8' },
  Royal:    { shirt:'#1f5a3a', shirtD:'#143d27', shirtL:'#2f7a50', collar:'#d8321e', sleeve:'#d8321e', side:'#d8321e', shorts:'#6b4423', socks:'#1f5a3a', socksD:'#143d27' },
  Shuriken: { shirt:'#4a2a6a', shirtD:'#321a4a', shirtL:'#64408a', collar:'#15161c', shorts:'#3a2252', shortsD:'#26153a', socks:'#15161c', socksD:'#0a0b10' },
  Farm:     { emblem:'#6b4423', shirt:'#c9a06a', shirtD:'#a07a48', shirtL:'#e0bf8c', collar:'#f1e3c8', shorts:'#5a3815', socks:'#c9a06a', socksD:'#a07a48' },
  Kirkwood: { shirt:'#d8321e', shirtD:'#9a1e12', shirtL:'#f05a3e', collar:'#1b1d26', sleeve:'#1b1d26', side:'#1b1d26', shorts:'#ffffff', shortsD:'#dfe3ea', socks:'#d8321e', socksD:'#9a1e12' },
  referee:  { shirt:'#f2d21f', shirtD:'#c9a30f', shirtL:'#ffe866', collar:'#1b1d26', sleeve:'#1b1d26', shorts:'#1b1d26', socks:'#1b1d26', socksD:'#0e0f14' },
  // Willy y Kappah: el chándal del jugador, con la cabeza de su color
  willy:    { track:true, shirt:'#2c55c4', shirtD:'#1b3485', shirtL:'#4f7ff0', collar:'#ffd21f', stripe:'#ffffff', bolt:'#ffd21f', boltD:'#d39a00', pants:'#2c55c4', pantsD:'#1b3485', shoe:'#1f2330', sole:'#f1f1f1', head:['#5ec8f2', '#2f86b4', '#c4ecff'] },
  kappah:   { track:true, shirt:'#2c55c4', shirtD:'#1b3485', shirtL:'#4f7ff0', collar:'#ffd21f', stripe:'#ffffff', bolt:'#ffd21f', boltD:'#d39a00', pants:'#2c55c4', pantsD:'#1b3485', shoe:'#1f2330', sole:'#f1f1f1', head:['#62c96c', '#2f8a3a', '#b8f0a8'] },
  // Zeus: túnica blanca con cuello y puños azul clarito, manto gris cruzado y cordón negro en la cintura
  Zeus:     { shirt:'#f4f4f4', shirtD:'#cfd4dc', shirtL:'#ffffff', collar:'#5ec0ec', cuff:'#5ec0ec', drape:'#8a94a2', drapeD:'#5f6875', drapeL:'#b8c0cc', belt:'#1b1d26', skirt:'#ffffff', skirtD:'#c9d1dc', skirtTrim:'#5ec0ec', skirtStrap:'#e0b02a', shorts:'#e6e9ee', socks:'#f4f4f4', socksD:'#cfd4dc' },
};
/* tres complexiones: pequeño, estándar y grande (hitbox según el tamaño)
   el cuerpo es el dibujo de Miguel (22x19); el pequeño quita columnas/filas del torso y el grande las duplica */
const BUILDS = {
  small:    { hw:16, hh:14, hit:-4, rows:[0,1,2,3,4,6,7,8,9,10,11,12,13,15,16,17,18], cols:[0,1,2,3,4,5,7,8,9,10,11,12,13,14,16,17,18,19,20,21], sideN:9 },
  standard: { hw:18, hh:15, hit:0,  rows:[...Array(19).keys()], cols:[...Array(22).keys()], sideN:10 },
  big:      { hw:20, hh:15, hit:6,  rows:[0,1,2,3,4,5,6,6,7,8,9,10,11,12,13,14,15,16,17,18], cols:[0,1,2,3,4,5,6,6,7,7,8,9,10,11,12,13,14,14,15,15,16,17,18,19,20,21], sideN:13, fat:true },
};
for (const k in BUILDS){ const B = BUILDS[k]; B.W = B.cols.length; B.bodyH = B.rows.length; B.H = B.bodyH; }
/* cuerpo de frente, con el rayo 2 píxeles más arriba para que el pantalón se vea mejor (letras: A contorno · B/C/D/I camiseta clara→oscura · E/H franja blanca · F/G rayo · J/K/L piel · M/N zapatillas) */
const BODY_TPL = [
  '....AAAAAAAAAAAAAA....',
  '..AAABBCCCCCCCCDDAAA..',
  '.ABBBCCCCCCFFGCCCDDDA.',
  'ABBCCCCCCCFFGCCCCCCDDA',
  'AECDCCCCCFFGCCCCCCDCHA',
  'AECDABCCFFFFFGCCDADCHA',
  'AECDABCCCCCFFGCCDADCHA',
  'AEDIABCCCCFFGCCCDAIDHA',
  'AIIIABCCCFFCCCCCDAIIIA',
  'AJJKABCCFCCCCCCCDAKJJA',
  'AJKLAAAAAAAAAAAAAALKJA',
  '.ALLAECCCCCCCDDDHALLA.',
  '..AAAECCCCCCCDDDHAAA..',
  '....AECCCCCCCDDDHA....',
  '.....AECCDAIDDDHA.....',
  '.....AECCDAIDDDHA.....',
  '....AMMNNNANNNNNA.....',
  '...AMNNNNNANNNNNNA....',
  '...AAAAAAAAAAAAAAA....',
];
const BODY_PAL = { A:'#101018', B:'#4054a8', C:'#283880', D:'#1c2860', I:'#141c48', E:'#f8f8ff', H:'#c8d0e4', F:'#f8d830', G:'#d0a018', J:'#f0b068', K:'#d8a060', L:'#b88050', M:'#646478', N:'#2c2c38' };
/* piezas de perfil (mirando a la derecha) */
const SIDE_ARM = ['.AAA.', 'ABCDA', 'AECDA', 'AECDA', 'AECDA', 'AEDIA', 'AIIIA', 'AJJKA', 'AJKLA', 'AKLLA', '.AAA.'];   // filas 2..12
const SIDE_LEG = ['AECCDA.', 'AECCDA.', 'AMMNNNA', 'AMNNNNA', 'AAAAAAA'];                                         // filas 14..18
function sideTorso(n){
  const rows = [];
  rows.push('.' + 'A'.repeat(n) + '.');
  rows.push('A' + 'BB' + 'C'.repeat(n - 4) + 'DD' + 'A');
  for (let r = 2; r <= 9; r++){
    const a = ('B' + 'C'.repeat(n - 2) + 'D').split('');
    if (r === 2) a[n - 2] = 'F';
    if (r === 3){ a[n - 3] = 'F'; a[n - 2] = 'F'; }
    if (r === 4) a[n - 3] = 'F';
    if (r === 5) a[n - 4] = 'G';
    rows.push('A' + a.join('') + 'A');
  }
  rows.push('A'.repeat(n + 2));                         // cintura
  for (let r = 11; r <= 13; r++) rows.push('A' + 'C'.repeat(n - 1) + 'D' + 'A');   // pantalón
  return rows;
}
/* compone un fotograma en coordenadas del dibujo original: rejilla de { ch, reg, sr, sc, lr, dark } */
/* ciclo de andar en 8 fotogramas (de frente/espaldas y de perfil)
   lL/lR: filas que se recoge cada pierna (rodilla arriba) · aL/aR: brazo arriba (-) o abajo (+)
   b: el cuerpo baja 1 píxel al apoyar el pie · fx: zancada de la pierna de delante (perfil) · liftF/liftB: pie en el aire (perfil) */
const WALK_FRONT = [
  { lL:0, lR:0, aL:0,  aR:0,  b:1 }, { lL:1, lR:0, aL:1,  aR:-1, b:0 }, { lL:2, lR:0, aL:1,  aR:-1, b:0 }, { lL:1, lR:0, aL:1,  aR:-1, b:0 },
  { lL:0, lR:0, aL:0,  aR:0,  b:1 }, { lL:0, lR:1, aL:-1, aR:1,  b:0 }, { lL:0, lR:2, aL:-1, aR:1,  b:0 }, { lL:0, lR:1, aL:-1, aR:1,  b:0 },
];
const WALK_SIDE = [3, 2, 0, -2, -3, -2, 0, 2].map((fx, i) => ({ fx, liftF: i === 7 || i === 6 ? 1 : 0, liftB: i === 2 || i === 3 ? 1 : 0, b: i === 0 || i === 4 ? 1 : 0 }));
const IDLE_FRAMES = [{ lL:0, lR:0, aL:0, aR:0, b:0, fx:0, liftF:0, liftB:0 }, { lL:0, lR:0, aL:0, aR:0, b:1, fx:0, liftF:0, liftB:0 }];
function composeBody(view, F, B){
  const rowsN = 19, Wd = view === 'side' ? B.W : 22, b = F.b || 0;
  const G = Array.from({ length: rowsN }, () => Array(Wd).fill(null));
  const put = (rows, x0, y0, reg, opts = {}) => {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++){
      const ch = row[i], y = y0 + j, x = x0 + i; if (ch === '.' || y < 0 || y >= rowsN || x < 0 || x >= Wd) continue;
      G[y][x] = { ch, reg: typeof reg === 'function' ? reg(j) : reg, sr: (opts.sr0 ?? y0) + j, sc: i + (opts.sc0 ?? x0), lr: j + (opts.lr0 || 0), dark: !!opts.dark, n: opts.n };
    } });
  };
  if (view !== 'side'){
    const T = BODY_TPL.map(r => view === 'up' ? r.replace(/[FG]/g, 'C') : r);
    const block = (r0, r1, c0, c1) => T.slice(r0, r1 + 1).map(r => r.slice(c0, c1 + 1));
    // piernas: la que se levanta recoge filas (rodilla arriba) y se dibuja detrás de la que apoya
    const legL = block(14, 18, 0, 10), legR = block(14, 18, 10, 21);
    const drawLeg = (rows, x0, lift) => put(rows.slice(lift), x0, 14, 'leg', { sr0: 14 + lift, sc0: x0 });
    if (F.lL >= F.lR){ drawLeg(legL, 0, F.lL); drawLeg(legR, 10, F.lR); } else { drawLeg(legR, 10, F.lR); drawLeg(legL, 0, F.lL); }
    put(block(11, 13, 4, 17), 4, 11 + b, 'hip', { sr0: 11 });
    put(block(13, 13, 0, 21), 0, 13 + b, 'hip', { sr0: 13 });
    // brazos: balanceo contrario a las piernas (si bajan, el hombro se estira para no dejar hueco)
    const arm = (rows, x0, off) => { const y = 3 + off + b;
      if (off > 0) for (let k = 0; k < off; k++) put(rows.slice(0, 1), x0, 3 + b + k, 'arm', { sr0: 3, sc0: x0 });
      put(rows, x0, y, 'arm', { sr0: 3, sc0: x0 }); };
    arm(block(3, 12, 0, 3), 0, F.aL);
    arm(block(3, 12, 18, 21), 18, F.aR);
    // torso (encima de todo)
    put(block(0, 2, 0, 21), 0, b, 'torso', { sr0: 0 });
    put(block(3, 10, 4, 17), 4, 3 + b, 'torso', { sr0: 3 });
    return G;
  }
  // de perfil: zancada amplia, el pie que pasa va en el aire y los brazos se balancean al revés que las piernas
  const n = B.sideN, tx = Math.round((Wd - (n + 2)) / 2), lw = B.fat ? 1 : 0, fx = F.fx || 0;
  const legRows = SIDE_LEG.map(r => B.fat ? r.slice(0, 3) + r[2] + r.slice(3) : r);
  const aF = Math.max(-2, Math.min(2, -fx)), aB = -aF;
  put(SIDE_ARM, tx + 1 + aB, 2 + b, 'arm', { dark: true, lr0: -1, sr0: 2 });
  put(legRows.slice(F.liftB || 0), tx + 2 - fx, 14, 'leg', { dark: true, sr0: 14 + (F.liftB || 0) });
  put(sideTorso(n), tx, b, j => j >= 11 ? 'hip' : 'torso', { n, sc0: 0, sr0: 0 });
  put(legRows.slice(F.liftF || 0), tx + 3 + lw + fx, 14, 'leg', { sr0: 14 + (F.liftF || 0) });
  put(SIDE_ARM, tx + 3 + (B.fat ? 2 : 0) + aF, 2 + b, 'arm', { lr0: -1, sr0: 2 });
  return G;
}
/* sombreado arcade: cuánto se aclara (+) u oscurece (-) cada píxel del tono base (luz desde arriba a la izquierda) */
function bodyShadeLevel(c, view){
  const sc = c.sc, sr = c.sr;
  if (view === 'side'){
    const n = c.n || 10;
    if (c.reg === 'torso'){ if (sr <= 2) return sc >= 3 && sc <= 5 && sr === 1 ? 2 : 1; if (sr === 9) return -1; if (sc <= 2) return -1; if (sc >= n - 1) return -1;
      if ((sc === 4 && sr === 6) || (sc === 5 && sr === 7)) return -1; return 0; }
    if (c.reg === 'hip'){ if (sr === 11) return -1; if (sc <= 2) return -1; if (sr === 13 && sc >= n - 2) return -1; return sc <= 4 ? 1 : 0; }
    if (c.reg === 'leg') return sr === 15 ? -1 : 0;
    if (c.reg === 'arm') return sr === 3 ? 1 : sr === 6 ? -1 : 0;
    return 0;
  }
  const back = view === 'up';
  if (c.reg === 'torso'){
    if (sr === 1 && sc === 7) return 2;                                  // brillo del hombro
    if (!back && sr === 2 && sc >= 8 && sc <= 13) return -1;             // sombra del cuello / cabeza
    if (sr <= 2 && sc >= 5 && sc <= 9) return 1;
    if (sr === 9) return sc >= 13 ? -2 : -1;                             // pliegue sobre la cintura
    if (sc >= 14) return sr >= 7 ? -2 : -1;                              // costado en sombra
    if (sc === 6 && sr >= 3 && sr <= 8) return 1;                        // costado iluminado
    if (back){ if (sc === 11 && sr >= 3 && sr <= 8) return -1; if (sc === 7 && sr >= 3 && sr <= 6) return 1; }
    else if ((sc === 7 && sr === 6) || (sc === 8 && sr === 7) || (sc === 13 && sr === 4) || (sc === 12 && sr === 5) || (sc === 13 && sr === 8)) return -1;   // arrugas
    if (sr === 3 && sc <= 9) return 1;
    return 0;
  }
  if (c.reg === 'arm'){
    const right = sc >= 18;
    if (sr === 3) return right ? 0 : 1;
    if (sr === 6) return -1;
    return right ? -1 : 0;
  }
  if (c.reg === 'hip'){
    if (sr === 11) return sc >= 13 ? -2 : -1;                            // sombra del cinturón
    if ((sc === 10 || sc === 11) && sr >= 12) return sr === 13 && sc === 10 ? -2 : -1;   // entrepierna
    if (sc >= 14) return -1;
    if (sc >= 6 && sc <= 7) return 1;
    if (sr === 13 && sc >= 12) return -1;
    return 0;
  }
  if (c.reg === 'leg'){
    let l = sc >= 11 ? -1 : 0;
    if (sc === 7) l += 1;
    if (sr === 15) l -= 1;                                               // tobillo
    return Math.max(-2, Math.min(2, l));
  }
  return 0;
}
const TRACK_TONES = { '-2':'#141c48', '-1':'#202e6c', '0':'#283880', '1':'#34489c', '2':'#5068c4' };
function toneOf(base, lvl){ return lvl === 0 ? base : shadeHex(base, lvl === 2 ? 0.26 : lvl === 1 ? 0.12 : lvl === -1 ? -0.15 : -0.32); }
/* tela del manto: borde oscuro, filo con luz, centro con pliegues que cruzan en diagonal */
function drapeColor(O, k, sr){
  const L = O.drapeL || shadeHex(O.drape, 0.22), E = shadeHex(O.drapeD, -0.3);
  if (k === 15 || k === 20) return BODY_PAL.A;                    // borde negro
  if (k === 16) return sr % 3 === 0 ? O.drape : L;
  if (k === 19) return O.drapeD;
  return (sr + k) % 3 === 0 ? O.drapeD : (sr + k) % 3 === 1 ? L : O.drape;
}
/* color de una celda según la ropa */
function bodyCellColor(c, O, view){
  const ch = c.ch; if (ch === 'A') return BODY_PAL.A;
  let col;
  if (ch === 'M' || ch === 'N') col = BODY_PAL[ch];
  else if (O.track){
    col = O.skin && 'JKL'.includes(ch) ? O.skin['JKL'.indexOf(ch)] : BODY_PAL[ch];
    if (ch === 'C' && c.reg !== 'arm' || ch === 'C' && c.reg === 'arm' && c.lr <= 5) col = TRACK_TONES[bodyShadeLevel(c, view)];
  }
  else {
    const L = O.shirtL, S = O.shirt, D = O.shirtD, DD = shadeHex(O.shirtD, -0.3);
    const light = 'BE'.includes(ch), dark = 'DHI'.includes(ch), skinCh = 'JKL'.includes(ch);
    if (c.reg === 'torso'){
      col = ch === 'B' ? L : ch === 'D' ? D : ch === 'I' ? DD : S;
      const side = view === 'side';
      if (!side){
        if (c.sr === 1 && c.sc >= 8 && c.sc <= 13 && view === 'down') col = O.collar;
        if (O.side && (c.sc === 5 || c.sc === 16) && c.sr >= 2 && c.sr <= 9) col = O.side;
        // escudo del pecho (# del Farm)
        if (O.emblem && view === 'down'){ const ex = c.sc - 8, ey = c.sr - 3;
          if (ex >= 0 && ex < 6 && ey >= 0 && ey < 6 && ((ex === 1 || ex === 4) || (ey === 1 || ey === 4))) col = O.emblem; }
        // manto cruzado: banda de tela de 6 píxeles con bordes, pliegues y broche en el hombro
        if (O.drape && c.sr >= 1 && c.sr <= 9){ const k = view === 'down' ? c.sc + c.sr : (c.sc - c.sr) + 13;
          if (k >= 15 && k <= 20) col = drapeColor(O, k, c.sr);
          const bx = view === 'down' ? 15 : 6;
          if (c.sr <= 2 && (c.sc === bx || c.sc === bx + 1)) col = c.sr === 1 && c.sc === bx ? '#ffffff' : O.cuff || O.collar; }
      } else {
        if (c.sr === 1 && c.sc >= c.n - 3) col = O.collar;
        if (O.drape && c.sc >= 1 && c.sc <= 6 && c.sr >= 1 && c.sr <= 9) col = drapeColor(O, 14 + c.sc, c.sr);
      }
      if (O.belt && c.sr === 9) col = O.belt;
      if (col === S && ch === 'C') col = toneOf(S, bodyShadeLevel(c, view));
    } else if (c.reg === 'arm'){
      if (skinCh) col = BODY_PAL[ch];
      else if (c.lr <= 2){ const sl = O.sleeve || S; col = light ? shadeHex(sl, 0.18) : dark ? shadeHex(sl, -0.25) : toneOf(sl, bodyShadeLevel(c, view));
        if (O.drape && c.lr <= 2 && view === 'down' && c.sc >= 18) col = dark ? O.drapeD : O.drape; }
      else if (c.lr === 3 && O.cuff) col = O.cuff;
      else if (c.lr === (O.cuff ? 4 : 3)) return BODY_PAL.A;            // línea negra entre la manga y el brazo
      else col = dark ? BODY_PAL.K : BODY_PAL.J;
    } else if (O.skirt && c.reg === 'hip'){
      // falda griega de pliegues: tablas claras y oscuras, ribete azul abajo
      if (c.sr === 13) col = O.skirtTrim;
      else { const lv = bodyShadeLevel(c, view); col = c.sc % 2 ? O.skirtD : O.skirt; if (lv < 0) col = shadeHex(col, lv === -2 ? -0.2 : -0.1); }
    } else if (O.skirt){
      // tiras doradas bajo la falda y piernas al aire
      if (c.sr === 14) return c.sc % 2 ? BODY_PAL.A : (c.dark ? shadeHex(O.skirtStrap, -0.28) : O.skirtStrap);
      col = 'DHIL'.includes(ch) || c.sc >= 11 ? BODY_PAL.K : BODY_PAL.J;
    } else if (c.reg === 'hip'){ const lv = bodyShadeLevel(c, view);
      if (c.sr === 13) return BODY_PAL.A;                                // línea negra entre el pantalón y las medias
      col = dark ? (O.shortsD || shadeHex(O.shorts, -0.18)) : light ? shadeHex(O.shorts, 0.08) : lv < 0 && O.shortsD ? (lv === -2 ? shadeHex(O.shortsD, -0.1) : O.shortsD) : toneOf(O.shorts, lv); }
    else { const lv = bodyShadeLevel(c, view); col = dark ? O.socksD : lv < 0 ? (lv === -2 ? shadeHex(O.socksD, -0.15) : O.socksD) : toneOf(O.socks, lv); }
  }
  return c.dark ? shadeHex(col, -0.28) : col;
}
/* pinta la rejilla (ya escalada a la complexión) + la cabeza blanca */
/* diagonales (solo el jugador): el cuerpo de frente/espaldas girado a 3/4 hacia la derecha.
   El lado que se aleja se estrecha (quitamos 2 columnas) y el que se acerca se ensancha (duplicamos 2);
   el brazo del fondo va algo más oscuro. La izquierda es su espejo. */
const diagCols = (rem, dup) => { const out = []; for (let x = 0; x < 22; x++){ if (rem.includes(x)) continue; out.push(x); if (dup.includes(x)) out.push(x); } return out; };
const DIAG = {   // vista base · columnas · lado del brazo del fondo (el rayo no se voltea: cada diagonal se compone por separado)
  dr: { base:'down', cols: diagCols([15, 16], [6, 8]),   farRight: true  },
  dl: { base:'down', cols: diagCols([5, 6],   [13, 15]), farRight: false },
  ur: { base:'up',   cols: diagCols([5, 6],   [13, 15]), farRight: false },
  ul: { base:'up',   cols: diagCols([15, 16], [6, 8]),   farRight: true  },
};
function bodyFrameCanvas(B, O, view, F){
  const D = DIAG[view], diag = !!D, base = D ? D.base : view;
  const G = composeBody(base, F, B), bob = F.b || 0;
  const rows = B.rows, cols = base === 'side' ? [...Array(B.W).keys()] : diag ? B.cols.map(c => D.cols[c]) : B.cols;
  const cv = document.createElement('canvas'); cv.width = B.W; cv.height = B.H;
  const g = cv.getContext('2d');
  rows.forEach((sr, y) => cols.forEach((sc, x) => { const c = G[sr][sc]; if (!c) return;
    let col = bodyCellColor(c, O, base);
    if (diag && c.reg === 'arm' && col !== BODY_PAL.A && (D.farRight ? c.sc >= 18 : c.sc <= 3)) col = shadeHex(col, -0.2);   // brazo del fondo
    g.fillStyle = col; g.fillRect(x, y, 1, 1); }));
  cv.bob = bob; cv.view = base;                      // la cabeza (si hay imagen) se dibuja aparte, con este balanceo
  return cv;
}
/* cabeza blanca vacía (plantilla para la cara de cada personaje): forma redondeada según la complexión */
function blankHead(R, B, oy, O){
  const C = O && O.head ? { head:O.head[0], headD:O.head[1], headL:O.head[2] } : HEAD_COL, cx = B.W / 2;
  for (let r = 0; r < B.hh; r++){
    const t = ((r + 0.5) / B.hh) * 2 - 1, half = (B.hw / 2) * Math.pow(1 - Math.pow(Math.abs(t), 3.2), 1 / 3.2);
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half), y = 1 + r + oy;
    R(x0, y, x1 - x0, 1, r === B.hh - 1 ? C.headD : C.head);
    R(x1 - 2, y, 2, 1, C.headD);                                  // sombra a la derecha
  }
  R(Math.round(cx - B.hw / 2) + 2, 3 + oy, 2, 2, C.headL);         // brillo
}
const BODY_CACHE = {};
/* hoja de sprites de una ropa y complexión: { down, up, left, right } × { walk[4], idle[2] } */
/* tono de piel de las manos de cada personaje (claro, medio, oscuro), sacado de su cabeza */
const SKIN_TONES = {
  c9: ['#f8b878', '#e8a870', '#d89860'],   // Akira Ryuu
  c4: ['#f8d8c8', '#e0c8b0', '#d0b098'],   // Hana Tsuki
};
function bodySprites(key, build = 'standard', charId){
  const skin = charId && SKIN_TONES[charId];
  const ck = key + '|' + build + (skin ? '|' + charId : '');
  if (BODY_CACHE[ck]) return BODY_CACHE[ck];
  const O = skin ? { ...(OUTFITS[key] || OUTFITS.player), skin } : (OUTFITS[key] || OUTFITS.player), B = BUILDS[build] || BUILDS.standard, S = { down:{}, up:{}, right:{}, left:{}, W:B.W, H:B.H };
  const make = (dir, F) => bodyFrameCanvas(B, O, dir === 'right' ? 'side' : dir, F);
  for (const dir of ['down', 'up', 'right']){ S[dir].walk = (dir === 'right' ? WALK_SIDE : WALK_FRONT).map(F => make(dir, F)); S[dir].idle = IDLE_FRAMES.map(F => make(dir, F)); }
  const mirror = cv => { const m = document.createElement('canvas'); m.width = cv.width; m.height = cv.height; const g = m.getContext('2d'); g.translate(cv.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0); return m; };
  S.left.walk = S.right.walk.map(mirror); S.left.idle = S.right.idle.map(mirror);
  for (const f of S.left.walk.concat(S.left.idle)) f.mirror = true;
  S.left.walk.forEach((f, i) => { f.bob = S.right.walk[i].bob; f.view = 'side'; }); S.left.idle.forEach((f, i) => { f.bob = S.right.idle[i].bob; f.view = 'side'; });
  if (key === 'player'){
    const mk = (v, src) => ({ walk: WALK_FRONT.map(F => bodyFrameCanvas(B, O, v, F)), idle: IDLE_FRAMES.map(F => bodyFrameCanvas(B, O, v, F)) });
    S.downright = mk('dr'); S.downleft = mk('dl'); S.upright = mk('ur'); S.upleft = mk('ul');
  }
  return (BODY_CACHE[ck] = S);
}
const BODY_SPRITES = bodySprites('player');
/* equipo rival actual: el del próximo boss (Occult al principio… Zeus al final) */
function currentKit(){ const B = BOSSES[match.bossesBeaten || 0]; return B && OUTFITS[B.team] ? B.team : 'Zeus'; }
/* fotograma de un rival: mira hacia el jugador y siempre anda */
function enemyBodyFrame(e){
  if (!e.kit) e.kit = currentKit();
  const S = bodySprites(e.kit, e.build || 'standard'), dx = match.x - e.x, dy = match.y - e.y;
  e._face8 = face8Of(dx, dy); const dir = bodyDirOf(e._face8);
  e.walkPh = e.walkPh ?? Math.random() * 4;
  const i = ((Math.floor(match.elapsed * 13 + e.walkPh * 2) % 8) + 8) % 8 || 0;   // 8 fotogramas por ciclo
  return S[dir].walk[i];
}
/* marca verde del jugador: triángulo relleno apuntando abajo (9x6), con contorno */
/* marca roja de bosses y mini bosses: el mismo triángulo en rojo */
const BOSS_MARK = (() => { const A = ['KKKKKKKKK','KHHGGGGgK','.KHGGGgK.','..KGGgK..','...KgK...','....K....'];
  return pixelSprite(9, (x, y) => { const c = (A[y] || '')[x]; return !c || c === '.' ? null : { K:'#10131f', G:'#e8231a', H:'#ff8a7a', g:'#9a1410' }[c]; }); })();
function drawBossMark(x, yBottom){
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(BOSS_MARK, 0, 0, 9, 6, x - 10.125, yBottom - 13.5 + (Math.floor(match.elapsed * 3) % 2 ? 0 : -1.5), 20.25, 13.5);
  ctx.imageSmoothingEnabled = true;
}
const PLAYER_MARK = (() => { const A = ['KKKKKKKKK','KHHGGGGgK','.KHGGGgK.','..KGGgK..','...KgK...','....K....'];
  return pixelSprite(9, (x, y) => { const c = (A[y] || '')[x]; return !c || c === '.' ? null : { K:'#10131f', G:'#3fd84a', H:'#a6f59a', g:'#1f9a2a' }[c]; }); })();
/* fotograma del jugador según hacia dónde mira y si se mueve */
/* fotograma de un personaje que no es rival normal (árbitro, Willy, Kappah):
   mira hacia donde se mueve; si está quieto, respira mirando hacia abajo */
function npcBodyFrame(o, outfit, build){
  const S = bodySprites(outfit, build), dx = o.x - (o._px ?? o.x), dy = o.y - (o._py ?? o.y);
  o._px = o.x; o._py = o.y;
  const moving = Math.hypot(dx, dy) > 0.05;
  if (moving){ o._face8 = face8Of(dx, dy); o._dir = bodyDirOf(o._face8); }
  const set = S[o._dir || 'down'];
  return moving ? set.walk[((Math.floor(match.elapsed * 15) % 8) + 8) % 8] : set.idle[((Math.floor(match.elapsed * 2) % 2) + 2) % 2];
}
/* dibuja un cuerpo con los pies en (x, y + 14); devuelve la coordenada de arriba de la cabeza */
function drawBodyAt(fr, x, y, headKey, f8){
  const bw = fr.width * BODY_SCALE, bh = fr.height * BODY_SCALE, feet = y + 14, top = feet - bh;
  ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, feet - 1, bw * 0.36, 3.6, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
  ctx.imageSmoothingEnabled = false; ctx.drawImage(fr, x - bw / 2, top, bw, bh); ctx.imageSmoothingEnabled = true;
  return drawHead(headKey, fr, x, top, f8);
}
/* ---- cabezas de los personajes (opcionales) ----
   Pon tus dibujos en assets/heads/ con el mismo tamaño de píxel que el cuerpo (el cuerpo mide 22x19):
     <clave>.png (de frente) · <clave>_back.png (de espaldas) · <clave>_side.png (de perfil, mirando a la derecha)
   Claves: el id de cada personaje (c1, c2…), el nombre de cada equipo (Occult, Wild, Brain, Otaku, Royal, Shuriken,
   Farm, Kirkwood, Zeus), referee, willy y kappah. Si falta la de espaldas o la de perfil se usa la de frente. */
const HEAD_SCALE = 1;                      // tamaño de la cabeza respecto al cuerpo (1 = su tamaño en el dibujo)
const HEAD_OVERLAP = 6;                    // píxeles del cuerpo que tapa la barbilla
const HEAD_IMGS = {};
function headImage(name){
  let h = HEAD_IMGS[name];
  if (!h){ h = HEAD_IMGS[name] = { img: new Image(), ok: false, bad: false }; h.img.onload = () => { h.ok = true; }; h.img.onerror = () => { h.bad = true; }; h.img.src = `assets/heads/${name}.png`; }
  return h;
}
/* precarga las cabezas al elegir personaje (así no aparecen tarde el primer fotograma) */
function preloadHeads(keys){ for (const k of keys) if (k) for (const s of ['', '_back', '_side']) headImage(k + s); }
/* 8 direcciones a partir de un vector: abajo, abajo-derecha, derecha, arriba-derecha, arriba… */
const FACE8 = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
function face8Of(dx, dy){ return FACE8[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8]; }
/* en diagonal el cuerpo usa la vista de frente (abajo) o de espaldas (arriba); la cabeza tiene su vista de 3/4 */
function bodyDirOf(f8){ return f8 === 'downright' || f8 === 'downleft' ? 'down' : f8 === 'upright' || f8 === 'upleft' ? 'up' : f8; }
const HEAD_VIEW = { down:['', false], up:['_back', false], right:['_side', false], left:['_side', true],
  downright:['', false], downleft:['', false], upright:['_back', false], upleft:['_back', false] };
const HEAD_FALLBACK = { _side:'', _back:'' };
function drawHead(key, fr, cx, bodyTop, f8){
  if (!key) return bodyTop;
  if (!f8) f8 = fr.view === 'up' ? 'up' : fr.view === 'side' ? (fr.mirror ? 'left' : 'right') : 'down';
  let [suffix, flip] = HEAD_VIEW[f8] || HEAD_VIEW.down;
  let h = headImage(key + suffix);
  while (!h.ok && suffix){                                     // si falta esa vista, la más parecida
    if (!h.bad) return bodyTop;                                 // aún cargando
    suffix = HEAD_FALLBACK[suffix]; flip = false; h = headImage(key + suffix);
  }
  if (!h.ok) return bodyTop;
  const im = h.img, w = im.width * BODY_SCALE * HEAD_SCALE, hh = im.height * BODY_SCALE * HEAD_SCALE, bottom = bodyTop + (HEAD_OVERLAP + (fr.bob || 0)) * BODY_SCALE, y = bottom - hh;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (flip){ ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, y, w, hh); }
  else ctx.drawImage(im, cx - w / 2, y, w, hh);
  ctx.restore();
  return y;
}
/* ---- sprites de movimiento de los jugadores (hojas de IE1_por_equipos/<equipo>/<jugador>_sprites.png) ----
   Cada hoja es una tira de 47 fotogramas de 48x48 (mismo formato que Inazuma Rogue), mirando a la
   izquierda; los de la derecha se dibujan en espejo. Todos los sprites llevan la camiseta del Raimon.
   Direcciones de la hoja: 0 abajo · 1 abajo-izquierda · 2 izquierda · 3 arriba-izquierda · 4 arriba */
const SHEET_FRAME = 48;                     // lado de cada fotograma en la hoja
const SHEET_FEET = 42;                      // fila de los pies dentro del fotograma
const SHEET_TOP = 13;                       // fila de arriba del pelo (aprox.)
const SHEET_SCALE = 2;                    // tamaño del jugador en el campo (x2 sobre la hoja de 48x48)
const SHEET_IDS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,48,49,50,51,52,62,63];
const SHEET_COL = Object.fromEntries(SHEET_IDS.map((id, i) => [id, i]));   // fotograma lógico -> columna de la hoja
const SHEET_ANIM = {
  stand: [0, 6, 10, 14, 18],
  run: [[21,20,21,0,22,23,22,0], [25,24,25,6,26,27,26,6], [29,28,29,10,30,31,30,10], [33,32,33,14,34,35,34,14], [37,36,37,18,38,39,38,18]],
  runT: [2, 6, 2, 4, 2, 6, 2, 4],             // duración de cada paso (suman 28)
  kick: [[22,48], [26,49], [30,50], [34,51], [38,52]],
  down: [62, 63],
};
/* dirección de 8 del juego -> [dirección de la hoja, espejo] */
const SHEET_DIR = { down:[0,false], downleft:[1,false], left:[2,false], upleft:[3,false], up:[4,false],
                    downright:[1,true], right:[2,true], upright:[3,true] };
const SHEET_IMGS = {};
function sheetImage(path){
  if (!path) return null;
  let h = SHEET_IMGS[path];
  if (!h){ h = SHEET_IMGS[path] = { img: new Image(), ok: false }; h.img.onload = () => { h.ok = true; }; h.img.src = encodeURI(path); }
  return h;
}
/* fotograma lógico del jugador ahora mismo */
function playerSheetFrame(){
  const fx = fenixState();
  if (fx && fx.phase === 'rise'){                       // gira sobre sí mismo mientras sube
    const [d, flip] = SHEET_DIR[FACE8[Math.floor(match.elapsed * FENIX.spin) % 8]] || SHEET_DIR.down;
    return [SHEET_ANIM.kick[d][0], flip];
  }
  const [d, flip] = SHEET_DIR[match.kickT > 0 && match.kickFace ? match.kickFace : (match.face8 || match.facing || 'down')] || SHEET_DIR.down;
  if ((match.dying || match.over) && match.hp <= 0) return [SHEET_ANIM.down[Math.floor(match.elapsed * 2) % 2], flip];
  if (match.kickT > 0) return [SHEET_ANIM.kick[d][match.kickT > KICK_TIME / 2 ? 0 : 1], flip];
  if (match.moving){
    let t = ((match.walkT || 0) * 3.5) % 28, i = 0;
    while (i < 7 && t >= SHEET_ANIM.runT[i]){ t -= SHEET_ANIM.runT[i]; i++; }
    return [SHEET_ANIM.run[d][i], flip];
  }
  return [SHEET_ANIM.stand[d], flip];
}
const KICK_TIME = 0.16;                     // cuánto dura la pose de chutar al disparar
/* dibuja al jugador con su sprite (pies en y + 14); devuelve la coordenada de arriba de la cabeza, o null si la hoja aún no ha cargado */
function drawPlayerSheet(x, y){
  const h = sheetImage(match.char && match.char.sprite);
  if (!h || !h.ok) return null;
  const [id, flip] = playerSheetFrame(), col = SHEET_COL[id] ?? 0, S = SHEET_SCALE * (SHEET_BUILD_SCALE[playerBuild()] || 1), F = SHEET_FRAME;
  const jump = (fenixState() || {}).h || 0;
  const feet = y + 14 - jump, top = feet - SHEET_FEET * S;
  // al recibir daño el jugador parpadea en rojo
  const hurt = match.hurtUntil > match.elapsed && Math.floor(match.elapsed / 0.06) % 2 === 0;
  const src = hurt ? tintedFrame(h.img, col, '#ff2a2a', 0.78) : h.img, sx = hurt ? 0 : col * F;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (flip){ ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(src, sx, 0, F, F, -F * S / 2, top, F * S, F * S); }
  else ctx.drawImage(src, sx, 0, F, F, x - F * S / 2, top, F * S, F * S);
  ctx.restore();
  return top + SHEET_TOP * S;
}
/* copia de un fotograma teñida de un color (para el parpadeo de daño) */
const _tintCv = document.createElement('canvas'); _tintCv.width = _tintCv.height = SHEET_FRAME;
const _tintCtx = _tintCv.getContext('2d');
function tintedFrame(img, col, color, alpha){
  const F = SHEET_FRAME;
  _tintCtx.globalCompositeOperation = 'source-over'; _tintCtx.globalAlpha = 1;
  _tintCtx.clearRect(0, 0, F, F);
  _tintCtx.drawImage(img, col * F, 0, F, F, 0, 0, F, F);
  _tintCtx.globalCompositeOperation = 'source-atop'; _tintCtx.globalAlpha = alpha;
  _tintCtx.fillStyle = color; _tintCtx.fillRect(0, 0, F, F);
  _tintCtx.globalCompositeOperation = 'source-over'; _tintCtx.globalAlpha = 1;
  return _tintCv;
}
const HURT_FLASH = 0.28;                    // segundos que el jugador parpadea en rojo al recibir un golpe

/* tamaño en el campo según la complexión: los pequeños un poco más pequeños y los grandes un poco más grandes */
const SHEET_BUILD_SCALE = { small: 0.85, standard: 1, big: 1.15 };
/* ---- rivales con el mismo sprite que los jugadores, pero con la equipación de su club ----
   Las hojas recoloreadas están en assets/kits/<equipo>/<id del jugador>.png (camiseta y pantalón de cada club).
   Cada rival normal es un jugador de campo al azar del equipo del próximo boss; los mini bosses usan su propio sprite. */
const KIT_FOLDER = { Occult:'occult', Wild:'wild', Brain:'brain', Otaku:'otaku', Royal:'royal', Shuriken:'shuriken', Farm:'farm', Kirkwood:'kirkwood', Zeus:'zeus' };
const KIT_SHEETS = {"Royal":["ie16","ie17","ie18","ie19","ie1a","ie1b","ie1c","ie1d","ie1f","ie21","ie22","ie23","ie24"],"Occult":["ie2a","ie2b","ie2c","ie2d","ie2e","ie2f","ie30","ie32","ie33","ie35","ie36","ie37","ie38"],"Wild":["ie3f","ie40","ie41","ie42","ie43","ie44","ie45","ie46","ie47","ie48","ie49","ie4a","ie4b"],"Brain":["ie52","ie53","ie54","ie55","ie56","ie57","ie58","ie59","ie5a","ie5b","ie5d","ie5e","ie5f","ie60"],"Otaku":["ie66","ie67","ie68","ie69","ie6a","ie6b","ie6c","ie6d","ie6f","ie70","ie71","ie73","ie74"],"Shuriken":["ie7a","ie7b","ie7c","ie7d","ie7e","ie7f","ie80","ie81","ie82","ie84","ie85","ie86","ie87"],"Farm":["ie8e","ie8f","ie90","ie91","ie92","ie93","ie94","ie96","ie97","ie99","ie9a","ie9b","ie9c"],"Kirkwood":["iea2","iea3","iea4","iea5","iea6","iea7","iea8","iead","ieae","ieaf","ieb0"],"Zeus":["ieb6","ieb7","ieb8","ieb9","ieba","iebb","iebc","iebd","iebf","iec1","iec2","iec3","iec4"]};
/* los jugadores que son bosses tienen su propio sprite (con la equipación de su club) y NO salen en las oleadas */
const BOSS_SHEETS = {
  'Talisman':'assets/kits/occult/ie31.png', 'Chicken':'assets/kits/wild/ie3e.png', 'Feldt':'assets/kits/brain/ie51.png',
  'Artist':'assets/kits/otaku/ie6e.png', 'Jude':'assets/kits/royal/ie449.png', 'Cloak':'assets/kits/shuriken/ie83.png',
  'Greeny':'assets/kits/farm/ie8d.png', 'Thomas Murdock':'assets/kits/kirkwood/ieaa.png',
  'Tyler Murdock':'assets/kits/kirkwood/ieab.png', 'Marvin Murdock':'assets/kits/kirkwood/iea9.png',
  'Aphrodite':'assets/kits/zeus/iebe.png',
};
/* Hillman (camiseta negra) y el árbitro Chester Horse (camiseta amarilla) */
const NPC_SHEETS = { hillman:'assets/kits/npc/hillman.png', referee:'assets/kits/npc/chester.png',
  kappah:'assets/kits/npc/kappah.png',                                                        // Kappah: pelo azul, plato verde y pico
  willy:'inazuma_rogue_jugadores/IE1_por_equipos/01_Raimon/0014_William_Glass_FW_sprites.png' };   // Willy Glass con la del Raimon
const PLAYER_EL = Object.fromEntries(PLAYERS.map(p => [p.id, p.element]));
/* afinidad del jugador que hay detrás de una hoja de sprites (assets/kits/<equipo>/<id>.png) */
function sheetElement(path){ const m = /\/(ie[0-9a-z]+)\.png$/i.exec(path || ''); return m ? PLAYER_EL[m[1]] : null; }
function enemySheetPath(e){
  if ((e.boss || e.miniBoss) && BOSS_SHEETS[e.name]) return BOSS_SHEETS[e.name];
  if (e._sheet === undefined){
    const kit = e.kit || (e.kit = currentKit()), list = KIT_SHEETS[kit] || [];
    let id = null;
    if (!id && list.length) id = list[Math.floor(Math.random() * list.length)];
    e._sheet = id ? `assets/kits/${KIT_FOLDER[kit]}/${id}.png` : null;
  }
  return e._sheet;
}
/* precarga las hojas del equipo rival (para que no salgan tarde) */
function preloadBossSheets(){ for (const k in BOSS_SHEETS) sheetImage(BOSS_SHEETS[k]); for (const k in NPC_SHEETS) sheetImage(NPC_SHEETS[k]); }
function preloadKit(kit){ for (const id of KIT_SHEETS[kit] || []) sheetImage(`assets/kits/${KIT_FOLDER[kit]}/${id}.png`); }
/* dibuja una hoja de sprites (pies en feetY): face8 = hacia dónde mira, moving = corre o está quieto */
function drawSheetAt(path, x, feetY, scaleMul, face8, moving, phase){
  const h = sheetImage(path);
  if (!h || !h.ok) return null;
  const [d, flip] = SHEET_DIR[face8] || SHEET_DIR.down;
  let id = SHEET_ANIM.stand[d];
  if (moving){
    let t = ((match.elapsed * 50 + (phase || 0) * 7) % 28 + 28) % 28, i = 0;
    while (i < 7 && t >= SHEET_ANIM.runT[i]){ t -= SHEET_ANIM.runT[i]; i++; }
    id = SHEET_ANIM.run[d][i];
  }
  const col = SHEET_COL[id] ?? 0, F = SHEET_FRAME, S = SHEET_SCALE * scaleMul, top = feetY - SHEET_FEET * S;
  ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, feetY - 1, 9 * S, 2.2 * S, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (flip){ ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(h.img, col * F, 0, F, F, -F * S / 2, top, F * S, F * S); }
  else ctx.drawImage(h.img, col * F, 0, F, F, x - F * S / 2, top, F * S, F * S);
  ctx.restore();
  return top + SHEET_TOP * S;
}
/* cara del jugador que representa a un boss (para la barra de vida) */
function bossFace(name, size){
  const m = (BOSS_SHEETS[name] || '').match(/(ie[0-9a-f]+)\.png$/), c = m && CHARACTERS.find(ch => ch.id === m[1]);
  return c ? charFace(c, size) : '';
}
const BOSS_SHEET_SCALE = 1.3;               // los bosses se ven más grandes que los rivales
function drawBossSprite(e, x, y){
  const path = BOSS_SHEETS[e.name]; if (!path) return null;
  const dx = e.x - (e._sx ?? e.x), dy = e.y - (e._sy ?? e.y); e._sx = e.x; e._sy = e.y;
  const moving = Math.hypot(dx, dy) > 0.1;
  const f = face8Of(match.x - e.x, match.y - e.y);
  return drawSheetAt(path, x, y + 14 - (e.jumpH || 0), BOSS_SHEET_SCALE, f, moving, 0);
}
/* personaje que pasea (árbitro, Hillman): mira hacia donde se mueve; quieto, mira hacia el jugador */
function drawNpcSheet(o, path, x, y){
  const dx = o.x - (o._sx ?? o.x), dy = o.y - (o._sy ?? o.y); o._sx = o.x; o._sy = o.y;
  const moving = Math.hypot(dx, dy) > 0.05;
  o._sf = moving ? face8Of(dx, dy) : face8Of(match.x - o.x, match.y - o.y);
  return drawSheetAt(path, x, y + 14, 1, o._sf, moving, 0);
}
/* dibuja a un rival corriendo hacia el jugador, con los pies en feetY; devuelve la parte de arriba de la cabeza o null si no hay hoja */
function drawEnemySheet(e, x, feetY, scaleMul){
  const h = sheetImage(enemySheetPath(e));
  if (!h || !h.ok) return null;
  e._face8 = face8Of(match.x - e.x, match.y - e.y);
  e.walkPh = e.walkPh ?? Math.random() * 4;
  const [d, flip] = SHEET_DIR[e._face8] || SHEET_DIR.down;
  let t = ((match.elapsed * 50 + e.walkPh * 7) % 28 + 28) % 28, i = 0;
  while (i < 7 && t >= SHEET_ANIM.runT[i]){ t -= SHEET_ANIM.runT[i]; i++; }
  const col = SHEET_COL[SHEET_ANIM.run[d][i]] ?? 0, F = SHEET_FRAME, S = SHEET_SCALE * scaleMul, top = feetY - SHEET_FEET * S;
  ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, feetY - 1, 9 * S, 2.2 * S, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (flip){ ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(h.img, col * F, 0, F, F, -F * S / 2, top, F * S, F * S); }
  else ctx.drawImage(h.img, col * F, 0, F, F, x - F * S / 2, top, F * S, F * S);
  ctx.restore();
  return top + SHEET_TOP * S;
}

/* complexión del personaje elegido (pequeño / estándar / grande) y su hitbox */
function playerBuild(){ return (match && match.char && match.char.build) || 'standard'; }
function playerHitOff(){ return (BUILDS[playerBuild()] || BUILDS.standard).hit; }
function playerBodyFrame(){
  const S = bodySprites('player', playerBuild(), match.char && match.char.id);
  const dir = (match.face8 && S[match.face8]) ? match.face8 : (match.facing || 'down'), set = S[dir] || S.down;
  return match.moving ? set.walk[(Math.floor((match.walkT || 0) * 2) % 8) || 0] : set.idle[(Math.floor(Math.abs(match.elapsed) * 2) % 2) || 0];
}
/* ---- proyectiles de los rivales: balón de fútbol pixel del color de su afinidad (2 fotogramas que giran) ---- */
const SHOT_COLS = { fire:['#ff6b3c', '#a82418', '#ffd0b8'], air:['#8fd3ff', '#1f5aa8', '#e6f6ff'], forest:['#62c96c', '#5f2f99', '#d2f5c0'],
  mountain:['#c48a55', '#5a3815', '#f1d9b0'], dragon:['#4a5ae0', '#1a1d5e', '#b8c4ff'], celestial:['#f2d34b', '#b47d00', '#fff8d0'], neutral:['#e8e8ee', '#1b1d26', '#ffffff'] };
const SHOT_SPR = {};
function enemyShotSprite(el, f){
  const key = SHOT_COLS[el] ? el : 'neutral', k = key + f;
  if (SHOT_SPR[k]) return SHOT_SPR[k];
  const [base, dark, light] = SHOT_COLS[key], c = 7.5, R = 6.4, rot = f ? Math.PI / 5 : 0;
  const pent = (cx, cy, r, a0) => [0,1,2,3,4].map(i => [cx + r * Math.cos(a0 + i * 1.2566), cy + r * Math.sin(a0 + i * 1.2566)]);
  const center = pent(c + 0.5, c + 0.5, 2.3, -Math.PI / 2 + rot);
  const grid = [];
  for (let y = 0; y < 16; y++){ grid.push([]); for (let x = 0; x < 16; x++){
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy); let col = null;
    if (d <= R){
      col = (dx + dy > 4.5) ? shadeHex(base, -0.18) : base;
      if (dx + dy < -6 && d > 3) col = light;
      if (pointInPoly(x + 0.5, y + 0.5, center)) col = dark;
      for (let i = 0; i < 5; i++){ const b = -Math.PI / 2 + rot + i * 1.2566 + Math.PI / 5; if (Math.hypot(dx - 6.2 * Math.cos(b), dy - 6.2 * Math.sin(b)) < 1.8) col = dark; }
    }
    grid[y].push(col);
  } }
  SHOT_SPR[k] = pixelSprite(16, (x, y) => { if (grid[y][x]) return grid[y][x]; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (grid[y + dy] && grid[y + dy][x + dx]) return '#10131f'; return null; });
  return SHOT_SPR[k];
}
/* ======================================================================
   ICONOS ARCADE EN LUGAR DE EMOJIS
   Cada emoji del juego (menos los de personajes y enemigos) tiene su icono
   pixel art. Una capa global los cambia solos: en el canvas (fillText) y en
   el HTML (textos que se insertan). Los emojis de personas no se tocan.
   ====================================================================== */
const star5 = (g, cx, cy, R, r, fill) => V.poly(g, [...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r : R; return [cx + Math.cos(a) * k, cy + Math.sin(a) * k]; }), fill);
const flame = (g, x, y, s, a, b, c) => {
  V.poly(g, [[x, y - 13*s], [x + 4*s, y - 6*s], [x + 7*s, y - 9*s], [x + 9*s, y + 1*s], [x + 6*s, y + 9*s], [x - 6*s, y + 9*s], [x - 9*s, y + 1*s], [x - 6*s, y - 6*s], [x - 3*s, y - 4*s]], a);
  V.poly(g, [[x, y - 5*s], [x + 3*s, y], [x + 5*s, y - 2*s], [x + 6*s, y + 4*s], [x + 3*s, y + 9*s], [x - 3*s, y + 9*s], [x - 6*s, y + 4*s], [x - 3*s, y - 1*s]], b);
  V.poly(g, [[x, y + 1*s], [x + 3*s, y + 5*s], [x + 2*s, y + 9*s], [x - 2*s, y + 9*s], [x - 3*s, y + 5*s]], c);
};
const leaf = (g, cx, cy, r, rot, a, b) => { V.ell(g, cx, cy, r, r * 0.5, a, rot); V.line(g, [[cx - Math.cos(rot) * r * 0.8, cy - Math.sin(rot) * r * 0.8], [cx + Math.cos(rot) * r * 0.8, cy + Math.sin(rot) * r * 0.8]], 1, b); };
const book = (g, cov, dark, mark) => {
  V.rect(g, 7, 4, 19, 25, dark); V.rect(g, 8, 3, 18, 24, cov);
  V.rect(g, 24, 5, 3, 22, '#f1e3c8'); V.rect(g, 8, 3, 3, 24, dark);
  V.rect(g, 13, 8, 10, 6, '#f1e3c8'); V.rect(g, 14, 10, 8, 1, '#7d8794'); V.rect(g, 14, 12, 6, 1, '#7d8794');
  if (mark) V.rect(g, 19, 25, 3, 5, mark);
};
const ball = g => {
  V.circ(g, 16, 16, 12, '#ffffff'); V.circ(g, 19, 19, 9, '#e3e7ee'); V.circ(g, 16, 16, 9, '#ffffff');
  V.poly(g, [[16, 11], [20.5, 14.2], [18.8, 19.5], [13.2, 19.5], [11.5, 14.2]], '#1b1d26');
  V.poly(g, [[16, 4], [20, 5], [16, 7.5], [12, 5]], '#1b1d26'); V.poly(g, [[27, 13], [27.5, 18], [25, 16.5]], '#1b1d26');
  V.poly(g, [[5, 13], [4.5, 18], [7, 16.5]], '#1b1d26'); V.poly(g, [[9, 25], [13, 27.5], [11, 23.5]], '#1b1d26'); V.poly(g, [[23, 25], [19, 27.5], [21, 23.5]], '#1b1d26');
  V.rect(g, 9, 9, 3, 2, '#ffffff');
};
const gem = (g, a, b, c) => { V.poly(g, [[16, 4], [26, 12], [16, 28], [6, 12]], a); V.poly(g, [[16, 4], [26, 12], [16, 12]], b); V.poly(g, [[6, 12], [16, 12], [16, 28]], c); V.poly(g, [[11, 9], [14, 7], [13, 11]], '#ffffff'); };
const cloud = (g, col, dark) => { V.circ(g, 11, 14, 6, col); V.circ(g, 18, 11, 7, col); V.circ(g, 24, 15, 5, col); V.rr(g, 6, 14, 23, 7, 3, col); V.rect(g, 7, 19, 21, 2, dark); };
const EMO_DRAW = {
  ball,
  star(g){ star5(g, 16, 17, 13, 5.5, '#f2b705'); star5(g, 16, 17, 9, 3.8, '#ffe27a'); V.rect(g, 13, 11, 2, 3, '#ffffff'); },
  bigstar(g){ for (let i = 0; i < 8; i++){ const a = i * Math.PI / 4; V.line(g, [[16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12], [16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14]], 2, '#ffe27a'); } star5(g, 16, 17, 11, 4.6, '#f2b705'); star5(g, 16, 17, 7, 3, '#fff6c2'); },
  flame(g){ flame(g, 16, 18, 1.15, '#e8231a', '#ff8a2a', '#ffe27a'); },
  swirl(g){ V.circ(g, 16, 16, 13, '#3f8fe0'); V.circ(g, 16, 16, 10, '#9fd2ff'); V.line(g, [[16, 16], [20, 14], [21, 19], [16, 22], [10, 19], [10, 12], [16, 8], [24, 10]], 2.4, '#ffffff'); },
  mountain(g){ V.poly(g, [[2, 27], [12, 8], [18, 17], [21, 13], [30, 27]], '#8a5a2b'); V.poly(g, [[12, 8], [16, 14], [13, 13], [10, 15], [9, 13]], '#ffffff'); V.poly(g, [[21, 13], [24, 18], [21, 17], [19, 18]], '#ffffff'); V.poly(g, [[18, 17], [30, 27], [16, 27]], '#5a3815'); },
  rock(g){ V.poly(g, [[4, 22], [8, 11], [16, 6], [25, 9], [29, 19], [24, 27], [9, 27]], '#8d97a6'); V.poly(g, [[16, 6], [25, 9], [29, 19], [20, 17]], '#c3cbd6'); V.poly(g, [[9, 27], [24, 27], [20, 17], [12, 20]], '#5f6773'); V.line(g, [[12, 20], [20, 17]], 1, '#3a404a'); },
  sprig(g){ V.line(g, [[8, 28], [16, 16], [22, 6]], 1.6, '#257a2a'); leaf(g, 12, 18, 6, -2.2, '#4fbf45', '#257a2a'); leaf(g, 21, 18, 6, -0.6, '#4fbf45', '#257a2a'); leaf(g, 15, 10, 5, -2.4, '#a6e36e', '#257a2a'); leaf(g, 23, 9, 5, -0.9, '#a6e36e', '#257a2a'); },
  leaf(g){ leaf(g, 16, 16, 13, -0.75, '#4fbf45', '#257a2a'); V.ell(g, 12, 12, 4, 2, '#a6e36e', -0.75); V.line(g, [[5, 27], [8, 24]], 2, '#257a2a'); },
  autumn(g){ const ml = (cx, cy, r, rot, c, d) => { g.save(); g.translate(cx, cy); g.rotate(rot); V.poly(g, [[0, -r], [r * 0.3, -r * 0.45], [r * 0.85, -r * 0.6], [r * 0.6, -r * 0.05], [r, r * 0.3], [r * 0.35, r * 0.4], [0, r * 0.75], [-r * 0.35, r * 0.4], [-r, r * 0.3], [-r * 0.6, -r * 0.05], [-r * 0.85, -r * 0.6], [-r * 0.3, -r * 0.45]], c); V.line(g, [[0, -r * 0.6], [0, r * 1.2]], 1.2, d); g.restore(); }; ml(11, 12, 9, -0.4, '#ff8a2a', '#a82418'); ml(21, 19, 9, 0.5, '#e8463a', '#a82418'); V.rect(g, 12, 13, 2, 2, '#ffe27a'); },
  sprout(g){ V.rect(g, 6, 24, 20, 5, '#8a5a2b'); V.rect(g, 15, 13, 2, 11, '#257a2a'); leaf(g, 10, 13, 6, 0.5, '#4fbf45', '#257a2a'); leaf(g, 22, 10, 6, -0.6, '#a6e36e', '#257a2a'); },
  dragon(g){ V.poly(g, [[4, 22], [8, 12], [16, 8], [24, 10], [29, 16], [27, 20], [19, 20], [15, 26], [8, 27]], '#3a3fb8'); V.poly(g, [[16, 8], [12, 2], [19, 7]], '#c9d4ff'); V.poly(g, [[22, 9], [24, 3], [25, 10]], '#c9d4ff'); V.poly(g, [[19, 20], [27, 20], [24, 23], [18, 23]], '#2b2f8a'); V.rect(g, 18, 13, 4, 3, '#ffe27a'); V.rect(g, 20, 13, 1, 3, '#1b1d26'); V.poly(g, [[27, 20], [28, 23], [26, 21]], '#ffffff'); V.poly(g, [[6, 18], [10, 15], [10, 22]], '#7d8ff0'); },
  sparkle(g){ const sp = (x, y, r, c) => V.poly(g, [[x, y - r], [x + r * 0.25, y - r * 0.25], [x + r, y], [x + r * 0.25, y + r * 0.25], [x, y + r], [x - r * 0.25, y + r * 0.25], [x - r, y], [x - r * 0.25, y - r * 0.25]], c); sp(13, 16, 11, '#f2b705'); sp(13, 16, 6, '#fff6c2'); sp(25, 7, 5, '#ffe27a'); sp(25, 25, 4, '#ffffff'); },
  orb(g){ V.circ(g, 16, 16, 11, '#d9dde4'); V.circ(g, 15, 15, 9, '#ffffff'); V.rect(g, 10, 10, 3, 3, '#ffffff'); },
  comet(g){ V.poly(g, [[3, 3], [21, 15], [16, 21]], '#ff8a2a'); V.poly(g, [[7, 3], [22, 14], [18, 15]], '#ffe27a'); V.circ(g, 21, 21, 7, '#c8231a'); V.circ(g, 20, 20, 4.5, '#ff8a2a'); V.rect(g, 18, 18, 2, 2, '#ffe27a'); },
  bomb(g){ V.circ(g, 14, 19, 10, '#2f3440'); V.circ(g, 11, 16, 3, '#5f6773'); V.rect(g, 19, 7, 5, 4, '#7d8794'); V.line(g, [[22, 7], [24, 4], [27, 4]], 1.5, '#d9c49a'); V.poly(g, [[27, 1], [30, 4], [27, 7], [24, 4]], '#ffe27a'); V.rect(g, 26, 3, 2, 2, '#e8231a'); },
  tophat(g){ V.ell(g, 16, 25, 14, 4, '#1b1d26'); V.rect(g, 8, 6, 16, 19, '#2f3440'); V.rect(g, 8, 18, 16, 3, '#4fbf45'); V.rect(g, 10, 7, 3, 10, '#5f6773'); },
  gemBlue(g){ gem(g, '#3f8fe0', '#9fd2ff', '#1f5aa8'); },
  gemPurple(g){ gem(g, '#9a55e0', '#c7a6ff', '#5f2f99'); },
  gemGreen(g){ gem(g, '#4fbf45', '#a6e36e', '#257a2a'); },
  gemCyan(g){ gem(g, '#46d0ff', '#d6f3ff', '#1f8fc8'); },
  tornado(g){ const c = ['#c3cbd6', '#ffffff', '#9fd2ff', '#ffffff', '#c3cbd6']; [[4, 28, 4], [7, 22, 6], [10, 16, 9], [12, 10, 11], [13, 4, 12]].forEach(([w, y, x], i) => V.rr(g, 16 - w * 1.2 + (i % 2 ? 2 : -1), y, w * 2.4, 5, 2, c[i])); },
  wind(g){ V.line(g, [[3, 10], [20, 10], [24, 7], [21, 4], [18, 6]], 2.6, '#ffffff'); V.line(g, [[3, 17], [26, 17], [29, 20], [26, 24], [23, 22]], 2.6, '#9fd2ff'); V.line(g, [[6, 24], [15, 24]], 2.6, '#ffffff'); },
  dash(g){ V.line(g, [[3, 9], [16, 9]], 3, '#9fd2ff'); V.line(g, [[2, 16], [20, 16]], 3, '#ffffff'); V.line(g, [[5, 23], [15, 23]], 3, '#9fd2ff'); V.circ(g, 24, 16, 6, '#ffffff'); V.circ(g, 25, 16, 3, '#9fd2ff'); },
  orbit(g){ V.ell(g, 16, 16, 14, 6, '#ffe27a', -0.4); V.ell(g, 16, 16, 11, 3.5, 'rgba(0,0,0,0)', -0.4); g.globalCompositeOperation = 'destination-out'; V.ell(g, 16, 16, 11, 3.6, '#000', -0.4); g.globalCompositeOperation = 'source-over'; star5(g, 16, 15, 8, 3.4, '#f2b705'); V.circ(g, 27, 10, 2.2, '#ffffff'); },
  clover(g){ V.line(g, [[16, 18], [19, 29]], 2, '#257a2a'); [[16, 9], [9, 16], [23, 16], [16, 18.5]].slice(0, 3).forEach(([x, y]) => { V.circ(g, x - 2.6, y, 4.6, '#4fbf45'); V.circ(g, x + 2.6, y, 4.6, '#4fbf45'); V.circ(g, x, y + 2.8, 4.4, '#4fbf45'); }); V.circ(g, 16, 15, 3, '#a6e36e'); V.rect(g, 12, 7, 2, 2, '#a6e36e'); },
  bookBlack(g){ book(g, '#3a3f4a', '#1f2330', '#e8463a'); },
  bookRed(g){ book(g, '#e8463a', '#a82418', '#f2b705'); },
  bookGreen(g){ book(g, '#4fbf45', '#257a2a', '#f2b705'); },
  bookOrange(g){ book(g, '#ff8a2a', '#b85410', '#3f8fe0'); },
  bookBlue(g){ book(g, '#3f8fe0', '#1f5aa8', '#f2b705'); },
  swords(g){ const sw = (flip) => { g.save(); if (flip){ g.translate(32, 0); g.scale(-1, 1); } V.poly(g, [[5, 3], [8, 3], [24, 19], [21, 22]], '#d9dde4'); V.poly(g, [[5, 3], [8, 3], [24, 19]], '#ffffff'); V.rect(g, 18, 22, 8, 3, '#a8935f'); V.line(g, [[18, 18], [26, 26]], 3, '#f2b705'); V.rect(g, 25, 25, 4, 4, '#8a5a2b'); g.restore(); }; sw(false); sw(true); },
  runner(g){ V.circ(g, 20, 6, 4, '#f3c9a0'); V.poly(g, [[14, 11], [22, 11], [20, 20], [13, 19]], '#3f8fe0'); V.line(g, [[15, 13], [8, 17]], 3, '#f3c9a0'); V.line(g, [[21, 13], [27, 9]], 3, '#f3c9a0'); V.line(g, [[15, 19], [9, 26], [4, 25]], 3.4, '#f1f1f1'); V.line(g, [[19, 19], [23, 25], [28, 28]], 3.4, '#f1f1f1'); V.rect(g, 2, 25, 4, 3, '#1b1d26'); V.rect(g, 26, 27, 5, 3, '#1b1d26'); },
  leg(g){ V.poly(g, [[10, 2], [17, 2], [17, 18], [12, 18]], '#f3c9a0'); V.rect(g, 11, 13, 7, 9, '#ffffff'); V.rect(g, 11, 15, 7, 2, '#e8463a'); V.poly(g, [[10, 22], [18, 22], [21, 25], [29, 26], [29, 30], [9, 30]], '#1b1d26'); V.rect(g, 12, 23, 6, 2, '#3f8fe0'); },
  battery(g){ V.rr(g, 4, 9, 22, 15, 2, '#1b1d26'); V.rect(g, 26, 13, 3, 7, '#7d8794'); V.rect(g, 6, 11, 18, 11, '#2f3440'); V.rect(g, 7, 12, 5, 9, '#4fbf45'); V.rect(g, 13, 12, 5, 9, '#4fbf45'); V.rect(g, 19, 12, 4, 9, '#a6e36e'); V.bolt(g, 14, 10, 1.3, '#ffe27a'); },
  flip(g){ V.circ(g, 9, 6, 4, '#f3c9a0'); V.poly(g, [[6, 11], [14, 9], [22, 17], [18, 20]], '#3f8fe0'); V.line(g, [[20, 18], [27, 24], [30, 21]], 3.2, '#f1f1f1'); V.line(g, [[8, 12], [3, 20]], 3, '#f3c9a0'); V.line(g, [[12, 11], [17, 4]], 3, '#f3c9a0'); V.rect(g, 4, 27, 24, 2, '#9fd2ff'); V.rect(g, 8, 24, 3, 2, '#9fd2ff'); V.rect(g, 20, 23, 2, 2, '#ffffff'); },
  zzz(g){ const z = (x, y, s, c) => { V.rect(g, x, y, 6*s, 2*s, c); V.poly(g, [[x + 6*s, y + 2*s], [x + 2*s, y + 6*s], [x, y + 6*s], [x + 4*s, y + 2*s]], c); V.rect(g, x, y + 6*s, 6*s, 2*s, c); }; z(3, 16, 1.6, '#9fd2ff'); z(15, 8, 1.2, '#c7a6ff'); z(23, 2, 0.9, '#ffffff'); },
  goal(g){ V.rect(g, 3, 7, 26, 20, '#c3cbd6'); g.globalCompositeOperation = 'destination-out'; V.rect(g, 6, 10, 20, 17, '#000'); g.globalCompositeOperation = 'source-over'; for (let x = 8; x < 26; x += 4) V.rect(g, x, 10, 1, 17, '#9fa8b5'); for (let y = 13; y < 27; y += 4) V.rect(g, 6, y, 20, 1, '#9fa8b5'); V.rect(g, 3, 7, 26, 3, '#ffffff'); V.rect(g, 3, 7, 3, 20, '#ffffff'); V.rect(g, 26, 7, 3, 20, '#ffffff'); },
  moon(g){ V.circ(g, 16, 16, 12, '#ffe27a'); g.globalCompositeOperation = 'destination-out'; V.circ(g, 22, 12, 10, '#000'); g.globalCompositeOperation = 'source-over'; V.rect(g, 8, 18, 3, 3, '#d6a12a'); V.rect(g, 12, 23, 2, 2, '#d6a12a'); },
  sun(g){ for (let i = 0; i < 8; i++){ const a = i * Math.PI / 4; V.poly(g, [[16 + Math.cos(a - 0.25) * 10, 16 + Math.sin(a - 0.25) * 10], [16 + Math.cos(a) * 15, 16 + Math.sin(a) * 15], [16 + Math.cos(a + 0.25) * 10, 16 + Math.sin(a + 0.25) * 10]], '#ff8a2a'); } V.circ(g, 16, 16, 9, '#f2b705'); V.circ(g, 15, 15, 6, '#ffe27a'); },
  statue(g){ V.rr(g, 8, 3, 16, 22, 3, '#8d97a6'); V.rect(g, 19, 5, 5, 19, '#5f6773'); V.rect(g, 10, 10, 4, 3, '#3a404a'); V.rect(g, 17, 10, 4, 3, '#3a404a'); V.rect(g, 14, 12, 3, 7, '#5f6773'); V.rect(g, 12, 20, 8, 2, '#3a404a'); V.rect(g, 5, 25, 22, 5, '#7a5a3a'); },
  lock(g){ V.rr(g, 9, 3, 14, 16, 6, '#7d8794'); g.globalCompositeOperation = 'destination-out'; V.rr(g, 12, 6, 8, 13, 4, '#000'); g.globalCompositeOperation = 'source-over'; V.rr(g, 6, 13, 20, 16, 2, '#f2b705'); V.rect(g, 6, 13, 20, 3, '#ffe27a'); V.rect(g, 14, 18, 4, 4, '#1b1d26'); V.rect(g, 15, 21, 2, 4, '#1b1d26'); },
  warning(g){ V.poly(g, [[16, 2], [30, 28], [2, 28]], '#f2b705'); V.poly(g, [[16, 6], [27, 26], [5, 26]], '#ffe27a'); V.rect(g, 14, 11, 4, 9, '#1b1d26'); V.rect(g, 14, 22, 4, 3, '#1b1d26'); },
  ghost(g){ V.poly(g, [[5, 29], [5, 14], [8, 6], [16, 2], [24, 6], [27, 14], [27, 29], [23, 25], [19, 29], [16, 25], [13, 29], [9, 25]], '#e8e4ff'); V.rect(g, 21, 8, 4, 18, '#c7a6ff'); V.rect(g, 10, 11, 4, 5, '#1b1d26'); V.rect(g, 18, 11, 4, 5, '#1b1d26'); V.ell(g, 16, 20, 2.5, 2, '#1b1d26'); },
  juice(g){ V.rect(g, 8, 8, 16, 21, '#ff8a2a'); V.rect(g, 19, 8, 5, 21, '#b85410'); V.poly(g, [[8, 8], [12, 4], [24, 4], [24, 8]], '#ffe27a'); V.rect(g, 18, 0, 2, 6, '#e8463a'); V.rect(g, 10, 14, 9, 9, '#ffffff'); V.circ(g, 14.5, 18.5, 3, '#4fbf45'); },
  banana(g){ V.line(g, [[5, 8], [7, 18], [14, 25], [24, 27], [29, 24]], 6, '#f2b705'); V.line(g, [[8, 18], [15, 24], [24, 25]], 2, '#ffe27a'); V.rect(g, 3, 4, 4, 5, '#7a5a3a'); V.rect(g, 28, 22, 3, 3, '#5a3815'); },
  desert(g){ V.circ(g, 23, 9, 5, '#ffe27a'); V.ell(g, 10, 26, 13, 7, '#d6a12a'); V.ell(g, 24, 27, 11, 5, '#d9c49a'); V.rect(g, 8, 10, 3, 14, '#4fbf45'); V.rect(g, 4, 14, 2, 5, '#4fbf45'); V.rect(g, 4, 18, 5, 2, '#4fbf45'); V.rect(g, 13, 12, 2, 5, '#4fbf45'); V.rect(g, 10, 16, 4, 2, '#4fbf45'); },
  storm(g){ cloud(g, '#5f6773', '#3a404a'); V.bolt(g, 15, 18, 1.4, '#ffe27a'); V.rect(g, 8, 24, 1, 4, '#9fd2ff'); V.rect(g, 25, 23, 1, 4, '#9fd2ff'); V.rect(g, 21, 27, 1, 4, '#9fd2ff'); },
  exclaim(g){ V.rr(g, 11, 2, 10, 19, 3, '#e8463a'); V.rect(g, 13, 4, 3, 13, '#ff9a8f'); V.rr(g, 11, 23, 10, 7, 2, '#e8463a'); },
  rocket(g){ V.poly(g, [[16, 1], [22, 9], [22, 22], [10, 22], [10, 9]], '#e8e8ee'); V.poly(g, [[16, 1], [22, 9], [10, 9]], '#e8463a'); V.circ(g, 16, 13, 3, '#3f8fe0'); V.poly(g, [[10, 15], [5, 23], [10, 22]], '#e8463a'); V.poly(g, [[22, 15], [27, 23], [22, 22]], '#e8463a'); V.poly(g, [[12, 22], [20, 22], [16, 31]], '#ff8a2a'); V.poly(g, [[14, 22], [18, 22], [16, 27]], '#ffe27a'); },
  gear(g){ for (let i = 0; i < 8; i++){ g.save(); g.translate(16, 16); g.rotate(i * Math.PI / 4); V.rect(g, -3, -15, 6, 7, '#9aa3ad'); g.restore(); } V.circ(g, 16, 16, 10, '#c3cbd6'); V.circ(g, 16, 16, 7, '#9aa3ad'); g.globalCompositeOperation = 'destination-out'; V.circ(g, 16, 16, 3.5, '#000'); g.globalCompositeOperation = 'source-over'; },
  save(g){ V.rr(g, 4, 4, 24, 24, 2, '#3f8fe0'); V.rect(g, 9, 4, 13, 9, '#d9dde4'); V.rect(g, 17, 5, 3, 6, '#1f5aa8'); V.rect(g, 8, 17, 16, 11, '#ffffff'); V.rect(g, 10, 20, 12, 1, '#9aa3ad'); V.rect(g, 10, 23, 12, 1, '#9aa3ad'); },
  bell(g){ V.poly(g, [[16, 3], [23, 8], [24, 20], [28, 24], [4, 24], [8, 20], [9, 8]], '#f2b705'); V.poly(g, [[16, 3], [11, 8], [10, 20], [7, 23], [12, 23], [13, 9]], '#ffe27a'); V.rect(g, 14, 1, 4, 3, '#b47d00'); V.circ(g, 16, 27, 3, '#b47d00'); },
  team(g){ const p = (x, c, s) => { V.circ(g, x, 10 * s + 1, 5 * s, '#f3c9a0'); V.rect(g, x - 5 * s, 6 * s - 1, 10 * s, 3 * s, '#2a1d14'); V.rr(g, x - 7 * s, 17 * s, 14 * s, 13, 3, c); }; p(22, '#e8463a', 0.9); p(11, '#3f8fe0', 1); },
  up(g){ V.poly(g, [[16, 2], [29, 15], [21, 15], [21, 29], [11, 29], [11, 15], [3, 15]], '#4fbf45'); V.poly(g, [[16, 2], [16, 29], [11, 29], [11, 15], [3, 15]], '#a6e36e'); },
  slot(g){ V.rr(g, 3, 6, 23, 23, 3, '#e8463a'); V.rect(g, 6, 11, 17, 10, '#ffffff'); [7, 13, 19].forEach(x => V.rect(g, x + 1, 13, 3, 6, '#f2b705')); V.rect(g, 13, 13, 3, 6, '#e8463a'); V.rect(g, 6, 23, 17, 3, '#a82418'); V.line(g, [[27, 20], [29, 20], [29, 6]], 2, '#7d8794'); V.circ(g, 29, 5, 2.5, '#e8463a'); V.rect(g, 6, 3, 17, 4, '#f2b705'); },
  medal(g){ V.poly(g, [[8, 2], [14, 2], [18, 14], [12, 14]], '#e8463a'); V.poly(g, [[18, 2], [24, 2], [20, 14], [14, 14]], '#3f8fe0'); V.circ(g, 16, 21, 9, '#f2b705'); V.circ(g, 16, 21, 6, '#ffe27a'); star5(g, 16, 21.5, 4.5, 2, '#d6a12a'); },
  pause(g){ V.rr(g, 7, 5, 7, 22, 1, '#ffffff'); V.rr(g, 18, 5, 7, 22, 1, '#ffffff'); V.rect(g, 11, 6, 3, 20, '#c3cbd6'); V.rect(g, 22, 6, 3, 20, '#c3cbd6'); },
  play(g){ V.poly(g, [[8, 4], [27, 16], [8, 28]], '#4fbf45'); V.poly(g, [[8, 4], [27, 16], [8, 16]], '#a6e36e'); },
  forbid(g){ V.circ(g, 16, 16, 13, '#e8463a'); g.globalCompositeOperation = 'destination-out'; V.circ(g, 16, 16, 9, '#000'); g.globalCompositeOperation = 'source-over'; V.line(g, [[8, 8], [24, 24]], 4, '#e8463a'); },
  skull(g){ V.rr(g, 6, 3, 20, 18, 8, '#f1f1f1'); V.rect(g, 10, 19, 12, 7, '#f1f1f1'); V.rect(g, 9, 10, 5, 5, '#1b1d26'); V.rect(g, 18, 10, 5, 5, '#1b1d26'); V.rect(g, 15, 16, 2, 3, '#1b1d26'); V.rect(g, 12, 23, 1, 3, '#9aa3ad'); V.rect(g, 16, 23, 1, 3, '#9aa3ad'); V.rect(g, 19, 23, 1, 3, '#9aa3ad'); },
  fist(g){ V.rr(g, 6, 8, 20, 17, 4, '#f3c9a0'); for (let i = 0; i < 4; i++) V.rect(g, 8 + i * 4.5, 8, 1, 7, '#c99a6e'); V.rect(g, 6, 15, 12, 2, '#c99a6e'); V.rect(g, 10, 25, 14, 5, '#e8463a'); V.line(g, [[2, 6], [5, 9]], 2, '#ffe27a'); V.line(g, [[29, 6], [26, 9]], 2, '#ffe27a'); },
  backpack(g){ V.rr(g, 6, 6, 20, 24, 5, '#e8463a'); V.rr(g, 10, 2, 12, 6, 3, '#a82418'); V.rr(g, 9, 16, 14, 10, 3, '#a82418'); V.rect(g, 15, 18, 2, 3, '#f2b705'); V.rect(g, 8, 9, 3, 6, '#ff9a8f'); },
};
/* emoji → icono (dibujado, del set de 16x16 o de las reliquias) */
const EMO_MAP = {
  '⚽':'ball', '⭐':'star', '🌟':'bigstar', '🔥':'flame', '🌀':'swirl', '⛰️':'mountain', '🪨':'rock', '🌿':'sprig', '🍃':'leaf', '🍂':'autumn', '🌱':'sprout',
  '🐉':'dragon', '🐲':'dragon', '✨':'sparkle', '⚪':'orb', '☄️':'comet', '💣':'bomb', '🎩':'tophat', '🔷':'gemBlue', '🔵':'gemBlue', '🟣':'gemPurple', '🟢':'gemGreen', '💎':'gemCyan',
  '🌪️':'tornado', '🌬️':'wind', '💫':'orbit', '🍀':'clover', '📓':'bookBlack', '📕':'bookRed', '📗':'bookGreen', '📙':'bookOrange',
  '⚔️':'swords', '🏃':'runner', '🦵':'leg', '🔋':'battery', '🤸':'flip', '😴':'zzz', '🥅':'goal', '🌙':'moon', '☀️':'sun', '🗿':'statue',
  '🔒':'lock', '⚠️':'warning', '👻':'ghost', '🧃':'juice', '🍌':'banana', '🏜️':'desert', '⛈️':'storm', '❗':'exclaim', '🚀':'rocket',
  '⚙️':'gear', '💾':'save', '🔔':'bell', '👥':'team', '⬆️':'up', '🎰':'slot', '🏅':'medal', '⏸':'pause', '⏸️':'pause', '☠️':'skull', '👊':'fist', '🎒':'backpack',
  // del set arcade 16x16
  '🎟️':'px:ticket', '🛡️':'px:coraza', '❤️':'px:vitalidad', '👟':'px:zancada', '🧲':'px:iman', '📘':'px:sabiduria', '🔄':'px:cambio', '🚫':'forbid',
  '▶️':'play', '🥊':'px:fuerza', '⏱️':'px:reflejos', '💰':'px:fortuna', '⚡':'px:bolt', '💥':'px:boom', '💨':'dash', '🎯':'px:range',
  '🍙':'item:rice', '💧':'item:water', '🥛':'item:nectar', '📣':'item:whistle', '🧰':'chest:chest',
  // reliquias
  '🥾':'relic:botasInazuma', '📿':'relic:amuleto', '🔗':'relic:pulsera', '🎖️':'relic:chapa', '🥽':'relic:gafas', '🍢':'relic:pinchito', '🧪':'relic:nectarDioses',
  '🏺':'relic:artefacto', '📜':'relic:tecnica', '🦅':'relic:botasHalcon', '🎗️':'relic:cintaMark', '🧿':'relic:balonAlius', '🧤':'relic:guantes', '👕':'relic:camiseta',
};
const EMO_CANVAS = {}, EMO_URL = {};
function emoKey(e){ return e.replace(/️/g, ''); }
const EMO_LOOKUP = {};
for (const e in EMO_MAP) EMO_LOOKUP[emoKey(e)] = EMO_MAP[e];
function emoSprite(e){
  const id = EMO_LOOKUP[emoKey(e)]; if (!id) return null;
  if (EMO_CANVAS[id] !== undefined) return EMO_CANVAS[id];
  let cv = null;
  try {
    const [kind, name] = id.includes(':') ? id.split(':') : ['draw', id];
    if (kind === 'draw') cv = vecSprite(EMO_DRAW[name]);
    else if (kind === 'px') cv = PX_ICONS[name] || null;
    else if (kind === 'item') cv = ITEM_SPRITES[name] || null;
    else if (kind === 'relic') cv = PX_ICONS['r_' + name] || (RELIC_DRAW[name] ? vecSprite(RELIC_DRAW[name]) : null);
    else if (kind === 'chest') cv = CHEST_SPRITE;
  } catch (err) { cv = null; }
  EMO_CANVAS[id] = cv;
  return cv;
}
function emoURL(e){
  const id = EMO_LOOKUP[emoKey(e)]; if (!id) return '';
  if (EMO_URL[id] === undefined){ const cv = emoSprite(e); try { EMO_URL[id] = cv ? cv.toDataURL() : ''; } catch (err) { EMO_URL[id] = ''; } }
  return EMO_URL[id];
}
/* <img> arcade de un emoji (para meterlo en HTML a mano) */
function emoImg(e, size){ const u = emoURL(e); return u ? `<img class="px-emo" src="${u}" alt=""${size ? ` width="${size}" height="${size}" style="width:${size}px;height:${size}px"` : ''}>` : e; }
const EMO_RE = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}]️?(?:‍[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]️?)*)/gu;
function hasIconEmoji(t){ if (typeof t !== 'string' || !t) return false; EMO_RE.lastIndex = 0; let m; while ((m = EMO_RE.exec(t))) if (EMO_LOOKUP[emoKey(m[0])]) return true; return false; }
function splitEmo(t){
  const out = []; let last = 0, m; EMO_RE.lastIndex = 0;
  while ((m = EMO_RE.exec(t))){
    if (!EMO_LOOKUP[emoKey(m[0])]) continue;
    if (m.index > last) out.push({ t: t.slice(last, m.index) });
    out.push({ e: m[0] }); last = m.index + m[0].length;
  }
  if (last < t.length) out.push({ t: t.slice(last) });
  return out;
}
/* ---- canvas: fillText / strokeText / measureText dibujan el icono en vez del emoji ----
   ctx.rawEmoji = true deja los emojis tal cual (personajes y rivales) */
(function patchCanvasEmoji(){
  const P = CanvasRenderingContext2D.prototype, oFill = P.fillText, oStroke = P.strokeText, oMeasure = P.measureText;
  const fs = ctx => { const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font); return m ? +m[1] : 10; };
  const layout = (ctx, text) => {
    const size = fs(ctx), em = Math.round(size * 1.15), parts = splitEmo(text);
    let w = 0; for (const p of parts){ p.w = p.e ? em + 2 : oMeasure.call(ctx, p.t).width; w += p.w; }
    return { parts, w, em, size };
  };
  const draw = (ctx, text, x, y, stroke) => {
    const L = layout(ctx, text), al = ctx.textAlign, bl = ctx.textBaseline;
    let cx = (al === 'center') ? x - L.w / 2 : (al === 'right' || al === 'end') ? x - L.w : x;
    const top = bl === 'middle' ? y - L.em / 2 : (bl === 'top' || bl === 'hanging') ? y : bl === 'bottom' || bl === 'ideographic' ? y - L.em : y - L.size * 0.9;
    ctx.textAlign = 'left';
    const sm = ctx.imageSmoothingEnabled;
    for (const p of L.parts){
      if (p.e){
        if (!stroke){ const cv = emoSprite(p.e); if (cv){ ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, Math.round(cx + 1), Math.round(top), L.em, L.em); ctx.imageSmoothingEnabled = sm; } }
      } else (stroke ? oStroke : oFill).call(ctx, p.t, cx, y);
      cx += p.w;
    }
    ctx.textAlign = al;
  };
  P.fillText = function(text, x, y, maxW){ if (this.rawEmoji || !hasIconEmoji(text)) return maxW === undefined ? oFill.call(this, text, x, y) : oFill.call(this, text, x, y, maxW); draw(this, text, x, y, false); };
  P.strokeText = function(text, x, y, maxW){ if (this.rawEmoji || !hasIconEmoji(text)) return maxW === undefined ? oStroke.call(this, text, x, y) : oStroke.call(this, text, x, y, maxW); draw(this, text, x, y, true); };
  P.measureText = function(text){
    const m = oMeasure.call(this, text);
    if (this.rawEmoji || !hasIconEmoji(text)) return m;
    const w = layout(this, text).w;
    return { width: w, actualBoundingBoxLeft: m.actualBoundingBoxLeft, actualBoundingBoxRight: w, actualBoundingBoxAscent: m.actualBoundingBoxAscent, actualBoundingBoxDescent: m.actualBoundingBoxDescent, fontBoundingBoxAscent: m.fontBoundingBoxAscent, fontBoundingBoxDescent: m.fontBoundingBoxDescent };
  };
})();
/* ---- HTML: cualquier texto con emoji que entre en la página se cambia por su icono ----
   (los huecos de personajes llevan la clase keep-emo y se dejan como están) */
const EMO_KEEP_SEL = '.keep-emo, .char-emoji, #showcase-emoji, #hud-portrait, #sp-portrait, .field-critter, script, style, textarea, option, title';
function iconifyNode(root){
  if (!root) return;
  if (root.nodeType === 3){ iconifyText(root); return; }
  if (root.nodeType !== 1 || (root.closest && root.closest(EMO_KEEP_SEL))) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
  let n; while ((n = w.nextNode())) if (hasIconEmoji(n.nodeValue)) list.push(n);
  list.forEach(iconifyText);
}
function iconifyText(node){
  const par = node.parentNode;
  if (!par || !hasIconEmoji(node.nodeValue) || (par.closest && par.closest(EMO_KEEP_SEL))) return;
  const frag = document.createDocumentFragment();
  for (const p of splitEmo(node.nodeValue)){
    if (p.t !== undefined){ frag.appendChild(document.createTextNode(p.t)); continue; }
    const u = emoURL(p.e);
    if (!u){ frag.appendChild(document.createTextNode(p.e)); continue; }
    const im = document.createElement('img'); im.className = 'px-emo'; im.src = u; im.alt = ''; im.draggable = false;
    frag.appendChild(im);
  }
  par.replaceChild(frag, node);
}
/* iconos del menú principal y la barra de arriba: a 16x16 (píxel gordo, como los de Mejoras) */
const MENU_ICON_DRAW = { '📖':'book', '🎴':'packs', '⚽':'ball', '👥':'team', '⬆️':'up', '🎰':'slot', '🏅':'medal', '⚙️':'gear', '💾':'save', '🔔':'bell' };
function menuIconURL(name){
  try {
    if (name === 'gear') return MENU_GEAR().toDataURL();
    if (PX_ICON_URL['m_' + name]) return PX_ICON_URL['m_' + name];
  } catch (err) {}
  return loresIconURL(name);
}
function loresIconURL(name){ try { return vecSprite(g => { g.scale(0.5, 0.5); EMO_DRAW[name](g); }, 16).toDataURL(); } catch (err) { return ''; } }
try {
  document.querySelectorAll('.menu-ico, .icon-btn').forEach(el => {
    const name = MENU_ICON_DRAW[el.textContent.trim()]; const u = name && menuIconURL(name);
    if (u) el.innerHTML = `<img class="px-ico" src="${u}" alt="">`;
  });
} catch (err) {}
try {
  iconifyNode(document.body);
  new MutationObserver(muts => {
    for (const m of muts){
      if (m.type === 'characterData') iconifyText(m.target);
      else m.addedNodes.forEach(iconifyNode);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
} catch (err) {}
/* ---- iconos de afinidad: hexágono con borde plateado y símbolo blanco (estilo Inazuma) ---- */
const EL_ICON = {
  air:      { a:'#7fd0ff', b:'#1f6fd1', glyph:'<path d="M9 13.5c3.5-3 9-3 11.5-.5 1.6 1.6.6 4-1.6 4-1.5 0-2.2-1.4-1.2-2.3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M8 18.5h11.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M11 22.5h7.5c1.6 0 2.4 1.9 1.1 2.9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>' },
  mountain: { a:'#f0b066', b:'#8a4f1e', glyph:'<path d="M6.5 23.5 13 12l3.6 6.2 2.6-3.7 6.3 9z" fill="#fff"/><path d="M11.2 15.2 13 12l1.8 3.2-1.8 1.2z" fill="#c9783a"/>' },
  fire:     { a:'#ff8a5c', b:'#c41e1e', glyph:'<path d="M16 6.5c1 4 5.5 6 5.5 11.2A5.5 5.5 0 0 1 16 23.3a5.5 5.5 0 0 1-5.5-5.6c0-2.6 1.4-4.2 2.6-5.4.2 1.8.9 3 2 3.6-.6-3.6.2-6.6.9-9.4z" fill="#fff"/><path d="M16 15.3c.9 1.6 2.4 2.4 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2 1.4-2.6.2.7.5 1 1 1.2-.3-1-.2-2 0-2.9z" fill="#ff6b3c"/>' },
  dragon:   { a:'#6f8bff', b:'#1d2b8a', glyph:'<path d="M8 22c2-7 6-11 13-12l-3 3 5 0-4 3 4 1c-4 1-7 3-9 7z" fill="#fff"/><circle cx="18.5" cy="13" r="1.2" fill="#3a2a8a"/><path d="M7 23l3-1" stroke="#c9a8ff" stroke-width="1.6" stroke-linecap="round"/>' },
  celestial:{ a:'#fff2a0', b:'#d8a81a', glyph:'<path d="M16 6l2.4 6.6L25 13l-5.4 3.8L21.6 24 16 19.8 10.4 24l2-7.2L7 13l6.6-.4z" fill="#fff"/><circle cx="16" cy="15" r="2" fill="#ffe680"/>' },
  forest:   { a:'#86e06a', b:'#2c8a2a', glyph:'<path d="M9 23C8.5 14 15 8.5 23.5 8.5 23.5 17 18 23.5 9 23z" fill="#fff"/><path d="M10 22 19.5 12.5" stroke="#3a9a34" stroke-width="1.8" stroke-linecap="round"/><path d="M14.4 17.6 14 14.2M16.8 15.2l3.2.3" stroke="#3a9a34" stroke-width="1.4" stroke-linecap="round"/>' },
};
const _elIconCache = {};
let _elIconUid = 0;
function elIconSvg(key){
  const I = EL_ICON[key];
  if (!I) return '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="12" fill="#eafff3" stroke="#1b2333" stroke-width="2"/></svg>';
  const u = key + (++_elIconUid);                         // ids únicos: si se repiten, el degradado falla
  const hex = (r) => { const pts = []; for (let k = 0; k < 6; k++){ const a = Math.PI / 6 + k * Math.PI / 3; pts.push((16 + r * Math.cos(a)).toFixed(2) + ',' + (16 + r * Math.sin(a)).toFixed(2)); } return pts.join(' '); };
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${I.a}"/><stop offset="1" stop-color="${I.b}"/></linearGradient>` +
    `<linearGradient id="s${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9c3cf"/><stop offset="1" stop-color="#6d7a8a"/></linearGradient></defs>` +
    `<polygon points="${hex(15.2)}" fill="#141c2b"/>` +
    `<polygon points="${hex(13.9)}" fill="url(#s${u})"/>` +
    `<polygon points="${hex(11.6)}" fill="url(#g${u})" stroke="#141c2b" stroke-width="0.8"/>` +
    `<g transform="translate(16 16) scale(0.78) translate(-16 -16)">${I.glyph}</g></svg>`;
}
/* icono para meter en HTML */
function elIcon(key, size = 18){
  return `<span class="el-ico" style="width:${size}px;height:${size}px">${elIconSvg(key)}</span>`;
}
/* icono + nombre de la afinidad */
function elLabel(key, size = 18){ return `${elIcon(key, size)} ${getElement(key).name}`; }
/* imagen para dibujar en el canvas */
function elIconImg(key){
  const k = EL_ICON[key] ? key : 'neutral';
  let c = _elIconCache[k];
  if (!c){
    c = _elIconCache[k] = { ready:false, cv:document.createElement('canvas') };
    c.cv.width = c.cv.height = 64;                        // se rasteriza una vez para dibujarlo rápido
    const img = new Image();
    img.onload = () => { c.cv.getContext('2d').drawImage(img, 0, 0, 64, 64); c.ready = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(elIconSvg(key));
  }
  return c;
}
function drawElIcon(key, x, y, size){
  const c = elIconImg(key);
  if (c.ready) ctx.drawImage(c.cv, x, y, size, size);
}
/* multiplicador de daño de un atacante contra un defensor */
function elementMult(atk, def){
  if (!ELEMENTS[atk] || !ELEMENTS[def]) return 1;
  if (ELEMENTS[atk].beats.includes(def)) return ELEMENT_ADV;
  if (ELEMENTS[def].beats.includes(atk)) return ELEMENT_DIS;
  return 1;
}


/* ======================================================================
   SUPERTÉCNICAS
   Hay 4 tipos (las filas de la tabla) y cada arquetipo les pone su nombre:
     pierce → disparo penetrante y más balones
     orbit  → balones que giran a tu alrededor
     bounce → disparos que rebotan entre rivales cercanos
     rain   → proyectiles que caen del cielo y explotan en área
   Reglas en partida:
   - Solo puedes tener 2 supertécnicas (la 1.ª va a la Q, la 2.ª a la E).
   - Solo una está en uso a la vez: Q / E cambian cuál estás usando.
   - Al superar el Nv. 3 evoluciona (cambia de nombre) y desbloquea su
     técnica definitiva (R), que se carga mientras esa supertécnica está en uso.
     La R siempre lanza la definitiva de la supertécnica que estás usando.
   ====================================================================== */
const TECH_MAX = 10;         // nivel máximo de una supertécnica (evoluciona y desbloquea la R en el Nv. 5)
const EVOLVE_AT = 5;         // nivel en el que evoluciona y desbloquea la R
const CHARGE_MAX = 100;      // carga necesaria para la técnica definitiva
const SLOT_KEYS = ['Q', 'E'];
/* La definitiva NO se carga con el tiempo: cada golpe que da esa supertécnica
   suma esta carga (cada nivel por encima de la evolución carga un 20% más) */
const CHARGE_PER_HIT = { pierce:0.62, orbit:0.8, bounce:0.48, rain:1.0, melee:0.4 };


/* ======================================================================
   OBJETOS QUE SUELTAN LOS RIVALES
   Al eliminar a un rival hay una pequeña probabilidad de que suelte uno.
   ====================================================================== */
const DROP_CHANCE = 0.012;      // 1,2 % por rival eliminado (leche, agua, arroz...)
const COIN_DROP_CHANCE = 0.26; // 26 % (hay menos rivales): probabilidad de que un rival normal suelte su moneda
const TICKET_DROP = 0.0015;     // 0,15 %: ticket amarillo de un rival normal
const TICKET_DROP_EPIC = 0.0001; // 0,01 %: ticket morado de un rival normal (rarísimo)
/* tickets que sueltan los bosses y mini bosses: [amarillo, morado] */
const TICKET_BOSS = [0.25, 0.06], TICKET_MINIBOSS = [0.2, 0.02];
const KAPPAH_EPIC = 0.10;         // si Kappah suelta ticket, un 10% es morado
function dropTicket(x, y, purple){ match.gems.push({ x, y, xp:0, coin:0, ticket:1, purple: !!purple, kind:'ticket', pull:true }); }
/* boss vencido: siempre 1 ticket amarillo y, encima, una tirada extra (25% otro amarillo · 6% uno morado) */
function bossTickets(x, y){ dropTicket(x, y, false); rollTicket(x + 24, y + 10, TICKET_BOSS); }
function rollTicket(x, y, [pY, pP]){ const r = Math.random(); if (r < pP) dropTicket(x, y, true); else if (r < pP + pY) dropTicket(x, y, false); }
const ITEM_LIFE = 25;           // segundos que dura en el suelo antes de desaparecer
const ITEMS = {
  water:   { emoji:'💧', name:'Agua isotónica', weight:20, color:'#5ec8f2', dur:8,
             text:'¡Velocidad!' },                     // +40% velocidad de movimiento
  nectar:  { emoji:'🥛', name:'Leche',          weight:18, color:'#ff7a2e', dur:10,
             text:'¡Furia!' },                         // +50% daño, +45% vel. de ataque, +30% vel. de movimiento
  whistle: { emoji:'📣', name:'Silbato',        weight:10, color:'#eafff3',
             text:'¡Toda la experiencia!' },           // atrae todas las gemas del campo
  rice:    { emoji:'🍙', name:'Bola de arroz',  weight:52, color:'#8be28f',
             text:'+Vida' },                           // cura al instante
  bomb:    { emoji:'💣', name:'Bomba',          weight:15, color:'#ff8a3a',
             text:'¡Bomba!' },                         // explota al cogerla: daño en un área grande
};
const BOMB = { r: 280, kill: 2.5, bossPct: 0.06, dmgMul: 10 };   // radio · vida de un rival normal que quita · % de vida de un boss · o 10× tu daño (lo que sea más)
const WATER_SPEED = 1.4;
const NECTAR_ATK = 1.45;
const NECTAR_DMG = 1.5;
const NECTAR_SPEED = 1.3;

const TECH_ORDER = ['pierce', 'orbit', 'bounce', 'rain', 'melee', 'nbShoot', 'nbDribble', 'nbSpeed'];
const TECH_KINDS = {
  pierce: { icon:'🌪️',
    desc: l => l === 1 ? 'Tu balón atraviesa a los rivales y hace +10% de daño'
             : l === 2 ? '¡Disparas 3 balones a la vez y +12% de daño!'
                       : '+12% de daño de los balones' + (l % 2 === 0 ? ', +1 balón' : ''),
    ultDesc: 'Balones más grandes y +15% de daño. Técnica definitiva (R): una bocanada de decenas de balones que lo atraviesan todo' },
  orbit:  { icon:'💫',
    desc: l => l === 1 ? '3 balones giran a tu alrededor y dañan a los rivales cercanos'
                       : '+18% de daño y más radio' + (l % 2 === 1 ? ', +1 balón' : ''),
    ultDesc: 'Técnica definitiva (R): durante 7 s el doble de balones y un anillo exterior que gira al revés, mucho más rápidos y con más daño' },
  bounce: { icon:'⚡',
    desc: l => l === 1 ? 'Tus disparos rebotan entre 2 rivales cercanos'
                       : '+7% de daño' + (l % 2 === 1 ? ', +1 rebote' : ''),
    ultDesc: 'Técnica definitiva (R): un balón gigante que rebota entre 10 rivales y deja el suelo ardiendo donde golpea' },
  rain:   { icon:'☄️',
    desc: l => l === 1 ? 'Caen 2 proyectiles del cielo que explotan en área'
                       : 'Más daño, más área y recarga más rápida' + (l % 2 === 1 ? ', +1 proyectil' : ''),
    ultDesc: 'Técnica definitiva (R): una lluvia de impactos que dibuja un triángulo y remata con una gran explosión en el centro' },
  melee:  { icon:'👊',
    desc: l => l === 1 ? 'Golpeas a ráfagas de cerca a los rivales hacia donde miras'
             : l === 3 ? '+8% de daño y la ráfaga golpea también hacia atrás'
             : l === 6 ? '+8% de daño y la ráfaga golpea también a los lados'
             : '+8% de daño, más alcance y ráfagas más seguidas',
    ultDesc: 'Golpes más amplios, ráfaga doble y +15% de daño. Técnica definitiva (R): un torbellino de golpes en todas direcciones' },
  // Cuadernos: supertécnicas de apoyo, sin afinidad y sin técnica definitiva (R).
  // Mientras la usas, cada pocos segundos te da una mejora temporal. Pensadas para fusionar con Hillman.
  nbShoot:   { icon:'📕', buff:true, names:['Cuaderno de Tiro', 'Cuaderno de Tiro'], color:'#ff6b5e', label:'Tiro',
               desc: l => `Sola: no atacas mientras se carga (${nbCd(l)} s). Al cambiar de supertécnica: +${nbPow('nbShoot', l)}% de daño durante lo que hayas cargado (hasta ${nbCd(l)} s). Fusionada: +${nbPow('nbShoot', l)}% permanente`, ultDesc:'Sin técnica definitiva' },
  nbDribble: { icon:'📗', buff:true, names:['Cuaderno de Regate', 'Cuaderno de Regate'], color:'#5ec8f2', label:'Regate',
               desc: l => `Sola: no atacas mientras se carga (${nbCd(l)} s). Al cambiar de supertécnica: +${nbPow('nbDribble', l)}% de esquivar ataques durante lo que hayas cargado (hasta ${nbCd(l)} s). Fusionada: +${nbPow('nbDribble', l)}% permanente`, ultDesc:'Sin técnica definitiva' },
  nbSpeed:   { icon:'📙', buff:true, names:['Cuaderno de Velocidad', 'Cuaderno de Velocidad'], color:'#62c96c', label:'Velocidad',
               desc: l => `Sola: no atacas y, mientras se carga (${nbCd(l)} s), tu velocidad sube hasta +${nbPow('nbSpeed', l)}%. Al cambiar de supertécnica: +${nbPow('nbSpeed', l)}% de velocidad durante lo que hayas cargado (hasta ${nbCd(l)} s). Fusionada: +${nbPow('nbSpeed', l)}% permanente`, ultDesc:'Sin técnica definitiva' },
};
/* cuadernos: potencia [base, por nivel], recarga y duración del efecto */
const NOTEBOOK_TECHS = { nbShoot:[25, 8], nbDribble:[15, 4], nbSpeed:[25, 6] };
function nbPow(kind, l){ const [b, p] = NOTEBOOK_TECHS[kind]; return b + p * (l - 1); }
function nbCd(l){ return +Math.max(1.5, 4 - 0.35 * (l - 1)).toFixed(1); }   // segundos de carga: 4 s en Nv. 1 → 1.5 s en Nv. 9
function nbDur(l){ return +(3 + 0.3 * (l - 1)).toFixed(1); }
function isBuffKind(kind){ return !!(TECH_KINDS[kind] && TECH_KINDS[kind].buff); }

/* [nombre base, nombre evolucionado] por arquetipo */
const TECH_NAMES = {
  fire: {
    pierce: ['Tornado de fuego',  'Fénix'],
    orbit:  ['Corte flamígero',   'Potenciación'],
    bounce: ['Ataque meteorito',  'Pájaro de fuego'],
    rain:   ['Chut granada',      'Triángulo Z'],
    melee:  ['Despeje de fuego',  'Despeje explosivo'],
  },
  air: {
    pierce: ['Tornado inverso',   'Super relámpago'],
    orbit:  ['Entrada huracán',   'Entrada tormenta'],
    bounce: ['Zig zag chispeante','Ruptura relámpago'],
    rain:   ['Tiro del cometa',   'Flecha huracán'],
    melee:  ['Ataque afilado',    'Muralla tsunami'],
  },
  forest: {
    pierce: ['Tiro fantasma',     'Tornado oscuro'],
    orbit:  ['Espejismo de balón','Pingüino emperador Nº2'],
    bounce: ['Chut de los 100 toques', 'Remate múltiple'],
    rain:   ['Truco de magia',    'Triángulo letal'],
    melee:  ['Barrido defensivo', 'Vendimia'],
  },
  mountain: {
    pierce: ['Bola de fango',     'Mega terremoto'],
    orbit:  ['Sismo',             'Muralla infinita'],
    bounce: ['Remate serpiente',  'Disparo con rebotes'],
    rain:   ['Regate topo',       'Pisotón de sumo'],
    melee:  ['Cabezazo kung fu',  'Trama'],
  },
  dragon: {
    pierce: ['Tornado dragón',    'Remate combinado'],
    orbit:  ['Remate espiral',    'Torbellino dragón'],
    bounce: ['Tiro chispadraco',  'Remate dragón'],
    rain:   ['Niebla venenosa',   'Gravedad'],
    melee:  ['Garra salvaje',     'Muralla gigante'],
  },
  celestial: {
    pierce: ['Mano celestial',    'Mano mágica'],
    orbit:  ['Campo de fuerza',   'Hora celestial'],
    bounce: ['Tiro cegador',      'Flecha divina'],
    rain:   ['Rapto divino',      'Sabiduría divina'],
    melee:  ['Escudo de fuerza',  'Escudo de fuerza total'],
  },
};
const NEUTRAL_TECH_NAMES = {
  pierce: ['Disparo penetrante', 'Disparo definitivo'],
  orbit:  ['Balones orbitales',  'Órbita suprema'],
  bounce: ['Disparo rebotador',  'Cadena total'],
  rain:   ['Lluvia de balones',  'Diluvio de balones'],
  melee:  ['Golpe cercano',      'Ráfaga total'],
};


/* ======================================================================
   CUADERNO DE TALENTOS (pasivas)
   Cada boss suelta un cuaderno antes de volver al campo grande.
   - Con menos de 2 talentos: eliges 1 de 3 (o rechazas el cuaderno).
   - Con 2 talentos: el cuaderno sube de nivel los dos.
   - Los talentos que tienes también salen como mejoras al subir de nivel.
   "lowHp" = por debajo de este % de vida se activan los talentos de poca vida.
   ====================================================================== */
const TALENT_MAX = 10;
/* como las supertécnicas: 10 niveles y cada nivel suma lo mismo (efecto = valor × nivel), sin saltos */
function talentE(l){ return l; }
const isTalentMilestone = () => false;
/* descripción con el valor real de ese nivel (redondeado) */
function talentDesc(key, l){ return TALENTS[key].desc(l).replace(/(\d+\.\d{2,})/g, m => (+m).toFixed(1)).replace(/(\d)\.(\d)/g, '$1,$2'); }
const TALENT_SLOTS = 2;
const LOW_HP = 0.4;
/* lo que suma cada nivel de cada talento (en %) */
const TALENT_VAL = { ahorro:7.5, ataque:10, defensa:15, rapidez:5, portero:3, aMuerte:12, ultra:20, tiro:20, lance:4,
  fuerzaDef:8, cargaElem:10, antiAfin:12, piscinazo:4, vagueza:8, suerte:6, vamos:0.8, vamosTodos:1.5 };
const TV = (k, l) => +(TALENT_VAL[k] * l).toFixed(1);
const TALENTS = {
  ahorro:      { emoji:'💰', name:'Ahorro',           desc: l => `La R necesita un ${TV('ahorro', l)}% menos de carga` },
  ataque:      { emoji:'⚔️', name:'Ataque+',          desc: l => `+${TV('ataque', l)}% de daño` },
  defensa:     { emoji:'🛡️', name:'Defensa+',         desc: l => `+${TV('defensa', l)}% de vida máxima` },
  rapidez:     { emoji:'🏃', name:'Rapidez+',         desc: l => `+${TV('rapidez', l)}% de velocidad de movimiento` },
  portero:     { emoji:'🧤', name:'Portero+',         desc: l => `+${TV('portero', l)}% de probabilidad de evadir ataques` },
  aMuerte:     { emoji:'☠️', name:'Siempre a muerte', desc: l => `Hasta +${TV('aMuerte', l)}% de daño cuanta menos vida te quede` },
  ultra:       { emoji:'🌟', name:'Ultratécnica',     desc: l => `Las técnicas definitivas (R) hacen +${TV('ultra', l)}% de daño` },
  tiro:        { emoji:'💥', name:'Tiro+',            desc: l => `+${TV('tiro', l)}% de daño de los críticos` },
  lance:       { emoji:'🎯', name:'Lance crítico',    desc: l => `+${TV('lance', l)}% de probabilidad de crítico` },
  fuerzaDef:   { emoji:'🦵', name:'Fuerza defensiva', desc: l => `Con poca vida (menos del ${LOW_HP * 100}%): +${TV('fuerzaDef', l)}% de velocidad de movimiento` },
  cargaElem:   { emoji:'🔋', name:'Carga elemental',  desc: l => `+${TV('cargaElem', l)}% de daño a los rivales contra los que tienes ventaja de afinidad` },
  antiAfin:    { emoji:'🔄', name:'Anti afinidades',  desc: l => `+${TV('antiAfin', l)}% de daño a los rivales que tienen ventaja contra ti` },
  piscinazo:   { emoji:'🤸', name:'Piscinazo',        desc: l => `Con poca vida (menos del ${LOW_HP * 100}%): +${TV('piscinazo', l)}% de probabilidad de evadir ataques` },
  vagueza:     { emoji:'😴', name:'Vagueza',          desc: l => `+${TV('vagueza', l)}% de experiencia` },
  suerte:      { emoji:'🍀', name:'Suerte',           desc: l => `${TV('suerte', l)}% de probabilidad de subir 2 niveles de golpe` },
  vamos:       { emoji:'⏱️', name:'¡Vamos!',          desc: l => `Cuanta más velocidad de movimiento tengas, más daño: +${TV('vamos', l)}% de daño por cada +10% de velocidad de movimiento (hasta +150%)` },
  vamosTodos:  { emoji:'👥', name:'¡Vamos todos!',    desc: l => `+${TV('vamosTodos', l)}% a TODO: daño, vida, velocidad, velocidad de ataque, defensa, crítico, regate y experiencia` },
};
/* ¡Vamos!: daño extra según cuánto has subido la velocidad de MOVIMIENTO (respecto a la de tu jugador) */
function vamosMult(){
  const v = tval('vamos'); if (!v) return 1;
  const base = (match.base && match.base.speed) || 1, now = moveSpeedNow();
  return 1 + Math.min(1.5, Math.max(0, (now / base - 1) * 10 * v));
}
/* velocidad de movimiento real ahora mismo (con agua, néctar, talentos, cuadernos, balones, R de órbita…) */
function moveSpeedNow(){
  return match.speed * (buffActive('water') ? WATER_SPEED : 1) * (buffActive('nectar') ? NECTAR_SPEED : 1) * talentSpeedMult() * (inHoraCelestial() ? 1 - BYRON.slow : 1) * (pbActive('blue') ? PBALL.blue.mult : 1) * (orbitBoosted() ? ORBIT_ULT_SPEED : 1);
}
/* ¡Vamos todos!: un poco de todo */
function allK(){ return 1 + tval('vamosTodos'); }

/* ======================================================================
   ÁRBITRO Y BOSSES
   A partir del minuto 2 aparece un árbitro en un punto aleatorio del campo.
   Al tocarlo pita y sale el siguiente boss, en orden cronológico de la serie.
   Cada boss solo puede salir a partir de su minuto ("minute"); tras vencerlo,
   el árbitro vuelve a aparecer en un momento aleatorio.
   Ataques disponibles: aimed3, aimed5, burst, ring, bigring, spiral
   color = color del equipo: tiñe el campo del duelo contra ese boss
   ====================================================================== */
const MATCH_LENGTH = 25 * 60;     // a los 25:00 del reloj de partido llega el duelo final (Byron, pendiente): por ahora ahí acaba el partido
const MELEE_DMG = 1;
const REFEREE_WAIT = 60;           // segundos para tocar al árbitro (bosses 1 a 8): si no, pita el final y pierdes
/* reloj del partido: no corre durante el duelo contra el boss */
/* reloj de partido: solo corre en la fase normal. Se para en cuanto sale el árbitro y durante los duelos
   (oleadas, clima, cofres, Willy, Kappah y la llegada de bosses usan este reloj) */
function matchClock(){ return match ? (match.clockT || 0) : 0; }
function clockRunning(){ return (!match.inArena || !!match.mark) && !match.referee; }   // contra Mark el reloj cuenta (récord)
/* duelos sin límite de tiempo: pasados 120 s el boss se enfurece y ataca un 10% más rápido cada 15 s */
const BOSS_FURY = { after: 120, every: 15, step: 0.10 };
function duelTime(){ return match.inArena ? match.elapsed - (match.arenaStart ?? match.elapsed) : 0; }
function bossFury(){ const t = duelTime() - BOSS_FURY.after; return t < 0 ? 1 : 1 + BOSS_FURY.step * (1 + Math.floor(t / BOSS_FURY.every)); }
function bossAlive(){ return !!((match.boss && !match.boss.dead) || (match.bossGroup || []).some(b => !b.dead)); }
const BOSSES = [
  // special = lo que hace único a cada boss (ver updateBossSpecial)
  { name:'Talisman', team:'Occult',   color:'#7b3fbf', element:'forest',   emoji:'🔮', minute:2,    attacks:['aimed3'],          special:'dark',     attackEvery:3.4 },
  { name:'Chicken',  team:'Wild',     color:'#e07b2a', element:'fire',     emoji:'🐔', minute:4.5,  attacks:['burst'],           special:'charge' },
  { name:'Feldt',    team:'Brain',    color:'#3fb8c9', element:'forest',   emoji:'🧠', minute:7,    attacks:[],                  special:'fists' },
  { name:'Artist',   team:'Otaku',    color:'#e45fa8', element:'air',      emoji:'🎨', minute:9.5,  attacks:['aimed5', 'burst'], special:'shield' },
  { name:'Jude',     team:'Royal',    color:'#3b4fa8', element:'air',      emoji:'👑', minute:12,   attacks:['spiral'],          special:'royal',    hpMult:0.85 },
  { name:'Cloak',    team:'Shuriken', color:'#5f6575', element:'fire',     emoji:'🥷', minute:14.5, attacks:['spiral', 'aimed3'], special:'teleport' },
  { name:'Greeny',   team:'Farm',     color:'#8aa62e', element:'fire', emoji:'🚜', minute:17,   attacks:[],                  special:'walters' },
  // los tres hermanos a la vez en la misma arena; cada uno dispara según su afinidad
  { name:'Hermanos Murdock', team:'Kirkwood', color:'#2f7fd6', element:'air', emoji:'😠', minute:19.5, special:'murdock', group:[
      { name:'Thomas Murdock', element:'air',      emoji:'😠', attacks:[] },   // solo disparos básicos de su afinidad
      { name:'Tyler Murdock',  element:'mountain', emoji:'😤', attacks:[] },
      { name:'Marvin Murdock', element:'fire',     emoji:'😡', attacks:[] },
  ] },
  // Boss final de fase (min 25): Aphrodite (Byron Love, Zeus) — quieto en el centro, 3 torres de poder y Hora celestial
  { name:'Aphrodite', team:'Zeus', color:'#f4e9b8', element:'celestial', emoji:'👼', minute:25, attacks:[], special:'byron', final:true },
];

/* ---------------------- DATOS: PLANTILLA DE FICHAJES ----------------------
   Opcional: un personaje puede tener nombres propios para sus supertécnicas:
     techNames:{ pierce:['Nombre base','Nombre evolucionado'], ... } */
/* Los jugadores salen de players.js (generado desde dbinazuma.xlsx): cada uno tiene
   id, equipo (team), posición, afinidad, rareza, cara (face) y sus estadísticas iniciales. */
const CHARACTERS = PLAYERS;
/* CROMÁTICOS: mismas estadísticas, otro aspecto (cara y sprite recoloreados en assets/shiny/) */
const SHINY_IDS = ["ie8d", "iebb", "ieba", "ie0a", "iebe", "ie1f", "ie443", "ie57", "ie3e", "ie03", "ie31", "ie1b", "iebd", "ie15", "ie10d", "ie449", "ie0b", "iee5", "iea2", "ie01", "ie6e", "iea9", "ie09", "ie79", "ie29", "ie02", "ie5b", "ieb5", "ie83", "ie65", "ief9", "ie105", "ie44a", "ie51", "ieaa", "ieab", "iebc"];
const SHINY = Object.fromEntries(SHINY_IDS.map(id => [id, { face:`assets/shiny/${id}_cara.png`, sprite:`assets/shiny/${id}_sprites.png` }]));
function hasShiny(id){ return state.shiny.includes(id); }
function shinyOn(id){ return hasShiny(id) && !!state.shinyOn[id]; }
/* aspecto con el que se ve un jugador (normal o cromático) */
function lookOf(c, forceShiny){
  const on = forceShiny ?? (c && shinyOn(c.id));
  return on && c && SHINY[c.id] ? { ...c, face: SHINY[c.id].face, sprite: SHINY[c.id].sprite, shiny: true } : c;
}
const TEAM_BY_ID = Object.fromEntries(TEAMS.map(t => [t.id, t]));
/* cara del jugador como <img> (si no tiene cara, un balón) */
function charFace(c, size, cls){
  if (!c) return '';
  if (!c.face) return `<span class="face-fallback" style="font-size:${Math.round(size * 0.7)}px">⚽</span>`;
  return `<img class="char-face${cls ? ' ' + cls : ''}" src="${encodeURI(c.face)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" draggable="false">`;
}
const RARITY_WEIGHTS = { common:45, uncommon:28, rare:17, epic:8, legendary:2 };
const RARITY_LABEL = { common:'Común', uncommon:'Poco común', rare:'Raro', epic:'Épico', legendary:'Legendario' };
const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
const RARITY_COLOR = { common:'#8fa39a', uncommon:'#5fcf7a', rare:'#4fb8e6', epic:'#b377e0', legendary:'#f2b705' };

/* ---------------------- ESTADO PERSISTENTE ---------------------- */
let state = {
  coins: Number(localStorage.getItem('ss_coins') || 300),
  tickets: Number(localStorage.getItem('ss_tickets') || 0),         // tickets amarillos (sobre normal)
  ticketsEpic: Number(localStorage.getItem('ss_tickets_epic') || 0), // tickets morados (sobre épico)
  unlocked: JSON.parse(localStorage.getItem('ss_unlocked') || '[]'),
  selected: localStorage.getItem('ss_selected') || null,
  shiny: JSON.parse(localStorage.getItem('ss_shiny') || '[]'),          // cromáticos conseguidos
  shinyOn: JSON.parse(localStorage.getItem('ss_shiny_on') || '{}'),     // con qué aspecto juega cada uno
};
/* quita de la partida guardada los jugadores de prueba antiguos (c1, c2…) que ya no existen */
state.unlocked = state.unlocked.filter(id => CHARACTERS.some(c => c.id === id));
/* jugadores con los que se empieza */
const STARTER_IDS = [];                                     // (los jugadores nuevos empiezan con 3 sobres de regalo)
/* MODO PRUEBAS: estos jugadores salen desbloqueados al abrir el juego (de todas las rarezas).
   Pon DEV_UNLOCK en false para conseguirlos solo con el gacha; DEV_UNLOCK_ALL los desbloquea todos. */
const DEV_UNLOCK = false;
const DEV_UNLOCK_ALL = false;
const DEV_UNLOCK_NAMES = ['Mark Evans', 'Axel Blaze', 'Jude Sharp', 'Erik Eagle', 'Byron Love', 'Nathan Swift',
  'Kevin Dragonfly', 'Jack Wallside', 'Joseph King', 'Tyler Murdock', 'Shadow Cimmerian', 'Steve Grim',
  'Sam Kincaid', 'Paul Siddon', 'Morgan Sanders', 'Sam Idol'];
for (const id of STARTER_IDS) if (!state.unlocked.includes(id)) state.unlocked.push(id);
if (DEV_UNLOCK || DEV_UNLOCK_ALL){
  for (const c of CHARACTERS)
    if ((DEV_UNLOCK_ALL || DEV_UNLOCK_NAMES.includes(c.name)) && !state.unlocked.includes(c.id)) state.unlocked.push(c.id);
}
/* MODO PRUEBAS: cromáticos que salen ya conseguidos */
const DEV_SHINY_NAMES = [];
for (const c of CHARACTERS) if (DEV_SHINY_NAMES.includes(c.name) && SHINY[c.id] && !state.shiny.includes(c.id)){
  state.shiny.push(c.id); if (!state.unlocked.includes(c.id)) state.unlocked.push(c.id);
}
try { localStorage.setItem('ss_shiny', JSON.stringify(state.shiny)); } catch (e) {}
try { localStorage.setItem('ss_unlocked', JSON.stringify(state.unlocked)); } catch (e) {}
if (!state.selected || !state.unlocked.includes(state.selected)){
  state.selected = state.unlocked[0];
}
function saveState(){
  devRefill();
  localStorage.setItem('ss_coins', state.coins);
  localStorage.setItem('ss_tickets', state.tickets);
  localStorage.setItem('ss_tickets_epic', state.ticketsEpic);
  localStorage.setItem('ss_unlocked', JSON.stringify(state.unlocked));
  localStorage.setItem('ss_selected', state.selected);
  localStorage.setItem('ss_shiny', JSON.stringify(state.shiny));
  localStorage.setItem('ss_shiny_on', JSON.stringify(state.shinyOn));
}

/* ---------------------- NAVEGACIÓN DE PANTALLAS ---------------------- */
const screens = {
  title: document.getElementById('screen-title'),
  select: document.getElementById('screen-select'),
  gacha: document.getElementById('screen-gacha'),
  roster: document.getElementById('screen-roster'),
  upgrades: document.getElementById('screen-upgrades'),
  docs: document.getElementById('screen-docs'),
  game: document.getElementById('screen-game'),
};
function showScreen(name){
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}
/* MODO PRUEBAS: monedas y tickets infinitos (pon DEV_INFINITE en false para jugar normal) */
const DEV_INFINITE = false;
function devRefill(){ if (!DEV_INFINITE) return; state.coins = Math.max(state.coins, 999999); state.tickets = Math.max(state.tickets, 999); state.ticketsEpic = Math.max(state.ticketsEpic, 999); }
function refreshCoinBadges(){
  devRefill();
  document.getElementById('coin-badge').textContent = state.coins;
  const tkb = document.getElementById('ticket-badge');
  if (tkb) tkb.textContent = state.tickets;
  const tke = document.getElementById('ticket-badge-epic');
  if (tke) tke.textContent = state.ticketsEpic;
  document.getElementById('coin-badge-2').innerHTML = `${state.coins} ${COIN_HTML} · ${pxImg('ticketY', 20)} ${state.tickets} · ${pxImg('ticketP', 20)} ${state.ticketsEpic}`;
  const cb3 = document.getElementById('coin-badge-3');
  if (cb3) cb3.textContent = state.coins;
}
refreshCoinBadges();

/* ---------------------- ESCAPARATE DEL JUGADOR SELECCIONADO (pantalla de inicio) ---------------------- */
function updateShowcase(){
  const c = CHARACTERS.find(ch => ch.id === state.selected) || CHARACTERS.find(ch => ch.id === state.unlocked[0]);
  if (!c) return;
  document.getElementById('showcase-emoji').innerHTML = charFace(lookOf(c), 250, 'showcase-face');
  document.querySelector('.showcase-box').classList.toggle('is-shiny', shinyOn(c.id));
  document.querySelector('.showcase-box').style.setProperty('--rar', RARITY_COLOR[c.rarity] || RARITY_COLOR.common);   // recuadro del color de su rareza
  document.querySelector('.showcase-box').dataset.rarity = c.rarity;
  document.getElementById('showcase-name').textContent = c.name;
  const el = getElement(c.element);
  const elSpan = document.getElementById('showcase-element');
  elSpan.innerHTML = elLabel(c.element, 18);
  elSpan.style.setProperty('--c', el.color);
  const rSpan = document.getElementById('showcase-rarity');
  rSpan.textContent = RARITY_LABEL[c.rarity];
  rSpan.className = `char-rarity rarity-${c.rarity}`;
  document.getElementById('roster-count').textContent = `${state.unlocked.length} / ${CHARACTERS.length}`;
}

/* ---------------------- CRIATURAS DECORATIVAS EN EL CAMPO DE INICIO ---------------------- */
function renderFieldDecor(){
  const zone = document.getElementById('field-decor');
  if (!zone || zone.childElementCount) return; // solo una vez
  const pool = CHARACTERS.filter(c => state.unlocked.includes(c.id));
  const spots = [
    {top:'10%', left:'8%'}, {top:'72%', left:'6%'}, {top:'18%', left:'86%'},
    {top:'60%', left:'90%'}, {top:'82%', left:'40%'}, {top:'8%', left:'46%'},
  ];
  spots.forEach((pos, i) => {
    const c = pool[i % pool.length] || CHARACTERS[i % CHARACTERS.length];
    if (!c || (c.id === state.selected && pool.length > 1)) return;
    const el = document.createElement('div');
    el.className = 'field-critter';
    el.style.top = pos.top; el.style.left = pos.left;
    el.style.animationDelay = `${i * 0.4}s`;
    el.innerHTML = charFace(c, 40);
    zone.appendChild(el);
  });
}

/* ======================================================================
   MEJORAS PERMANENTES (cada jugador tiene las suyas) — inspiradas en las
   de PokéSurvivor. Se compran con monedas en el menú "Mejoras".
   cost(nivel) = base × growth^nivel (redondeado a 5).
   Efecto por nivel:
     vitalidad +4 vida · fuerza +2% daño · zancada +1,5% velocidad ·
     reflejos −1,5% recarga del disparo · coraza +1% defensa ·
     síntesis +0.1 vida/s · imán +6% radio de recogida ·
     sabiduría +2,5% experiencia · fortuna +4% monedas del partido ·
     crítico +1,5% de probabilidad de crítico ·
     cambio: +1 cambio de cartas por partido al subir de nivel ·
     veto: bloquea 1 mejora o supertécnica (no te sale en las cartas) ·
     inicial: empiezas con la supertécnica que elijas (Nv. 1)
   ====================================================================== */
const META_UPGRADES = [
  { id:'vitalidad', icon:'❤️', name:'Vida',     per:'+8 vida',                    max:10, base:40,   growth:1.45 },
  { id:'fuerza',    icon:'🥊', name:'Potencia',        per:'+4% daño',                   max:10, base:50,   growth:1.45 },
  { id:'zancada',   icon:'👟', name:'Sprint',       per:'+1,5% velocidad',            max:8,  base:40,   growth:1.5 },
  { id:'reflejos',  icon:'⏱️', name:'Reacción',      per:'−2,5% recarga',              max:8,  base:50,   growth:1.5 },
  { id:'coraza',    icon:'🛡️', name:'Coraza',        per:'+1,5% defensa',                max:8,  base:50,   growth:1.5 },
  { id:'sintesis',  icon:'🌱', name:'Regeneración',      per:'+0.2 vida/s',                max:5,  base:80,   growth:1.7 },
  { id:'iman',      icon:'🧲', name:'Imán',          per:'+6% recogida',               max:6,  base:30,   growth:1.5 },
  { id:'sabiduria', icon:'📘', name:'Aprendizaje',     per:'+2,5% experiencia',          max:8,  base:50,   growth:1.5 },
  { id:'fortuna',   icon:COIN_HTML, name:'Fortuna',       per:'+4% monedas',                max:8,  base:40,   growth:1.5 },
  { id:'critico',   icon:'⭐', name:'Golpe crítico', per:'+2% de críticos',          max:10, base:50,   growth:1.45 },
  { id:'cambio',    icon:'🔄', name:'Cambios', per:'+1 cambio de cartas al subir de nivel por partido', max:5, base:120, growth:1.8 },
  { id:'veto',      icon:'🚫', name:'Veto',          per:'Bloquea 1 mejora o supertécnica: no te sale en las cartas', max:3, base:200, growth:2, pick:'veto' },
  { id:'vetoObj',   icon:'⛔', name:'Veto de objeto', per:'Bloquea 1 objeto: ya no te sale ni en los bosses ni en los cofres', max:2, base:250, growth:2, pick:'relicVeto' },
  { id:'inicial',   icon:'▶️', name:'Técnica inicial', per:'Eliges con qué supertécnica empiezas el partido', max:1, base:1500, growth:1, pick:'start' },
];
function metaCost(u, lvl){ return Math.round(u.base * Math.pow(u.growth, lvl) / 5) * 5; }
state.meta = JSON.parse(localStorage.getItem('ss_meta') || '{}');
function metaOf(charId){
  if (!state.meta[charId]) state.meta[charId] = { lv:{}, veto:[], start:null };
  return state.meta[charId];
}
function saveMeta(){ localStorage.setItem('ss_meta', JSON.stringify(state.meta)); }

/* aplica las mejoras permanentes del jugador al empezar el partido */
function applyMeta(m, charId){
  const M = metaOf(charId), L = k => M.lv[k] || 0;
  // (valores a la mitad que antes: un personaje muy mejorado ya no arrasa en los primeros niveles)
  // (el doble que antes: con todas las mejoras se nota mucho; sin ellas el final es casi imposible)
  m.maxHp += 8 * L('vitalidad'); m.hp = m.maxHp;
  m.dmg *= 1 + 0.04 * L('fuerza');
  m.speed *= 1 + 0.015 * L('zancada');
  m.atkSpeed /= 1 - 0.025 * L('reflejos');
  m.def += 1.5 * L('coraza');
  m.regen = 0.2 * L('sintesis');
  m.pickup *= 1 + 0.06 * L('iman');
  m.xpMult += 0.025 * L('sabiduria');
  m.coinMult = 1 + 0.04 * L('fortuna');
  m.crit += 2 * L('critico');
  m.rerolls = L('cambio');
  m.veto = (M.veto || []).slice(0, L('veto'));
  m.relicVeto = (M.relicVeto || []).slice(0, L('vetoObj'));
  if (L('inicial') && M.start && TECH_KINDS[M.start] && !m.veto.includes(M.start)){
    m.techs.push({ kind: M.start, lvl: 1, charge: 0 });
    m.activeTech = 0;
    m.hadStartTech = true;
  }
}

/* nombre de una supertécnica para un personaje concreto (fuera del partido) */
function techNameFor(c, kind){
  if (isBuffKind(kind)) return TECH_KINDS[kind].names[0];
  const own = c.techNames && c.techNames[kind];
  return (own || (TECH_NAMES[c.element] || NEUTRAL_TECH_NAMES)[kind])[0];
}

/* ---------------------- PANTALLA DE MEJORAS ---------------------- */
let metaChar = null, metaBack = 'title', metaSearch = '';
/* abre la pantalla de mejoras de un jugador (desde el menú o desde su ficha) */
function openUpgrades(charId, from){
  metaChar = charId || state.selected; metaBack = from || 'title';
  renderMeta(); showScreen('upgrades');
  const a = document.querySelector('#meta-chars .mt-pl.active'); if (a) a.scrollIntoView({ block:'nearest' });
}
function metaTotal(id){ return Object.values(metaOf(id).lv).reduce((a, v) => a + v, 0); }
function renderMeta(){
  if (!metaChar || !state.unlocked.includes(metaChar)) metaChar = state.selected;
  const c = CHARACTERS.find(ch => ch.id === metaChar);
  const M = metaOf(metaChar), t = teamOf(c);
  // lista de jugadores fichados (con buscador)
  const chars = document.getElementById('meta-chars');
  chars.innerHTML = '';
  const q = metaSearch.trim().toLowerCase();
  const owned = CHARACTERS.filter(ch => state.unlocked.includes(ch.id) && (!q || ch.name.toLowerCase().includes(q) || teamOf(ch).name.toLowerCase().includes(q)));
  if (!owned.length) chars.innerHTML = '<p class="rs-empty">Nadie con ese nombre</p>';
  owned.forEach(ch => {
    const b = document.createElement('button'), n = metaTotal(ch.id);
    b.className = 'mt-pl' + (ch.id === metaChar ? ' active' : '');
    b.style.setProperty('--team', teamOf(ch).color);
    b.innerHTML = `${charFace(ch, 40)}<span><b>${ch.name}</b><small>${crestImg(teamOf(ch), 14)} ${teamOf(ch).name}</small></span>` +
                  (ch.id === state.selected ? '<i class="mt-star" title="Titular">★</i>' : '') + `<em>${n}</em>`;
    b.onclick = () => { metaChar = ch.id; renderMeta(); };
    chars.appendChild(b);
  });
  // cabecera del jugador elegido
  const head = document.getElementById('mt-head');
  head.style.setProperty('--team', t.color);
  const maxAll = META_UPGRADES.reduce((a, u) => a + u.max, 0);
  head.innerHTML = `<div class="mt-face">${charFace(c, 96)}</div>
    <div class="mt-who"><small>${crestImg(t, 18)} ${t.name} · ${POS_LABEL[c.pos] || c.pos}</small><h3>${c.name}</h3>
      <div class="mt-prog"><i style="width:${metaTotal(c.id) / maxAll * 100}%"></i></div><small>${metaTotal(c.id)} / ${maxAll} niveles comprados</small></div>
    <button id="mt-ficha" class="btn btn-ghost">Ver ficha</button>`;
  document.getElementById('mt-ficha').onclick = () => { rosterUI.team = c.team; rosterUI.pick = c.id; renderRoster(); showScreen('roster'); };
  // tarjetas de mejora: icono, qué hace, nivel y un botón grande de comprar
  const grid = document.getElementById('meta-grid');
  grid.innerHTML = '';
  META_UPGRADES.forEach(u => {
    const lvl = M.lv[u.id] || 0, isMax = lvl >= u.max, cost = metaCost(u, lvl), poor = !isMax && state.coins < cost;
    const card = document.createElement('div');
    card.className = 'mt-card' + (isMax ? ' max' : poor ? ' poor' : ' can');
    const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    let pick = '';
    if (u.pick === 'veto' && lvl > 0) pick = `<button class="mt-pick" data-pick="veto">Elegir vetos (${(M.veto || []).length}/${lvl})</button>`;
    if (u.pick === 'relicVeto' && lvl > 0) pick = `<button class="mt-pick" data-pick="relicVeto">Elegir objetos (${(M.relicVeto || []).length}/${lvl})</button>`;
    if (u.pick === 'start' && lvl > 0) pick = `<button class="mt-pick" data-pick="start">Técnica: ${M.start ? techNameFor(c, M.start) : 'elegir'}</button>`;
    card.innerHTML = `
      <div class="mt-top">
        <div class="mt-ico">${PX_ICON_URL[u.id] ? `<img class="px-ico" src="${PX_ICON_URL[u.id]}" alt="">` : u.icon}</div>
        <div class="mt-txt"><b>${u.name}</b><small>${u.per}</small></div>
        <div class="mt-lv">${lvl}<small>/${u.max}</small></div>
      </div>
      <div class="meta-pips">${pips}</div>
      ${pick}
      <button class="mt-buy" ${isMax || poor ? 'disabled' : ''}>${isMax ? '✓ Completada' : `Mejorar · ${cost} ${COIN_HTML}`}</button>`;
    card.querySelector('.mt-buy').onclick = () => {
      if (isMax || state.coins < cost) return;
      state.coins -= cost;
      M.lv[u.id] = lvl + 1;
      SFX.play('upgrade');                              // sonido de mejora comprada
      saveState(); saveMeta(); refreshCoinBadges(); renderMeta();
      if (u.pick === 'start' && !M.start) openMetaPicker('start');
    };
    const pb = card.querySelector('.mt-pick');
    if (pb) pb.onclick = () => openMetaPicker(pb.dataset.pick);
    grid.appendChild(card);
  });
}
document.getElementById('mt-search').oninput = e => { metaSearch = e.target.value; renderMeta(); };

/* elegir qué se veta o con qué supertécnica empiezas */
function openMetaPicker(kind){
  const c = CHARACTERS.find(ch => ch.id === metaChar), M = metaOf(metaChar);
  const box = document.getElementById('meta-picker-options');
  const title = document.getElementById('meta-picker-title'), sub = document.getElementById('meta-picker-sub');
  box.innerHTML = '';
  // todo en una pantalla: casillas con icono grande, agrupadas en secciones
  const el = c.element || null;
  const techs = TECH_ORDER.map(k => ({ id:k, icon:techLogo(k, el, 40), name:techNameFor(c, k), short:'Supertécnica', desc:TECH_KINDS[k].desc(1), el: isBuffKind(k) ? 'book' : (el || 'neutral') }));
  const basics = UPGRADES.map(u => ({ id:u.id, icon:optionIcon(u, 40), name:u.name, short:u.desc, desc:u.desc }));
  const vetoed = M.veto || [];
  let sections;
  if (kind === 'relicVeto'){                                       // veto de objetos: no te salen en bosses ni cofres
    const rv = M.relicVeto || [], slots = M.lv.vetoObj || 0;
    title.textContent = 'Veto de objeto';
    sub.innerHTML = `Toca los objetos que no quieres que te salgan · <b class="mp-count">${rv.length} / ${slots}</b>`;
    const h = document.createElement('h4'); h.className = 'mp-section'; h.textContent = 'Objetos'; box.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'mp-grid'; box.appendChild(grid);
    for (const k of Object.keys(RELICS)){
      const R = RELICS[k], on = rv.includes(k), b = document.createElement('button');
      b.className = 'mp-tile' + (on ? ' vetoed' : '');
      b.title = `${R.name}: ${R.desc}`;
      b.innerHTML = `<span class="mp-ico">${relicIcon(k, 40)}</span><b>${R.name}</b><small>${R.desc}</small>` + (on ? '<i class="mp-badge">✕</i>' : '');
      b.onclick = () => {
        M.relicVeto = M.relicVeto || [];
        if (on) M.relicVeto = M.relicVeto.filter(v => v !== k);
        else if (M.relicVeto.length < slots) M.relicVeto.push(k);
        else return;
        saveMeta(); openMetaPicker(kind); renderMeta();
      };
      grid.appendChild(b);
    }
    document.getElementById('meta-picker').classList.remove('hidden');
    return;
  }
  if (kind === 'veto'){
    const slots = M.lv.veto || 0;
    title.textContent = 'Veto';
    sub.innerHTML = `Toca lo que no quieres que te salga al subir de nivel · <b class="mp-count">${vetoed.length} / ${slots}</b>`;
    sections = [['Mejoras', basics], ['Supertécnicas', techs]];
  } else {
    title.textContent = 'Técnica inicial';
    sub.textContent = `${c.name} empezará cada partido con la que elijas (Nv. 1)`;
    sections = [['Supertécnicas', techs]];
  }
  for (const [label, list] of sections){
    const h = document.createElement('h4'); h.className = 'mp-section'; h.textContent = label; box.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'mp-grid'; box.appendChild(grid);
    list.forEach(o => {
      const on = kind === 'veto' ? vetoed.includes(o.id) : M.start === o.id;
      const blocked = kind === 'start' && vetoed.includes(o.id);
      const b = document.createElement('button');
      b.className = 'mp-tile' + (on ? (kind === 'veto' ? ' vetoed' : ' picked') : '') + (o.el ? ' is-tech' : '');
      if (o.el) b.dataset.el = o.el;
      b.title = `${o.name}: ${o.desc}`;
      b.disabled = blocked;
      b.innerHTML = `<span class="mp-ico">${o.icon}</span><b>${o.name}</b>${blocked ? '<small>Está vetada</small>' : o.el ? '' : `<small>${o.short}</small>`}` +
                    (on ? `<i class="mp-badge">${kind === 'veto' ? '✕' : '✓'}</i>` : '');
      b.onclick = () => {
        if (kind === 'veto'){
          M.veto = M.veto || [];
          if (on) M.veto = M.veto.filter(v => v !== o.id);
          else if (M.veto.length < (M.lv.veto || 0)) M.veto.push(o.id);
          else return;
          if (M.start === o.id && !on) M.start = null;            // no se puede empezar con algo vetado
        } else {
          if (vetoed.includes(o.id)) return;
          M.start = o.id;
        }
        saveMeta(); openMetaPicker(kind); renderMeta();
      };
      grid.appendChild(b);
    });
  }
  document.getElementById('meta-picker').classList.remove('hidden');
}
document.getElementById('btn-meta-picker-close').onclick = () => document.getElementById('meta-picker').classList.add('hidden');
document.getElementById('btn-upgrades').onclick = () => openUpgrades(state.selected, 'title');
document.getElementById('btn-docs').onclick = () => { renderDocs(); showScreen('docs'); };
document.getElementById('btn-back-title-docs').onclick = () => { updateShowcase(); showScreen('title'); };

/* ======================================================================
   PRESENTACIÓN "VS" al entrar a un duelo: tu jugador contra el boss (pausa ~2,4 s)
   ====================================================================== */
const VS_TIME = 2400;
/* color de la banda de cada equipo en el VS */
const VS_TEAM_COLOR = { raimon:'#f39a1c', occult:'#8a3fd0', wild:'#e07b2a', brain:'#3fb8c9', otaku:'#e45fa8', royal:'#2fae52',
  shuriken:'#6b7385', farm:'#9bbf2e', kirkwood:'#d8332b', zeus:'#f2c94c' };
function teamColor(id, fb){ const k = (id || '').toLowerCase(), t = TEAM_BY_ID[k]; return VS_TEAM_COLOR[k] || (t && t.color) || fb || '#4f8df0'; }
function showVsIntro(def){
  if (!match || !def) return;
  const ov = document.getElementById('vs-overlay'); if (!ov) return;
  const me = match.charDef || CHARACTERS.find(c => c.id === state.selected);
  const L = ov.querySelector('.vs-l');
  L.style.setProperty('--c', teamColor(me && me.team, '#f39a1c'));
  document.getElementById('vs-face-l').innerHTML = me ? charFace(me, 150) : '⚽';
  document.getElementById('vs-name-l').textContent = me ? (me.nick || me.name) : 'Tú';
  // rivales: uno, o varios uno encima de otro (los hermanos Murdock), cada uno con su banda del color de su equipo
  const col = teamColor(def.team, def.color || '#b377e0');
  const foes = def.faceChar ? [{ face: charFace(def.faceChar, 150), name: def.name }]
    : (def.group || [def]).map(p => ({ face: bossFace(p.name, 150) || p.emoji, name: def.group ? p.name.split(' ')[0] : p.name }));
  const rc = document.getElementById('vs-rcol');
  rc.classList.toggle('multi', foes.length > 1);
  rc.innerHTML = foes.map(f => `<div class="vs-side" style="--c:${col}"><div class="vs-band"></div><div class="vs-box">${f.face}</div><div class="vs-name">${f.name}</div></div>`).join('');
  ov.classList.remove('hidden', 'out'); void ov.offsetWidth;           // reinicia las animaciones
  ov.querySelectorAll('.vs-l, .vs-mid, .vs-flash').forEach(el => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
  match.vsActive = true; match.paused = true; match.keys = {};
  setTimeout(() => { try { SFX.play('thunder'); } catch (e) {} }, 380);
  clearTimeout(showVsIntro._t1); clearTimeout(showVsIntro._t2);
  showVsIntro._t1 = setTimeout(() => ov.classList.add('out'), VS_TIME - 350);
  showVsIntro._t2 = setTimeout(hideVsIntro, VS_TIME);
}
function hideVsIntro(){
  const ov = document.getElementById('vs-overlay'); if (ov) ov.classList.add('hidden');
  if (match && match.vsActive){ match.vsActive = false; if (!match.menuOpen && !match.levelupChoices && !match.over) match.paused = false; }
}

/* ======================================================================
   GUÍA: todo lo del juego explicado (se genera con los datos del propio juego,
   así siempre está al día)
   ====================================================================== */
const DOCS_ITEM_DESC = {
  water:   'Velocidad de movimiento +40% durante 8 s.',
  nectar:  '¡Furia! +50% de daño, +45% de velocidad de ataque y +30% de velocidad durante 10 s.',
  whistle: 'Atrae hacia ti toda la experiencia, las monedas, los objetos y los balones de poder del campo.',
  rice:    'Te cura al instante (25 + 15% de tu vida máxima).',
  bomb:    'Explota nada más cogerla: daña a todos los rivales en un área grande (los normales suelen caer) y quita un 6% de vida a los bosses.',
};
const DOCS_ENEMY_DESC = {
  shooter: ['Tirador', 'Se queda a distancia y te lanza un balón cada pocos segundos.'],
  runner:  ['Velocista', 'Pequeño, frágil y muy rápido: va directo a por ti.'],
  tank:    ['Muro', 'Grande, lento y con muchísima vida. Pega fuerte.'],
  dasher:  ['Embestidor', 'Se para, marca una línea roja en el suelo y embiste en línea recta.'],
  lobber:  ['Lanzador', 'Lanza el balón por arriba: marca un círculo en el suelo y al rato cae. Sal del círculo.'],
  gunner:  ['Cañonero', 'Dispara 3 balones en abanico.'],
};
const DOCS_BOSS_DESC = {
  dark:     'Oscurece el campo: solo ves un círculo a tu alrededor.',
  charge:   'Embestidas: se prepara y carga contra ti.',
  fists:    'Cohetes: marca dónde van a caer con una señal de alerta.',
  shield:   'Escudo rosa que aguanta parte de tus golpes.',
  royal:    'Espejismo de balón (5 balones, solo 1 es real), espiral de balones, esquiva tus golpes y escudo azul.',
  teleport: 'Se teletransporta, oscurece el campo y se pone escudo gris.',
  walters:  'Lanza rocas que caen del cielo y se pone escudo verde.',
  murdock:  'Los tres hermanos a la vez: disparan con su afinidad y se teletransportan. Si cae uno, los otros se curan.',
  byron:    'Se queda en el centro con un círculo dorado que te ralentiza. Puños divinos, Sabiduría divina y Flecha divina. Con 3 torres a su alrededor.',
};
let docsTab = 'techs';
function docsCard(ico, title, desc, tag){ return `<div class="docs-card"><div class="dc-ico">${ico || ''}</div><div><b>${title}</b>${tag ? `<span class="dc-tag">${tag}</span>` : ''}<small>${desc}</small></div></div>`; }
function docsSections(){
  const el0 = state && CHARACTERS.find(c => c.id === state.selected), myEl = el0 ? el0.element : 'fire';
  const pct = v => `${Math.round(v * 100)}%`;
  return {
    techs: ['⚡ Supertécnicas', () => {
      let h = `<h3>Supertécnicas</h3><p class="intro">Se consiguen al subir de nivel. Tienes 2 teclas (Q y E) y solo una funciona a la vez: cambia con Q/E. Suben hasta el Nv. ${TECH_MAX}; en el Nv. ${EVOLVE_AT} evolucionan y desbloquean su técnica definitiva (R), que se carga golpeando con ella. Tras usar la R hay ${ULT_RECHARGE_DELAY} s en los que no se vuelve a cargar. Pegan según el <b>At. especial</b> de tu jugador; los disparos básicos, según su <b>Daño</b>.</p><div class="docs-grid">`;
      for (const k of TECH_ORDER){
        const K = TECH_KINDS[k]; if (!K) continue;
        const nm = isBuffKind(k) ? K.names[0] : `${(TECH_NAMES[myEl] || NEUTRAL_TECH_NAMES)[k][0]} → ${(TECH_NAMES[myEl] || NEUTRAL_TECH_NAMES)[k][1]}`;
        h += docsCard(techLogo(k, myEl, 30), nm, `Nv. 1: ${K.desc(1)}.<br>Nv. ${TECH_MAX}: ${K.desc(TECH_MAX)}.${K.ultDesc ? `<br><b>R:</b> ${K.ultDesc.replace(/^.*Técnica definitiva \(R\):\s*/, '')}.` : ''}`, isBuffKind(k) ? 'Cuaderno' : null);
      }
      h += `</div><h4>Cuadernos</h4><p class="intro">Los cuadernos no atacan: mientras los usas se carga su círculo y, al cambiar a tu otra supertécnica, le dan su mejora un rato. El de Velocidad ya te acelera mientras se carga. Fusionados con una supertécnica, su mejora es permanente. No tienen R.</p>`;
      return h;
    }],
    hillman: ['👴 Hillman y fusiones', () => `<h3>Hillman</h3><p class="intro">Aparece en el borde del campo en el minuto 5 y luego después de algunos bosses (tienes ${HILLMAN.stay} s para llegar hasta él; una flecha te indica dónde está).</p><ul class="docs-list">
      <li><b>Fusión:</b> junta dos supertécnicas en la misma tecla y funcionan a la vez. La R es la de la base.</li>
      <li><b>Nueva:</b> si te queda una tecla libre, te enseña una supertécnica de cualquier afinidad.</li>
      <li><b>Mezcla de 4:</b> cuando la Q y la E tienen 2 habilidades cada una, vuelve una vez más y junta las 4 en la Q. La E queda bloqueada y ya no puedes aprender más: solo subir esas 4. Eliges la base (su R será tu R) y la R pega con la mejor afinidad de las que mezcles contra cada rival.</li></ul>`],
    affinity: ['🔥 Afinidades', () => {
      let h = `<h3>Afinidades</h3><p class="intro">Cada afinidad gana a 2 y pierde con 2. Con ventaja haces ×${ELEMENT_ADV} de daño; con desventaja, ×${ELEMENT_DIS}. Los rivales también tienen la afinidad de su personaje, y lo mismo vale para el daño que te hacen. Cada afinidad tiene además una pasiva fija.</p><div class="docs-grid">`;
      for (const k of ELEMENT_ORDER){
        const E = ELEMENTS[k], P = AFFINITY_PASSIVES[k];
        const loses = ELEMENT_ORDER.filter(o => ELEMENTS[o].beats.includes(k)).map(o => ELEMENTS[o].name).join(' y ');
        h += docsCard(elIcon(k, 26), E.name, `Gana a ${E.beats.map(b => ELEMENTS[b].name).join(' y ')} · pierde con ${loses}.<br><b>${P ? P.name : ''}:</b> ${P ? P.desc : ''}.`);
      }
      return h + '</div>';
    }],
    levelup: ['⬆️ Mejoras de nivel', () => {
      let h = `<h3>Mejoras al subir de nivel</h3><p class="intro">Al subir de nivel eliges 1 de 3 cartas: mejoras, supertécnicas o talentos. Las mejoras no tienen tope; algunas rinden cada vez un poco menos. La carta de evolución, cuando la tienes lista, sale siempre. Cada nivel pide más experiencia y, cuanto más avanza el partido, menos experiencia da cada gema.</p><div class="docs-grid">`;
      for (const u of UPGRADES) h += docsCard(optionIcon(u, 30), u.name, u.desc);
      return h + '</div>';
    }],
    talents: ['⭐ Talentos', () => {
      let h = `<h3>Talentos</h3><p class="intro">Puedes llevar ${TALENT_SLOTS}. Los consigues con el cuaderno que sueltan algunos bosses: eliges 1 de ${TALENT_CHOICES}. Si ya tienes los dos, el cuaderno sube de nivel los que llevas. También salen como cartas al subir de nivel. Llegan hasta el Nv. ${TALENT_MAX}.</p><div class="docs-grid">`;
      for (const [k, T] of Object.entries(TALENTS)) h += docsCard(optionIcon({ talent: true, id: k, emoji: T.emoji }, 30), T.name, `Nv. 1: ${talentDesc(k, 1)}.<br>Nv. ${TALENT_MAX}: ${talentDesc(k, TALENT_MAX)}.`);
      return h + '</div>';
    }],
    relics: ['🎒 Objetos', () => {
      let h = `<h3>Objetos (equipables)</h3><p class="intro">Solo puedes llevar uno. Los sueltan los bosses (a partir del ${RELIC_FROM_BOSS}º) y a veces los cofres. Si ya llevas uno, eliges con cuál te quedas.</p><div class="docs-grid">`;
      for (const [k, R] of Object.entries(RELICS)) h += docsCard(pxImg('r_' + k, 30) || R.emoji, R.name, R.desc);
      return h + '</div>';
    }],
    items: ['🍙 Objetos del suelo', () => {
      let h = `<h3>Objetos del suelo</h3><p class="intro">Los sueltan los rivales al caer (poco a menudo). Se cogen pasando por encima; el imán los atrae.</p><div class="docs-grid">`;
      for (const [k, I] of Object.entries(ITEMS)){ const u = ITEM_SPRITE_URL[k]; h += docsCard(u ? `<img src="${u}" width="30" height="30">` : I.emoji, I.name, DOCS_ITEM_DESC[k] || ''); }
      h += docsCard(pxImg('fortuna', 30), 'Monedas y saco', 'Monedas para la tienda y las mejoras permanentes.');
      h += docsCard(pxImg('ticketY', 30), 'Tickets', 'Amarillos y morados: sirven para los sobres de la tienda. Cada boss suelta al menos uno amarillo.');
      return h + '</div>';
    }],
    pballs: ['🔴 Balones de poder', () => {
      let h = `<h3>Balones de poder</h3><p class="intro">Los suelta a veces un rival al caer. Se guardan (hasta ${PBALL.maxEach} de cada color) y los activas con las teclas 1, 2, 3 y 4. Su aura parpadea cuando se van a acabar.</p><div class="docs-grid">`;
      PBALL.order.forEach((k, i) => { const B = PBALL[k]; h += docsCard(`<span style="display:inline-block;width:32px;height:32px;background:url('assets/ui/pballs.png') ${-i * 32}px 0 / 128px 32px;image-rendering:pixelated;filter:drop-shadow(0 0 4px ${B.color})"></span>`, `${B.name} · tecla ${i + 1}`, `${B.desc} durante ${B.dur} s.`); });
      return h + '</div>';
    }],
    enemies: ['👟 Rivales', () => {
      let h = `<h3>Rivales</h3><p class="intro">Van saliendo poco a poco y cada minuto salen más y más fuertes (como en PokéSurvivor). Como mucho hay ${PS.CAP} a la vez; con el campo casi lleno salen <b>élites</b> (más vida, daño y experiencia). Cada ${PS.SURGE[0]}-${PS.SURGE[1]} s llega una <b>marea</b> desde un lado. Tras cada golpe que recibes estás ${IFRAMES} s invulnerable.</p><div class="docs-grid">`;
      for (const [k, V] of Object.entries(ENEMY_VARIANTS)){ const D = DOCS_ENEMY_DESC[k]; if (D) h += docsCard(V.emoji, D[0], `${D[1]} Sale desde el minuto ${Math.floor(V.from / 60)}:${String(V.from % 60).padStart(2, '0')}.`); }
      for (const [k, S] of Object.entries(SPECIAL_ENEMIES)) h += docsCard(S.emoji, S.name, k === 'willy' ? 'No ataca: pasea hasta que le pegas y entonces huye. Si lo cazas antes de que se escape, suelta muchísima experiencia.' : 'Duro y lento. Al caer suelta un saco de monedas o, a veces, un ticket.', 'Especial');
      return h + '</div>';
    }],
    bosses: ['👑 Bosses', () => {
      let h = `<h3>Bosses</h3><p class="intro">Para luchar contra un boss, toca al <b>árbitro</b> cuando aparezca (si tardas mucho, pita el final del partido). El duelo es en una arena aparte. Los escudos de los bosses y las torres de Aphrodite salen siempre al 75%, 50% y 25% de vida. Al vencer a Aphrodite aparece Mark Evans: es inmortal y cada vez más fuerte; aguanta todo lo que puedas.</p><div class="docs-grid">`;
      for (const B of BOSSES){ h += docsCard(bossFace((B.group ? B.group[0] : B).name, 30) || B.emoji, B.name, `${B.team} · minuto ${Math.floor(B.minute)}:${String(Math.round((B.minute % 1) * 60)).padStart(2, '0')}. ${DOCS_BOSS_DESC[B.special] || ''}`); }
      return h + '</div>';
    }],
    field: ['🗼 Campo', () => `<h3>El campo</h3><ul class="docs-list">
      <li><b>Cofres:</b> quédate a su lado unos segundos para abrirlos: monedas, experiencia o un objeto.</li>
      <li><b>Torre Inazuma:</b> sale una en cada tramo entre bosses (desde el 1º). Si la activas quedándote a su lado, cae un trueno y salen un ${Math.round(ITOWER.perLvl * 100)}% más de rivales (se acumula). Más rivales = más experiencia.</li>
      <li><b>Clima:</b> a veces cambia el tiempo y potencia unas afinidades sobre otras.</li>
      <li><b>Hillman:</b> ver su apartado.</li></ul>`],
  };
}
function renderDocs(){
  const S = docsSections(), tabs = document.getElementById('docs-tabs'), body = document.getElementById('docs-body');
  if (!S[docsTab]) docsTab = 'techs';
  tabs.innerHTML = Object.entries(S).map(([k, v]) => `<button class="docs-tab${k === docsTab ? ' on' : ''}" data-k="${k}">${v[0]}</button>`).join('');
  tabs.querySelectorAll('.docs-tab').forEach(b => b.onclick = () => { docsTab = b.dataset.k; renderDocs(); });
  try { body.innerHTML = S[docsTab][1](); } catch (err) { console.error('[docs]', err); body.innerHTML = '<p>No se pudo cargar este apartado.</p>'; }
  body.scrollTop = 0;
}
document.getElementById('btn-back-title-4').onclick = () => {
  if (metaBack === 'roster'){ rosterUI.pick = metaChar; renderRoster(); showScreen('roster'); return; }
  updateShowcase(); showScreen('title');
};

/* ======================================================================
   SONIDO
   Sonidos arcade originales generados con Web Audio. Si pones tus propios
   archivos en assets/sounds/ con estos nombres (.mp3, .ogg o .wav), se usan
   esos en su lugar: step, shoot, click, start, thunder, whistle, whistle_end,
   upgrade, ult_ready.
   Tecla M: silenciar / activar el sonido.
   ====================================================================== */
const SFX = {
  ctx: null, muted: false, vol: 0.5, files: {}, last: {},
  init(){
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  // archivos propios (opcionales)
  loadFiles(){
    for (const name of ['step', 'shoot', 'click', 'start', 'thunder', 'whistle', 'whistle_end', 'upgrade', 'ult_ready', 'levelup', 'menu_open', 'select', 'reject', 'reroll', 'switch', 'chest', 'ult']){
      const tryExt = (exts) => {
        if (!exts.length) return;
        const a = new Audio(); a.preload = 'auto';
        a.oncanplaythrough = () => { if (!this.files[name]) this.files[name] = a; };
        a.onerror = () => tryExt(exts.slice(1));
        a.src = `assets/sounds/${name}.${exts[0]}`;
      };
      tryExt(['mp3', 'ogg', 'wav']);
    }
  },
  playFile(name, vol = 1){
    const f = this.files[name]; if (!f) return false;
    try { const a = f.cloneNode(); a.volume = Math.min(1, this.vol * vol); a.play().catch(() => {}); } catch (e) {}
    return true;
  },
  // ---- síntesis ----
  tone(type, f0, f1, dur, vol, delay = 0){
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * this.vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    return o;
  },
  noise(dur, vol, filt, f0, f1, delay = 0){
    const c = this.ctx, t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), bq = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; bq.type = filt; bq.frequency.setValueAtTime(f0, t); bq.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol * this.vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq).connect(g).connect(c.destination); src.start(t); src.stop(t + dur + 0.02);
  },
  whistle(dur, delay = 0){                               // silbato: tono agudo con trino
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 2950; lfo.frequency.value = 32; lg.gain.value = 140;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * this.vol, t + 0.02); g.gain.setValueAtTime(0.22 * this.vol, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    this.noise(dur, 0.04, 'bandpass', 3000, 3000, delay);  // soplido
  },
  play(name){
    if (this.muted) return;
    this.init();
    // límite de repetición por sonido (que los disparos no saturen)
    const now = performance.now(), gap = { step: 90, shoot: 70, click: 40, switch: 80 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    if (this.playFile(name, name === 'step' ? 0.5 : 1)) return;
    if (!this.ctx) return;
    switch (name){
      case 'step':  this.noise(0.05, 0.05, 'lowpass', 900, 300); break;
      case 'shoot': this.tone('square', 880, 220, 0.09, 0.07); this.noise(0.04, 0.05, 'highpass', 2500, 1500); break;
      case 'click': this.tone('square', 1320, 1320, 0.035, 0.06); this.tone('square', 1760, 1760, 0.04, 0.05, 0.035); break;
      case 'thunder': this.noise(1.4, 0.5, 'lowpass', 2400, 90); this.noise(0.25, 0.35, 'highpass', 5000, 1200); this.tone('sawtooth', 70, 35, 1.0, 0.12, 0.05); break;
      case 'start': {                                   // fanfarria corta (arpegio ascendente) + trueno
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((f, i) => { this.tone('square', f, f, 0.12, 0.08, i * 0.07); this.tone('triangle', f / 2, f / 2, 0.14, 0.07, i * 0.07); });
        this.tone('square', 1568, 1568, 0.35, 0.07, notes.length * 0.07); this.tone('square', 1976, 1976, 0.35, 0.05, notes.length * 0.07);
        if (!this.playFile('thunder')){ this.noise(1.4, 0.45, 'lowpass', 2400, 90, 0.02); this.noise(0.22, 0.3, 'highpass', 5000, 1200, 0.02); }
        break;
      }
      case 'upgrade': {                                 // mejora comprada: monedas + subida brillante
        this.tone('square', 1568, 1568, 0.06, 0.06); this.tone('square', 2093, 2093, 0.12, 0.06, 0.06);
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.1, 0.09, 0.12 + i * 0.05));
        this.tone('square', 1319, 2637, 0.25, 0.04, 0.32);
        break;
      }
      case 'ult_ready': {                               // R cargada: subida de energía + brillo
        this.tone('sawtooth', 180, 1400, 0.45, 0.06); this.tone('square', 360, 2800, 0.45, 0.035);
        this.noise(0.45, 0.06, 'bandpass', 600, 5000);
        [1319, 1568, 2093].forEach((f, i) => this.tone('square', f, f, 0.14, 0.06, 0.45 + i * 0.07));
        break;
      }
      case 'levelup': {                                 // subida de nivel: arpegio rápido hacia arriba
        [659, 784, 988, 1319, 1568].forEach((f, i) => this.tone('square', f, f, 0.09, 0.07, i * 0.05));
        this.tone('triangle', 1976, 1976, 0.3, 0.06, 0.25);
        break;
      }
      case 'chest': {                                   // cofre: campanitas mágicas que suben
        [784, 988, 1175, 1568, 1976].forEach((f, i) => { this.tone('triangle', f, f, 0.18, 0.07, i * 0.06); this.tone('square', f * 2, f * 2, 0.05, 0.02, i * 0.06 + 0.02); });
        this.noise(0.5, 0.03, 'highpass', 6000, 9000, 0.05);
        break;
      }
      case 'ult': {                                     // definitiva: golpe grave + estallido + acorde heroico
        this.tone('sawtooth', 110, 55, 0.6, 0.14); this.tone('square', 220, 110, 0.35, 0.07);
        this.noise(0.9, 0.22, 'lowpass', 3500, 150); this.noise(0.25, 0.14, 'highpass', 6000, 2000);
        [523, 659, 784, 1047].forEach(f => this.tone('square', f, f, 0.5, 0.045, 0.12));
        this.tone('square', 1568, 2093, 0.4, 0.05, 0.12);
        break;
      }
      case 'menu_open': this.tone('triangle', 660, 990, 0.12, 0.09); this.tone('square', 1320, 1320, 0.06, 0.04, 0.08); break;   // se abre un menú de elección
      case 'select':  this.tone('square', 988, 988, 0.05, 0.08); this.tone('square', 1480, 1480, 0.12, 0.08, 0.05); break;        // eliges algo
      case 'reject':  this.tone('square', 392, 262, 0.18, 0.07); this.tone('triangle', 196, 131, 0.2, 0.08, 0.04); break;          // rechazas
      case 'reroll':  [880, 1175, 880, 1319].forEach((f, i) => this.tone('square', f, f, 0.05, 0.05, i * 0.04)); this.noise(0.15, 0.04, 'bandpass', 2000, 6000); break;   // cambio de cartas
      case 'switch':  this.tone('square', 700, 1400, 0.07, 0.06); this.noise(0.06, 0.04, 'highpass', 3000, 6000); break;           // cambio de supertécnica
      case 'whistle': this.whistle(0.22); this.whistle(0.22, 0.3); break;                 // pi-pi
      case 'whistle_end': this.whistle(0.18); this.whistle(0.18, 0.24); this.whistle(0.7, 0.5); break;   // pi-pi-piiii (final)
    }
  },
};
SFX.loadFiles();
const CHOICE_OVERLAYS = ['levelup-overlay', 'talent-overlay', 'relic-overlay', 'hillman-overlay'];
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button');
  if (!b || (b.classList.contains('meta-buy') && !b.disabled)) return;
  if (CHOICE_OVERLAYS.some(id => b.closest('#' + id))) return;        // en los menús de elección suenan su apertura y su cierre
  SFX.play('click');
}, true);
/* menús de elección en mitad del partido: sonido al abrirse y al cerrarse (elegir o rechazar) */
(function watchChoiceMenus(){
  const seen = {};
  const check = () => {
    for (const id of CHOICE_OVERLAYS){
      const el = document.getElementById(id); if (!el) continue;
      const open = !el.classList.contains('hidden');
      if (open && !seen[id]) SFX.play(id === 'levelup-overlay' ? 'levelup' : 'menu_open');
      if (!open && seen[id]){ SFX.play(SFX.closeAs || 'select'); SFX.closeAs = null; }
      seen[id] = open;
    }
  };
  try { new MutationObserver(check).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); } catch (e) {}
})();
window.addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.repeat){ SFX.muted = !SFX.muted; try { localStorage.setItem('ss_audio', JSON.stringify({ sfx: SFX.vol, music: MUSIC.level, muted: SFX.muted })); } catch (err) {} if (typeof syncSettingsUI === 'function') syncSettingsUI(); } });

/* ======================================================================
   MÚSICA (generada por código, estilo arcade)
   field: tranquila y relajada (menús y campo) · boss: épica (duelo)
   Si pones assets/sounds/music_field.(mp3|ogg|wav) o music_boss.* se usan
   esos archivos en bucle. La tecla M silencia también la música.
   ====================================================================== */
const MUSIC = {
  track: null, want: 'field', gain: null, tempo: 1, level: 0.5, step: 0, nextT: 0, timer: null, files: {}, fileEl: null, vol: 1.7,
  N: n => 440 * Math.pow(2, (n - 69) / 12),           // nota MIDI → Hz
  SONGS: {
    field: { bpm: 86, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],   // Fmaj7 Em7 Dm7 Cmaj7
             melody: [72, null, 76, null, 74, null, 72, null, 69, null, null, 72, 71, null, 67, null,
                      69, null, 72, null, 74, null, 76, 74, 72, null, null, null, 67, null, 69, null] },
    boss:  { bpm: 148, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]],                   // Dm Bb C A
             melody: [74, 74, 77, 74, 81, null, 79, 77, 76, 76, 79, 76, 72, null, 74, 76,
                      77, 77, 81, 77, 84, null, 82, 81, 81, 79, 77, 76, 73, null, 76, 81] },
  },
  loadFiles(){
    for (const name of ['field', 'boss']){
      const tryExt = exts => { if (!exts.length) return; const a = new Audio(); a.loop = true; a.preload = 'auto';
        a.oncanplaythrough = () => { if (!this.files[name]) this.files[name] = a; }; a.onerror = () => tryExt(exts.slice(1));
        a.src = `assets/sounds/music_${name}.${exts[0]}`; };
      tryExt(['mp3', 'ogg', 'wav']);
    }
  },
  start(){
    SFX.init(); const c = SFX.ctx; if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (this.timer) return;
    // salida: compresor suave + eco corto (pega las notas y hace los cambios más suaves)
    this.out = c.createGain(); this.out.gain.value = 1;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    const dly = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter(), wet = c.createGain();
    dly.delayTime.value = 0.27; fb.gain.value = 0.28; lp.type = 'lowpass'; lp.frequency.value = 2600; wet.gain.value = 0.22;
    this.out.connect(comp); comp.connect(c.destination);
    this.out.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(wet); wet.connect(comp);
    this.gain = this.newGain();
    this.timer = setInterval(() => this.tick(), 25);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && SFX.ctx){ SFX.ctx.resume && SFX.ctx.resume(); this.nextT = Math.max(this.nextT, SFX.ctx.currentTime + 0.05); } });
  },
  newGain(){ const c = SFX.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.out); return g; },
  set(name){ this.want = name; },
  /* ritmo según el minuto del partido: normal los 10 primeros minutos y, a partir de ahí,
     un poco más rápido cada 5 minutos (+6% cada tramo, hasta +24%) */
  tempoNow(){
    if (typeof match === 'undefined' || !match || match.over) return 1;
    const min = matchClock() / 60;
    return min < 10 ? 1 : 1 + 0.06 * Math.min(4, 1 + Math.floor((min - 10) / 5));
  },
  tick(){
    const c = SFX.ctx; if (!c || !this.gain) return;
    const target = SFX.muted ? 0 : this.vol * this.level;
    if (c.state === 'suspended' && !SFX.muted) c.resume && c.resume();
    if (this.want !== this.track){                              // cambio de pista: fundido cruzado (la anterior se apaga mientras entra la nueva)
      const old = this.gain, now = c.currentTime;
      old.gain.cancelScheduledValues(now); old.gain.setValueAtTime(old.gain.value, now); old.gain.linearRampToValueAtTime(0, now + 1.2);
      setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 2500);
      if (this.fileEl){ this.fileEl.pause(); this.fileEl = null; }
      this.gain = this.newGain();
      this.gain.gain.setValueAtTime(0, now + 0.05); this.gain.gain.linearRampToValueAtTime(target, now + 1.4);
      this.track = this.want; this.step = 0; this.nextT = now + 0.1;
      this.tempo = this.tempoNow();                        // el ritmo se recalcula al cambiar de pista (p. ej. al volver de vencer al boss)
      this.fading = now + 1.5;
    }
    if (this.files[this.track]){                                // archivo propio en bucle
      const f = this.files[this.track];
      if (this.fileEl !== f){ if (this.fileEl) this.fileEl.pause(); this.fileEl = f; f.currentTime = 0; f.play().catch(() => {}); }
      f.volume = Math.min(1, target * 0.4);
      return;
    }
    if (!(this.fading > c.currentTime) && Math.abs(this.gain.gain.value - target) > 0.001) this.gain.gain.setTargetAtTime(target, c.currentTime, 0.25);
    const S = this.SONGS[this.track], dt16 = 60 / (S.bpm * (this.track !== 'field' ? 1 + (this.tempo - 1) * 0.5 : this.tempo)) / 4;
    // si el juego se ha atascado (o la pestaña estaba en segundo plano) no se amontonan las notas atrasadas: se sigue a tempo
    if (this.nextT < c.currentTime - 0.08){ const miss = Math.ceil((c.currentTime - this.nextT) / dt16); this.step += miss; this.nextT += miss * dt16; }
    while (this.nextT < c.currentTime + 0.3){
      const loop = S.chords.length * 16;
      if (this.step % loop === 0 && this.step > 0) this.tempo = this.tempoNow();          // el ritmo solo cambia al empezar otra vuelta (sin saltos)
      this.playStep(S, this.step, this.nextT, dt16); this.nextT += dt16; this.step++;
    }
  },
  note(type, freq, t, dur, vol, cutoff){
    const c = SFX.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (cutoff){ const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; g.connect(f); f.connect(this.gain); }
    else g.connect(this.gain);
    o.start(t); o.stop(t + dur + 0.03);
  },
  swell(t, dur){                                            // ruido filtrado que sube (transición entre vueltas)
    const c = SFX.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (i / n);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    src.connect(f).connect(g).connect(this.gain); src.start(t); src.stop(t + dur + 0.08);
  },
  drum(kind, t, vol){
    const c = SFX.ctx;
    if (kind === 'kick'){ const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g).connect(this.gain); o.start(t); o.stop(t + 0.2); return; }
    const dur = kind === 'hat' ? 0.035 : kind === 'snare' ? 0.14 : 0.2, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = kind === 'hat' ? 'highpass' : kind === 'snare' ? 'bandpass' : 'lowpass'; f.frequency.value = kind === 'hat' ? 7000 : kind === 'snare' ? 1800 : 300;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.gain); src.start(t); src.stop(t + dur + 0.02);
  },
  playStep(S, step, t, dt16){
    const N = this.N, bar = Math.floor(step / 16) % S.chords.length, s16 = step % 16, chord = S.chords[bar];
    if (this.track === 'field'){
      if (s16 === 0) chord.forEach(n => this.note('triangle', N(n), t, dt16 * 15, 0.035, 1800));       // acorde suave de fondo
      if (s16 === 0 || s16 === 10) this.note('triangle', N(chord[0] - 12), t, dt16 * 5, 0.13);            // bajo
      if (s16 % 2 === 0) this.note('square', N(chord[(s16 / 2) % chord.length] + 12), t, dt16 * 1.6, 0.018, 2200);   // arpegio suave
      const m = S.melody[(step % 64) >> 1]; if (step % 2 === 0 && m && (Math.floor(step / 64) % 2 === 1)) this.note('sine', N(m), t, dt16 * 3, 0.05);   // melodía (una vuelta sí, otra no)
      const lastBar = bar === S.chords.length - 1;
      if (s16 === 0 || s16 === 8) this.drum('kick', t, 0.18);
      if (s16 === 4 || (s16 === 12 && !lastBar)) this.drum('snare', t, 0.05);
      if (s16 % 2 === 0) this.drum('hat', t, 0.025);
      if (lastBar && s16 >= 12){ this.drum('snare', t, 0.035 + 0.012 * (s16 - 12)); if (s16 === 12) this.swell(t, dt16 * 4); }   // redoble y subida suave que enlaza con la vuelta siguiente
      if (lastBar && s16 === 14) this.note('triangle', N(chord[0] - 12 + 2), t, dt16 * 2, 0.1);       // nota de paso del bajo hacia el primer acorde
    } else {
      if (s16 % 2 === 0) this.note(S.bass || 'sawtooth', N(chord[0] - 12 + (S.bass === 'square' && s16 % 4 === 2 ? 7 : 0)), t, dt16 * 1.7, 0.07, 900);   // bajo que empuja
      if (s16 === 0) chord.forEach(n => this.note('sawtooth', N(n), t, dt16 * 16, 0.03, 2600));           // acordes potentes
      { const L = chord.length, ai = S.arp === 'down' ? (L - 1 - s16 % L) : S.arp === 'trill' ? (s16 % 2 ? 0 : 1 + (s16 >> 1) % (L - 1)) : s16 % L;
        this.note('square', N(chord[ai] + 12 + (s16 >= 8 ? 12 : 0)), t, dt16 * 0.9, 0.022, 3500); }        // arpegio rápido (cada boss a su manera)
      const m = S.melody[(step % 64) >> 1]; if (step % 2 === 0 && m) this.note(S.lead || 'square', N(m), t, dt16 * 1.9, S.lead === 'triangle' ? 0.07 : 0.045, 4000);   // melodía de cada boss
      if ((S.kick || [0, 4, 8, 12]).includes(s16)) this.drum('kick', t, 0.25);
      if ((S.snare || [4, 12]).includes(s16)) this.drum('snare', t, 0.12);
      this.drum('hat', t, s16 % 2 ? 0.02 : 0.035);
      if (s16 >= 13 && bar === S.chords.length - 1) this.drum('tom', t, 0.15);                           // redoble al final de la vuelta
      if (s16 === 12 && bar === S.chords.length - 1) this.swell(t, dt16 * 4);
    }
  },
};
/* una canción distinta (y más rápida) para cada boss: tonalidad, acordes, melodía, sonido y batería propios */
(function makeBossSongs(){
  const mk = (bpm, chords, pat, rests, o) => {
    const melody = [];
    for (let i = 0; i < 32; i++){
      const ch = chords[Math.floor(i / 8) % chords.length], d = pat[i % pat.length];
      melody.push(rests.includes(i % 16) ? null : ch[d % ch.length] + 12 + (d >= ch.length ? 12 : 0) + (i >= 16 && i % 8 > 4 ? 12 : 0));
    }
    return Object.assign({ bpm, chords, melody, lead:'square', bass:'sawtooth', arp:'up', kick:[0, 4, 8, 12], snare:[4, 12] }, o);
  };
  const B = MUSIC.SONGS;
  B.boss0 = mk(160, [[52, 55, 59], [48, 52, 55], [45, 48, 52], [47, 51, 54]], [0, 2, 1, 2, 3, 2, 1, 0], [3, 11], { lead:'square', arp:'down', kick:[0, 6, 8, 14] });          // Talisman · Mi menor misterioso
  B.boss1 = mk(168, [[57, 61, 64], [55, 59, 62], [50, 54, 57], [57, 61, 64]], [0, 1, 2, 1, 0, 2, 3, 2], [7, 15], { lead:'sawtooth', arp:'up' });                            // Chicken · La rockero
  B.boss2 = mk(172, [[48, 51, 55], [44, 48, 51], [51, 55, 58], [46, 50, 53]], [0, 0, 2, 0, 1, 0, 3, 1], [5, 13], { lead:'square', arp:'trill', kick:[0, 3, 8, 11] });       // Feldt · Do menor tecno
  B.boss3 = mk(174, [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]], [2, 1, 0, 1, 2, 3, 2, 1], [4, 12], { lead:'triangle', arp:'up' });                            // Artist · Fa mayor pop
  B.boss4 = mk(178, [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], [0, 2, 3, 2, 1, 2, 0, 1], [6, 14], { lead:'sawtooth', arp:'down' });                          // Jude · Re menor épico
  B.boss5 = mk(180, [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], [0, 3, 2, 0, 1, 3, 2, 1], [2, 10], { lead:'square', arp:'trill', kick:[0, 8, 10] });          // Cloak · ninja pentatónico
  B.boss6 = mk(184, [[55, 59, 62], [48, 52, 55], [50, 54, 57], [55, 59, 62]], [0, 1, 2, 3, 2, 1, 0, 2], [7, 15], { lead:'triangle', bass:'square', arp:'up', kick:[0, 4, 8, 12], snare:[2, 6, 10, 14] });   // Greeny · country rápido
  B.boss7 = mk(188, [[47, 50, 54], [43, 47, 50], [45, 49, 52], [42, 46, 49]], [0, 0, 1, 0, 2, 0, 3, 2], [9], { lead:'sawtooth', arp:'down', kick:[0, 2, 4, 8, 10, 12] });  // Murdock · Si menor agresivo
  B.boss8 = mk(170, [[52, 56, 59], [47, 51, 54], [49, 52, 56], [45, 49, 52]], [2, 3, 2, 1, 0, 1, 2, 3], [3, 11], { lead:'triangle', arp:'up' });                            // Aphrodite · Mi mayor divino
  B.mark  = Object.assign({}, B.boss, { bpm: 194, lead:'square', bass:'sawtooth', arp:'up', kick:[0, 4, 8, 12], snare:[4, 12] });                                          // Mark Evans · la épica, a tope
  B.boss.bpm = 160;
})();
MUSIC.loadFiles();
/* ---- ajustes de sonido (se guardan en el navegador) ---- */
const AUDIO_KEY = 'ss_audio';
try { const a = JSON.parse(localStorage.getItem(AUDIO_KEY) || '{}'); if (a.sfx !== undefined) SFX.vol = a.sfx; if (a.music !== undefined) MUSIC.level = a.music; if (a.muted) SFX.muted = true; } catch (e) {}
function saveAudio(){ try { localStorage.setItem(AUDIO_KEY, JSON.stringify({ sfx: SFX.vol, music: MUSIC.level, muted: SFX.muted })); } catch (e) {} }
function syncSettingsUI(){
  const m = document.getElementById('vol-music'), f = document.getElementById('vol-sfx'), mu = document.getElementById('vol-mute');
  if (!m) return;
  m.value = Math.round(MUSIC.level * 100); f.value = Math.round(SFX.vol * 100); mu.checked = SFX.muted;
  document.getElementById('vol-music-val').textContent = m.value + '%'; document.getElementById('vol-sfx-val').textContent = f.value + '%';
}
function openSettings(){
  syncSettingsUI();
  if (match && !match.over && !match.paused) match.settingsPaused = true;
  document.getElementById('settings-overlay').classList.remove('hidden');
}
function closeSettings(){ document.getElementById('settings-overlay').classList.add('hidden'); }
(function initSettings(){
  const m = document.getElementById('vol-music'), f = document.getElementById('vol-sfx'), mu = document.getElementById('vol-mute');
  if (!m) return;
  m.oninput = () => { MUSIC.level = m.value / 100; syncSettingsUI(); saveAudio(); };
  f.oninput = () => { SFX.vol = f.value / 100; syncSettingsUI(); saveAudio(); };
  f.onchange = () => SFX.play('select');                      // se oye cómo suena con el volumen nuevo
  mu.onchange = () => { SFX.muted = mu.checked; saveAudio(); };
  for (const id of ['btn-settings', 'btn-settings-top', 'btn-settings-pause']){ const b = document.getElementById(id); if (b) b.onclick = openSettings; }
  document.getElementById('btn-settings-close').onclick = closeSettings;
  const legal = document.getElementById('legal-overlay');
  document.getElementById('btn-legal').onclick = () => legal.classList.remove('hidden');
  document.getElementById('btn-legal-close').onclick = () => legal.classList.add('hidden');
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !legal.classList.contains('hidden')){ e.stopImmediatePropagation(); legal.classList.add('hidden'); } }, true);
  document.getElementById('btn-wipe-save').onclick = () => {
    if (!confirm('¿Seguro que quieres borrar tu partida guardada (monedas, jugadores, mejoras y ajustes)? No se puede deshacer.')) return;
    try { Object.keys(localStorage).filter(k => k.startsWith('ss_')).forEach(k => localStorage.removeItem(k)); } catch (err) {}
    location.reload();
  };
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('settings-overlay').classList.contains('hidden') && document.getElementById('legal-overlay').classList.contains('hidden')){ e.stopImmediatePropagation(); closeSettings(); } }, true);
})();
// la música empieza con la primera interacción (los navegadores no dejan sonar antes)
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => MUSIC.start(), { once: false, passive: true }));
setInterval(() => {                                       // qué pista toca: épica durante el duelo contra el boss
  const boss = typeof match !== 'undefined' && match && !match.over && ((match.inArena && (bossAlive() || match.bossSpawn)) || !!match.mark);   // también contra Mark
  MUSIC.set(!boss ? 'field' : match.mark ? 'mark' : (MUSIC.SONGS['boss' + match.bossIdx] ? 'boss' + match.bossIdx : 'boss'));   // cada boss con su canción
}, 250);

/* relámpago: la pantalla parpadea en blanco y el partido empieza en el destello */
function lightningFlash(onPeak){
  const f = document.createElement('div');
  f.className = 'lightning-flash';
  document.body.appendChild(f);
  setTimeout(onPeak, 140);
  setTimeout(() => f.remove(), 900);
}
let playLock = false;
document.getElementById('btn-play').onclick = () => {
  const c = CHARACTERS.find(ch => ch.id === state.selected);
  if (!c || playLock) return;
  playLock = true;
  SFX.play('start');                                   // fanfarria + relámpago al empezar
  lightningFlash(() => { playLock = false; startMatch(c); });
};
document.getElementById('btn-roster').onclick = () => { renderRoster(); showScreen('roster'); };
document.getElementById('btn-back-title-1').onclick = () => showScreen('title');
document.getElementById('btn-back-title-2').onclick = () => showScreen('title');
document.getElementById('btn-back-title-3').onclick = () => { updateShowcase(); showScreen('title'); };
document.getElementById('btn-gameover-title').onclick = () => {
  document.getElementById('gameover-overlay').classList.add('hidden');
  updateShowcase();
  showScreen('title');
  refreshCoinBadges();
};

updateShowcase();

/* ---------------------- FONDO ANIMADO DE LA PANTALLA DE INICIO ----------------------
   Césped en píxeles (franjas de corte), calvas de tierra, líneas del campo gastadas,
   matas de hierba que se mecen con rachas de viento, sombras de nubes y hojas volando. */
const TITLE_BG = { px: 4, tuftEvery: 210, leaves: 14, fps: 30 };
const titleBg = { cv:null, g:null, base:null, tufts:[], leaves:[], w:0, h:0, last:0, raf:0 };
function initTitleBg(){
  const cv = document.getElementById('title-bg');
  if (!cv) return;
  titleBg.cv = cv; titleBg.g = cv.getContext('2d');
  buildTitleBg();
  window.addEventListener('resize', () => { buildTitleBg(); });
  const loop = (now) => {
    titleBg.raf = requestAnimationFrame(loop);
    if (screens.title.classList.contains('hidden')) return;      // solo mientras se ve la portada
    if (now - titleBg.last < 1000 / TITLE_BG.fps) return;
    titleBg.last = now;
    drawTitleBg(now / 1000);
  };
  titleBg.raf = requestAnimationFrame(loop);
}
function buildTitleBg(){
  const P = TITLE_BG.px;
  const w = Math.ceil(window.innerWidth / P), h = Math.ceil(window.innerHeight / P);
  titleBg.w = w; titleBg.h = h;
  titleBg.cv.width = w; titleBg.cv.height = h;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // capa fija: césped, tierra y líneas
  const base = document.createElement('canvas'); base.width = w; base.height = h;
  const g = base.getContext('2d');
  const bare = new Uint8Array(w * h);                                   // tierra y cal: ahí no crece hierba alta
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) bare[y * w + x] = 1; };
  const stripe = Math.max(10, Math.round(w / 14));
  for (let x = 0; x < w; x += stripe){
    g.fillStyle = (x / stripe) % 2 ? '#1b4a2e' : '#205536';
    g.fillRect(x, 0, stripe, h);
  }
  // ruido de hierba
  for (let i = 0; i < w * h * 0.10; i++){
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), r = rnd();
    g.fillStyle = r < 0.45 ? '#173f27' : r < 0.8 ? '#2a6640' : '#123522';
    g.fillRect(x, y, 1, 1);
  }
  // calvas de tierra (área pequeña, centro y una esquina)
  const dirt = (cx, cy, rx, ry) => {
    for (let k = 0; k < 4; k++){
      const ox = (rnd() - 0.5) * rx * 0.6, oy = (rnd() - 0.5) * ry * 0.6, kx = rx * (0.55 + rnd() * 0.4), ky = ry * (0.55 + rnd() * 0.4);
      for (let y = -ky; y <= ky; y++){
        const half = kx * Math.sqrt(Math.max(0, 1 - (y * y) / (ky * ky)));
        for (let x = -half; x <= half; x++){
          if (rnd() < 0.12) continue;                                 // borde irregular
          const edge = Math.abs(x) > half - 1.5 || Math.abs(y) > ky - 1.5;
          g.fillStyle = edge ? '#8a7a3e' : (rnd() < 0.25 ? '#a07a4a' : '#b48a55');
          g.fillRect(Math.round(cx + ox + x), Math.round(cy + oy + y), 1, 1);
          for (let m = -2; m <= 2; m++) mark(Math.round(cx + ox + x) + m, Math.round(cy + oy + y));
        }
      }
    }
    for (let k = 0; k < rx * ry * 0.06; k++) { g.fillStyle = rnd() < 0.5 ? '#7a5a34' : '#d1a873'; g.fillRect(Math.round(cx + (rnd() - 0.5) * rx * 1.4), Math.round(cy + (rnd() - 0.5) * ry * 1.4), 1, 1); }
  };
  // el centro del campo coincide con el personaje seleccionado
  let cx = Math.round(w * 0.5), cy = Math.round(h * 0.5);
  const box = document.querySelector('#screen-title .showcase-box');
  if (box && !screens.title.classList.contains('hidden')){
    const r = box.getBoundingClientRect();
    if (r.width){ cx = Math.round((r.left + r.width / 2) / P); cy = Math.round((r.top + r.height / 2) / P); }
  }
  const L = Math.round(w * 0.07);
  // líneas de cal gastadas
  const line = (x, y, lw, lh) => {
    for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++){
      if (rnd() < 0.08) continue;
      g.fillStyle = rnd() < 0.15 ? '#a9c2ae' : '#d3e2d4';
      g.fillRect(x + xx, y + yy, 1, 1);
      for (let m = -3; m <= 3; m++){ mark(x + xx + m, y + yy); mark(x + xx, y + yy + m); }
    }
  };
  const ring = (ox, oy, r, from = 0, to = Math.PI * 2) => {
    const n = Math.ceil(r * 7);
    for (let k = 0; k <= n; k++){
      const a = from + (to - from) * k / n;
      if (rnd() < 0.08) continue;
      const rx = Math.round(ox + Math.cos(a) * r), ry = Math.round(oy + Math.sin(a) * r);
      g.fillStyle = '#d3e2d4'; g.fillRect(rx, ry, 2, 1);
      for (let m = -3; m <= 3; m++){ mark(rx + m, ry); mark(rx, ry + m); }
    }
  };
  line(cx - 1, 0, 2, h);                                              // línea de medio campo
  ring(cx, cy, Math.round(h * 0.2));                                 // círculo central
  line(cx - 2, cy - 1, 4, 3);                                         // punto central
  line(L, 0, 2, h);                                                   // línea de banda izquierda (portería)
  const ah = Math.round(h * 0.56), ad = Math.round(w * 0.12), ay = Math.round(cy - ah / 2);
  line(L, ay, ad, 2); line(L, ay + ah, ad, 2); line(L + ad, ay, 2, ah + 2);   // área grande
  const sh = Math.round(h * 0.26), sd = Math.round(w * 0.045), sy = Math.round(cy - sh / 2);
  line(L, sy, sd, 2); line(L, sy + sh, sd, 2); line(L + sd, sy, 2, sh + 2);   // área pequeña
  { const ps = L + Math.round(ad * 0.7), pr = Math.round(ad * 0.55), cut = Math.acos((L + ad - ps) / pr);
    ring(ps, cy, pr, -cut, cut); }                                            // semicírculo del área (centrado en el penalti)
  line(L + Math.round(ad * 0.7), cy - 1, 2, 2);                                // punto de penalti
  ring(w + 1, h + 1, Math.round(h * 0.05), Math.PI, Math.PI * 1.5);           // córner
  // portería (detrás de la línea de fondo, con red)
  { const gh = Math.round(h * 0.16), gd = Math.max(5, Math.round(w * 0.022)), gx = L - gd, gy = Math.round(cy - gh / 2);
    g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(gx + 2, gy + 2, gd, gh);         // sombra
    g.fillStyle = 'rgba(220,230,235,0.35)'; g.fillRect(gx, gy, gd, gh);           // red
    g.fillStyle = 'rgba(40,60,50,0.55)';
    for (let k = 1; k < gh; k += 2) g.fillRect(gx, gy + k, gd, 1);
    for (let k = 1; k < gd; k += 2) g.fillRect(gx + k, gy, 1, gh);
    g.fillStyle = '#f2f5f2';
    g.fillRect(gx, gy - 1, gd + 1, 2); g.fillRect(gx, gy + gh - 1, gd + 1, 2);   // laterales
    g.fillRect(L - 1, gy - 1, 2, gh + 1);                                         // postes y larguero
    g.fillStyle = '#9fb0a6'; g.fillRect(gx, gy, 1, gh);                           // fondo de la red
    for (let y = gy - 3; y <= gy + gh + 3; y++) for (let x = gx - 3; x <= L + 3; x++) mark(x, y); }
  // florecillas y piedrecitas
  for (let i = 0; i < w * h / 900; i++){
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), r = rnd();
    if (r < 0.35){ g.fillStyle = r < 0.17 ? '#d9d3a8' : '#c9b04a'; g.fillRect(x, y, 1, 1); g.fillStyle = '#123522'; g.fillRect(x, y + 1, 1, 1); }
    else if (r < 0.55){ g.fillStyle = '#5f6b5c'; g.fillRect(x, y, 2, 1); g.fillStyle = '#3e4a3c'; g.fillRect(x, y + 1, 2, 1); }
  }
  titleBg.base = base;
  // matas de hierba alta que se mecen
  titleBg.tufts = [];
  const n = Math.round(w * h / TITLE_BG.tuftEvery);
  for (let i = 0; i < n; i++){
    const x = rnd() * w, y = rnd() * h;
    if (bare[Math.floor(y) * w + Math.floor(x)]) continue;
    const blades = [];
    const nb = 2 + Math.floor(rnd() * 3);
    for (let b = 0; b < nb; b++) blades.push({ dx: b - (nb - 1) / 2 + (rnd() - 0.5), len: 3 + Math.floor(rnd() * 4), lean: (rnd() - 0.5) * 1.2 });
    titleBg.tufts.push({ x, y, blades, ph: rnd() * Math.PI * 2, c: rnd() < 0.5 ? '#163d26' : '#1c4a2f', tip: rnd() < 0.5 ? '#3f8a55' : '#4b9a60' });
  }
  titleBg.tufts.sort((a, b) => a.y - b.y);
  titleBg.leaves = Array.from({ length: TITLE_BG.leaves }, () => ({ x: rnd() * w, y: rnd() * h, v: 6 + rnd() * 10, ph: rnd() * 6, c: rnd() < 0.5 ? '#5fae6a' : '#b59a3e' }));
}
function drawTitleBg(t){
  const { g, w, h } = titleBg;
  g.drawImage(titleBg.base, 0, 0);
  // sombras de nubes que pasan despacio
  g.fillStyle = 'rgba(0,15,6,0.16)';
  for (let k = 0; k < 3; k++){
    const cx = ((t * 4 + k * w * 0.45) % (w * 1.6)) - w * 0.3, cy = h * (0.2 + 0.3 * k);
    const rx = w * 0.16, ry = h * 0.12;
    for (let y = -ry; y <= ry; y += 1){
      const half = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      g.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1);
    }
  }
  // hierba: se mece con un vaivén suave + rachas de viento que cruzan la pantalla
  for (const tf of titleBg.tufts){
    const gust = Math.max(0, Math.sin(t * 0.9 - tf.x * 0.035)) ** 3;
    const sway = Math.sin(t * 2.2 + tf.ph) * 0.8 + gust * 2.6;
    for (const b of tf.blades){
      const bx = tf.x + b.dx, by = tf.y;
      for (let k = 0; k < b.len; k++){
        const f = k / b.len;
        const x = Math.round(bx + (b.lean + sway) * f * f * 1.6), y = Math.round(by - k);
        g.fillStyle = k >= b.len - 1 ? tf.tip : tf.c;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  // hojitas arrastradas por el viento
  for (const lf of titleBg.leaves){
    const x = (lf.x + t * lf.v) % (w + 10) - 5, y = (lf.y + Math.sin(t * 1.5 + lf.ph) * 4 + t * 2) % (h + 6) - 3;
    g.fillStyle = lf.c;
    g.fillRect(Math.round(x), Math.round(y), 2, 1);
    if (Math.sin(t * 6 + lf.ph) > 0) g.fillRect(Math.round(x) + 1, Math.round(y) - 1, 1, 1);
  }
  // viñeta para que el menú y el logo resalten
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,10,4,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

initTitleBg();

/* ---------------------- PANTALLA DE SELECCIÓN ---------------------- */
let chosenStarter = null;
function renderSelect(){
  const grid = document.getElementById('select-grid');
  grid.innerHTML = '';
  chosenStarter = state.unlocked[0];
  CHARACTERS.filter(c => state.unlocked.includes(c.id)).forEach(c => {
    const card = buildCard(c);
    card.onclick = () => {
      chosenStarter = c.id;
      [...grid.children].forEach(ch => ch.classList.remove('selected'));
      card.classList.add('selected');
    };
    if (c.id === chosenStarter) card.classList.add('selected');
    grid.appendChild(card);
  });
}
document.getElementById('btn-start-match').onclick = () => {
  startMatch(CHARACTERS.find(c => c.id === chosenStarter));
};

/* ---------------------- PANTALLA DE JUGADORES (estilo Pokédex de PokéSurvivor) ----------------------
   Arriba, una pestaña por equipo (con su escudo y cuántos tienes). A la izquierda, la cuadrícula con
   buscador, filtros y orden; a la derecha, la ficha del jugador elegido. Tocar a un jugador fichado
   y pulsar "Poner de titular" lo deja como titular. */
const POS_ORDER = ['GK', 'DF', 'MF', 'FW'];
const POS_LABEL = { GK:'Portero', DF:'Defensa', MF:'Centrocampista', FW:'Delantero' };
const POS_PROFILE = {
  GK:'Aguanta mucho y pega fuerte con las técnicas, pero es lento',
  DF:'Mucha vida y defensa, pero pega poco',
  MF:'El más rápido y el que mejor regatea',
  FW:'El que más daño hace con el disparo',
};
const SIZE_LABEL = { Small:'Pequeño', Medium:'Mediano', Large:'Grande' };
const SIZE_PROFILE = { Small:'más rápido y regatea más', Medium:'equilibrado', Large:'más vida y defensa, pero más lento' };
const ROSTER_STATS = [
  // clave, nombre, color de la barra, cómo se escribe el valor
  ['hp',    'Vida',          '#f6c84a', v => Math.round(v)],
  ['dmg',   'Ataque',        '#ff7a7a', v => v.toFixed(1)],
  ['spAtk', 'At. especial',  '#c48bff', v => v.toFixed(1)],
  ['def',   'Defensa',       '#6fdc8c', v => v.toFixed(1)],
  ['vel',   'Velocidad',     '#5ec8f2', v => Math.round(v)],
  ['dodge', 'Regate',        '#ffa94d', v => `${v.toFixed(1)} %`],
];
const rosterUI = { team:'all', search:'', element:'', pos:'', filter:'all', sort:'no', pick:null };

function isOwned(c){ return state.unlocked.includes(c.id); }
function teamOf(c){ return TEAM_BY_ID[c.team] || { name:c.team, color:'#4f8df0', crest:'' }; }
function crestImg(t, size){ return t && t.crest ? `<img class="rs-crest" src="${t.crest}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">` : ''; }

function rosterList(){
  const q = rosterUI.search.trim().toLowerCase();
  let list = CHARACTERS.filter(c => {
    if (rosterUI.team !== 'all' && c.team !== rosterUI.team) return false;
    if (rosterUI.element && (c.element || '') !== rosterUI.element) return false;
    if (rosterUI.pos && c.pos !== rosterUI.pos) return false;
    if (rosterUI.filter === 'owned' && !isOwned(c)) return false;
    if (rosterUI.filter === 'missing' && isOwned(c)) return false;
    if (RARITY_LABEL[rosterUI.filter] && c.rarity !== rosterUI.filter) return false;
    if (q && !(c.name.toLowerCase().includes(q) || (c.nick || '').toLowerCase().includes(q) || String(c.no).padStart(3, '0').includes(q))) return false;
    return true;
  });
  const by = {
    no:     (a, b) => a.no - b.no,
    name:   (a, b) => a.name.localeCompare(b.name),
    rarity: (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.no - b.no,
    pos:    (a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || a.no - b.no,
    hp:     (a, b) => b.hp - a.hp,
    dmg:    (a, b) => b.dmg - a.dmg,
  }[rosterUI.sort];
  return list.sort(by);
}

function renderRoster(){
  const owned = CHARACTERS.filter(isOwned).length;
  document.getElementById('rs-count').textContent = `${owned} / ${CHARACTERS.length}`;
  // pestañas de equipos
  const tabs = document.getElementById('rs-teams');
  tabs.innerHTML = '';
  const tabData = [{ id:'all', name:'Todos', crest:'' }, ...TEAMS];
  for (const t of tabData){
    const members = CHARACTERS.filter(c => t.id === 'all' || c.team === t.id);
    const have = members.filter(isOwned).length;
    const b = document.createElement('button');
    b.className = 'rs-tab' + (rosterUI.team === t.id ? ' active' : '');
    b.title = t.name;
    b.innerHTML = `${t.id === 'all' ? '<span class="rs-tab-all">⚽</span>' : crestImg(t, 30)}<b>${t.id === 'secundarios' ? 'Secundarios' : t.name}</b><small>${have}/${members.length}</small>`;
    b.onclick = () => { rosterUI.team = t.id; rosterUI.pick = null; renderRoster(); };
    tabs.appendChild(b);
  }
  // filtros (Todos / Tengo / Me faltan / rarezas)
  const chips = document.getElementById('rs-filters');
  chips.innerHTML = '';
  const filters = [['all', 'Todos'], ['owned', 'Tengo'], ['missing', 'Me faltan'], ...RARITY_ORDER.map(r => [r, RARITY_LABEL[r]])];
  for (const [id, label] of filters){
    const b = document.createElement('button');
    b.className = 'rs-chip' + (rosterUI.filter === id ? ' active' : '');
    b.innerHTML = RARITY_LABEL[id] ? `<i class="rs-dot rarity-${id}"></i>${label}` : label;
    b.onclick = () => { rosterUI.filter = id; renderRoster(); };
    chips.appendChild(b);
  }
  const sorts = document.getElementById('rs-sort');
  sorts.innerHTML = '';
  for (const [id, label] of [['no', 'Nº'], ['name', 'Nombre'], ['rarity', 'Rareza'], ['pos', 'Posición'], ['hp', 'Vida'], ['dmg', 'Ataque']]){
    const b = document.createElement('button');
    b.className = 'rs-chip' + (rosterUI.sort === id ? ' active' : '');
    b.textContent = label;
    b.onclick = () => { rosterUI.sort = id; renderRoster(); };
    sorts.appendChild(b);
  }
  // cuadrícula
  const list = rosterList();
  document.getElementById('rs-shown').textContent = `${list.length} jugadores`;
  const grid = document.getElementById('rs-grid');
  grid.innerHTML = '';
  if (!list.length) grid.innerHTML = '<p class="rs-empty">No hay jugadores con estos filtros.</p>';
  if (!rosterUI.pick || !list.some(c => c.id === rosterUI.pick)){
    const sel = list.find(c => c.id === state.selected);
    rosterUI.pick = (sel || list[0] || {}).id || null;
  }
  for (const c of list){
    const have = isOwned(c);
    const card = document.createElement('button');
    card.className = 'rs-card' + (have ? '' : ' locked') + (c.id === rosterUI.pick ? ' picked' : '') + (c.id === state.selected ? ' starter' : '');
    card.style.setProperty('--team', teamOf(c).color);
    card.innerHTML = `
      <span class="rs-no">${String(c.no).padStart(3, '0')}</span>
      ${c.id === state.selected ? '<span class="rs-star" title="Titular">★</span>' : ''}
      ${have ? '' : '<span class="rs-lock">🔒</span>'}
      ${hasShiny(c.id) ? `<span class="rs-shiny${shinyOn(c.id) ? ' on' : ''}" title="Tienes su cromático">✦</span>` : ''}
      <span class="rs-face">${charFace(lookOf(c), 56)}</span>
      <span class="rs-name">${c.name}</span>
      <span class="rs-meta"><i class="rs-dot rarity-${c.rarity}" title="${RARITY_LABEL[c.rarity]}"></i>${c.pos}</span>`;
    card.onclick = () => { rosterUI.pick = c.id; renderRoster(); };
    grid.appendChild(card);
  }
  renderRosterDetail();
}

function renderRosterDetail(){
  const box = document.getElementById('rs-detail');
  const c = CHARACTERS.find(ch => ch.id === rosterUI.pick);
  if (!c){ box.innerHTML = '<p class="rs-empty">Elige un jugador</p>'; return; }
  const t = teamOf(c), el = getElement(c.element), have = isOwned(c);
  const beats = (el.beats || []).map(k => getElement(k).name).join(' y ');
  const loses = ELEMENT_ORDER.filter(k => (ELEMENTS[k].beats || []).includes(c.element)).map(k => getElement(k).name).join(' y ');
  const bars = ROSTER_STATS.map(([k, label, color, fmt]) => {
    const v = c[k] || 0, pct = Math.max(3, Math.min(100, v / (STAT_MAX[k] || 1) * 100));
    return `<div class="rs-stat"><span>${label}</span><div class="rs-bar"><i style="width:${pct}%;background:${color}"></i></div><b>${fmt(v)}</b></div>`;
  }).join('');
  box.style.setProperty('--team', t.color);
  box.innerHTML = `
    <div class="rs-portrait${have ? '' : ' locked'}${shinyOn(c.id) ? ' shiny' : ''}">${charFace(lookOf(c), 210, 'rs-big')}</div>
    ${SHINY[c.id] ? `<div class="rs-look">
        <button class="rs-look-btn${!shinyOn(c.id) ? ' on' : ''}" data-look="0" ${have ? '' : 'disabled'}>Normal</button>
        <button class="rs-look-btn shiny${shinyOn(c.id) ? ' on' : ''}" data-look="1" ${hasShiny(c.id) ? '' : 'disabled'} title="${hasShiny(c.id) ? 'Jugar con su aspecto cromático' : 'Consíguelo en los sobres'}">✦ Cromático${hasShiny(c.id) ? '' : ' 🔒'}</button>
      </div>` : ''}
    <div class="rs-sub">Nº ${String(c.no).padStart(3, '0')} · ${crestImg(t, 20)} ${t.name}</div>
    <h3 class="rs-title">${c.name}</h3>
    <div class="rs-nick">«${c.nick || c.name}»</div>
    <div class="rs-tags">
      <span class="char-rarity rarity-${c.rarity}">${RARITY_LABEL[c.rarity]}</span>
      ${elementChip(c.element)}
    </div>
    <div class="rs-tags">
      <span class="rs-tag">${POS_LABEL[c.pos] || c.pos}</span>
      <span class="rs-tag">${SIZE_LABEL[c.size] || c.size}</span>
    </div>
    <div class="rs-stats">${bars}</div>
    ${have
      ? (c.id === state.selected
          ? '<button class="btn btn-secondary rs-action" disabled>★ Titular</button>'
          : '<button id="rs-set-starter" class="btn btn-primary rs-action">Poner de titular</button>')
      : '<button class="btn btn-ghost rs-action" disabled>🔒 Sin fichar</button>'}
    ${have ? '<button id="rs-upgrades" class="btn btn-secondary rs-action">⬆ Mejoras</button>' : ''}`;
  box.querySelectorAll('.rs-look-btn').forEach(b => b.onclick = () => {
    if (b.disabled) return;
    state.shinyOn[c.id] = b.dataset.look === '1'; saveState(); updateShowcase(); renderRoster();
  });
  const up = document.getElementById('rs-upgrades');
  if (up) up.onclick = () => { openUpgrades(c.id, 'roster'); };
  const b = document.getElementById('rs-set-starter');
  if (b) b.onclick = () => { state.selected = c.id; saveState(); updateShowcase(); renderRoster(); };
}

/* buscador y desplegables (se conectan una vez) */
(function bindRosterInputs(){
  const s = document.getElementById('rs-search');
  s.oninput = () => { rosterUI.search = s.value; renderRoster(); };
  const e = document.getElementById('rs-element');
  e.innerHTML = '<option value="">Todas las afinidades</option>' + ELEMENT_ORDER.map(k => `<option value="${k}">${ELEMENTS[k].name}</option>`).join('');
  e.onchange = () => { rosterUI.element = e.value; renderRoster(); };
  const p = document.getElementById('rs-pos');
  p.innerHTML = '<option value="">Todas las posiciones</option>' + POS_ORDER.map(k => `<option value="${k}">${POS_LABEL[k]}</option>`).join('');
  p.onchange = () => { rosterUI.pos = p.value; renderRoster(); };
})();

function elementChip(key){
  const el = getElement(key);
  return `<div class="char-element" style="--c:${el.color}">${elLabel(key, 16)}</div>`;
}
function buildCard(c){
  const div = document.createElement('div');
  div.className = 'char-card';
  div.innerHTML = `
    <div class="char-emoji">${charFace(lookOf(c), 56)}</div>
    <div class="char-name">${c.name}${shinyOn(c.id) ? ' <span class="rs-shiny on">✦</span>' : ''}</div>
    <div class="char-role">${c.role}</div>
    ${elementChip(c.element)}
    <div class="char-rarity rarity-${c.rarity}">${RARITY_LABEL[c.rarity]}</div>
  `;
  return div;
}

/* ---------------------- GACHA: SOBRES DE FICHAJES ----------------------
   Dos sobres. Se abren con su ticket (amarillo o morado) o con monedas.
   - Sobre dorado: 5 cartas, épicos y legendarios casi imposibles.
   - Sobre épico:  7 cartas, mucha más suerte y la última carta es épica o legendaria.
   Al abrirlo se enseñan las cartas de una en una (haciendo clic) y la más rara sale la última.
   Los jugadores repetidos se convierten en monedas. */
const PACKS = {
  // de menos a más: 1 jugador (dorado) → 3 jugadores (azul) → 5 jugadores (épico), cada vez con más suerte
  yellow: { name:'Sobre dorado', ticket:'yellow', tickets:1, cards:1, coins:150,
            weights:{ common:63, uncommon:27, rare:9.3, epic:0.6, legendary:0.1 } },
  blue:   { name:'Sobre azul',   ticket:'yellow', tickets:3, cards:3, coins:600,
            weights:{ common:46, uncommon:33, rare:18.1, epic:2.5, legendary:0.4 },
            last:{ rare:92, epic:7.5, legendary:0.5 } },             // la última carta del azul: rara o mejor
  purple: { name:'Sobre épico',  ticket:'purple', tickets:1, cards:5, coins:2200,
            weights:{ common:26, uncommon:31, rare:31.5, epic:10, legendary:1.5 },
            last:{ epic:94, legendary:6 } },                       // la última carta del épico: épica o legendaria
};
const PACK_KINDS = ['yellow', 'blue', 'purple'];
const PACK_SHINY = { yellow: 0.005, blue: 0.01, purple: 0.025 };    // probabilidad de que una carta (con cromático) salga cromática
const SHINY_DUPE_MULT = 3;                                          // un cromático repetido vale el triple de monedas
const PACK_FACES = ['mark', 'axel', 'jude'];                        // los tres sobres para elegir
const PACK_FACE_NAME = { mark:'Mark', axel:'Axel', jude:'Jude' };
const PACK_LAST_TXT = { blue:'★ Última carta: rara o mejor', purple:'★ Última carta: épica o legendaria' };
const DUPE_COINS = { common:5, uncommon:10, rare:25, epic:60, legendary:150 };   // monedas por jugador repetido
const RARITY_RANK = { common:0, uncommon:1, rare:2, epic:3, legendary:4 };
function rollRarity(weights = RARITY_WEIGHTS){
  const total = Object.values(weights).reduce((a,b)=>a+b,0);
  let r = Math.random() * total;
  for (const [rarity, w] of Object.entries(weights)){
    if (r < w) return rarity;
    r -= w;
  }
  return 'common';
}
function pullOne(weights){
  const rarity = rollRarity(weights);
  let pool = CHARACTERS.filter(c => c.rarity === rarity);
  if (!pool.length) pool = CHARACTERS;
  return pool[Math.floor(Math.random() * pool.length)];
}
/* saca las cartas de un sobre y las guarda (la de más rareza, al final) */
function openPackCards(kind){
  const P = PACKS[kind], list = [];
  for (let i = 0; i < P.cards; i++) list.push(pullOne(P.last && i === P.cards - 1 ? P.last : P.weights));
  const cards = list.map(c => ({ c, shiny: !!SHINY[c.id] && Math.random() < PACK_SHINY[kind] }));
  // la más rara al final (un cromático cuenta como algo más que su rareza)
  cards.sort((a, b) => (RARITY_RANK[a.c.rarity] + (a.shiny ? 0.5 : 0)) - (RARITY_RANK[b.c.rarity] + (b.shiny ? 0.5 : 0)));
  const seen = new Set();
  return cards.map(({ c, shiny }) => {
    const key = (shiny ? 's:' : '') + c.id;
    const dupe = shiny ? (hasShiny(c.id) || seen.has(key)) : (state.unlocked.includes(c.id) || seen.has(key));
    seen.add(key);
    const coins = dupe ? DUPE_COINS[c.rarity] * (shiny ? SHINY_DUPE_MULT : 1) : 0;
    if (shiny && !dupe){ state.shiny.push(c.id); if (!state.unlocked.includes(c.id)) state.unlocked.push(c.id); }
    else if (!dupe) state.unlocked.push(c.id);
    state.coins += coins;
    return { c, dupe, shiny, coins };
  });
}
function ticketsOf(kind){ return PACKS[kind].ticket === 'purple' ? state.ticketsEpic : state.tickets; }
function buyPack(kind, withTicket){
  const P = PACKS[kind];
  if (withTicket){
    const tn = P.ticket === 'purple' ? 'ticket morado' : 'ticket amarillo';
    if (ticketsOf(kind) < P.tickets) return packMsg(`Necesitas ${P.tickets} ${tn}${P.tickets > 1 ? 's' : ''}. Los sueltan los bosses y, a veces, algunos rivales.`);
    if (P.ticket === 'purple') state.ticketsEpic -= P.tickets; else state.tickets -= P.tickets;
  } else {
    if (state.coins < P.coins) return packMsg(`Te faltan monedas: el ${P.name.toLowerCase()} cuesta ${P.coins} ${COIN_HTML}`);
    state.coins -= P.coins;
  }
  const cards = openPackCards(kind);
  saveState(); refreshCoinBadges(); updateShowcase();
  choosePack(kind, cards);
}
function packMsg(html){
  const m = document.getElementById('pack-msg');
  m.innerHTML = html; m.classList.remove('hidden');
  clearTimeout(packMsg.t); packMsg.t = setTimeout(() => m.classList.add('hidden'), 2600);
}
function renderGacha(){
  for (const k of PACK_KINDS) document.getElementById(`pack-${k}-tk`).textContent = ticketsOf(k);
  document.getElementById('shop-coins').textContent = state.coins;
  document.getElementById('shop-tk-y').textContent = state.tickets;
  document.getElementById('shop-tk-p').textContent = state.ticketsEpic;
  for (const k of PACK_KINDS){
    document.getElementById(`btn-pack-${k}-tk`).disabled = ticketsOf(k) < PACKS[k].tickets;
    document.getElementById(`btn-pack-${k}-coin`).disabled = state.coins < PACKS[k].coins;
  }
}
/* carta de un jugador (cara, nombre, equipo, afinidad y rareza) */
function packCardHtml(c, dupe, shiny, coins){
  const t = TEAM_BY_ID[c.team] || {};
  return `<div class="pk-card rar-${c.rarity}${shiny ? ' shiny' : ''}" style="--rar:${RARITY_COLOR[c.rarity]}">
      <div class="pk-card-top"><span class="pk-rar">${RARITY_LABEL[c.rarity]}</span>${t.crest ? `<img class="pk-crest" src="${t.crest}" alt="">` : ''}</div>
      ${shiny ? '<div class="pk-shiny-tag">✦ CROMÁTICO ✦</div>' : ''}
      <div class="pk-face">${charFace(lookOf(c, !!shiny), 120)}</div>
      <div class="pk-name">${c.name}</div>
      <div class="pk-meta">${elLabel(c.element, 14)} · ${c.pos}</div>
      <div class="pk-tag ${dupe ? 'dupe' : 'new'}">${dupe ? `Repetido · +${coins ?? DUPE_COINS[c.rarity]} ${COIN_HTML}` : shiny ? '¡NUEVO CROMÁTICO!' : '¡NUEVO!'}</div>
    </div>`;
}
/* después de pagar: eliges uno de los tres sobres (Mark, Axel o Jude). Dan lo mismo: es para elegir el que más te guste */
function choosePack(kind, cards){
  const ov = document.getElementById('pack-open');
  packView = { kind, cards, idx: -1, stage: 'choose' };
  ov.className = `pack-open pk-${kind}`;
  ov.innerHTML = `<h3 class="po-title">Elige tu sobre</h3>
    <div class="po-choose">${PACK_FACES.map(f => `<button class="po-pick" data-face="${f}">
        <div class="pk-pack pk-${kind}">${packArt(kind, f)}</div><b>${PACK_FACE_NAME[f]}</b></button>`).join('')}</div>
    <p class="po-hint">Elige el que más te guste</p>`;
  ov.onclick = null;
  ov.querySelectorAll('.po-pick').forEach(b => b.onclick = e => {
    e.stopPropagation();
    b.classList.add('picked'); ov.querySelectorAll('.po-pick').forEach(o => { if (o !== b) o.classList.add('gone'); });
    SFX.play && SFX.play('click');
    setTimeout(() => startPackOpening(kind, cards, b.dataset.face), 420);
  });
}
/* animación: el sobre tiembla, se rasga y se van mostrando las cartas al hacer clic */
let packView = null;
function startPackOpening(kind, cards, face){
  const ov = document.getElementById('pack-open');
  packView = { kind, cards, idx: -1, stage: 'pack', face };
  ov.className = `pack-open pk-${kind}`;
  ov.innerHTML = `<div class="po-pack pk-pack pk-${kind} shake"><div class="pk-tear"></div>${packArt(kind, face)}
      <div class="pk-cutzone"><div class="pk-cutguide"></div><div class="pk-cutline"></div><div class="pk-scissors">✂</div></div></div>
    <p class="po-hint">Mantén pulsado y desliza por la línea de arriba para cortar el sobre</p>`;
  ov.onclick = advancePack;
  bindPackCut(ov.querySelector('.po-pack'));
  SFX.play && SFX.play('chest');
}
/* cortar el sobre: mantén pulsado el ratón (o el dedo) y deslízalo de lado a lado por la línea de arriba */
const PACK_CUT_NEEDED = 0.72;              // parte del ancho que hay que recorrer para abrirlo
function bindPackCut(pack){
  const zone = pack.querySelector('.pk-cutzone'), line = pack.querySelector('.pk-cutline'), sc = pack.querySelector('.pk-scissors');
  let cut = null;
  const relX = e => { const r = pack.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  const relY = e => { const r = pack.getBoundingClientRect(); return (e.clientY - r.top) / r.height; };
  pack.addEventListener('pointerdown', e => {
    if (!packView || packView.stage !== 'pack') return;
    if (relY(e) > 0.38) return;                                    // hay que empezar por la parte de arriba
    e.preventDefault(); e.stopPropagation();
    pack.setPointerCapture && pack.setPointerCapture(e.pointerId);
    const x = relX(e); cut = { min: x, max: x, last: x };
    pack.classList.remove('shake'); pack.classList.add('cutting');
  });
  pack.addEventListener('pointermove', e => {
    const x = relX(e);
    sc.style.left = `${x * 100}%`;
    if (!cut || !packView || packView.stage !== 'pack') return;
    cut.min = Math.min(cut.min, x); cut.max = Math.max(cut.max, x);
    line.style.left = `${cut.min * 100}%`; line.style.width = `${(cut.max - cut.min) * 100}%`;
    if (Math.abs(x - cut.last) > 0.06){ cut.last = x; SFX.play && SFX.play('step'); }
    if (cut.max - cut.min >= PACK_CUT_NEEDED){ cut = null; line.style.left = '0'; line.style.width = '100%'; advancePack(); }
  });
  const stop = e => {
    if (!cut) return;
    cut = null; pack.classList.remove('cutting'); pack.classList.add('shake');
    line.style.width = '0';                                        // si no llegas al otro lado, el corte se cierra
  };
  pack.addEventListener('pointerup', stop); pack.addEventListener('pointercancel', stop);
  pack.addEventListener('click', e => e.stopPropagation());       // el sobre no se abre con un simple clic
}
function advancePack(){
  const ov = document.getElementById('pack-open'), v = packView;
  if (!v) return;
  if (v.stage === 'pack'){
    if (!v.cutOk && !v.byKey && ov.querySelector('.po-pack .pk-cutline')?.style.width !== '100%') return;   // hay que cortarlo
    v.stage = 'tearing';
    ov.querySelector('.po-pack').classList.remove('shake');
    ov.querySelector('.po-pack').classList.add('torn');
    SFX.play && SFX.play('upgrade');
    setTimeout(() => { v.stage = 'cards'; v.idx = -1; advancePack(); }, 650);
    return;
  }
  if (v.stage === 'tearing') return;
  if (v.stage === 'suspense'){ skipSuspense(); return; }  // clic durante la tensión: se descubre ya
  if (v.stage === 'cards'){
    v.idx++;
    if (v.idx >= v.cards.length){ showPackSummary(); return; }
    const { c, dupe, shiny, coins } = v.cards[v.idx], last = v.idx === v.cards.length - 1;
    if (last && !v.suspenseDone && v.cards.length > 1){ v.idx--; lastCardSuspense(); return; }
    ov.innerHTML = `<div class="po-count">${v.idx + 1} / ${v.cards.length}</div>
      <div class="po-stage">
        <div class="po-left">${v.cards.length - v.idx - 1 > 0 ? `<div class="po-stack">${'<i></i>'.repeat(Math.min(5, v.cards.length - v.idx - 1))}</div><small>Quedan ${v.cards.length - v.idx - 1}</small>` : ''}</div>
        <div class="po-flip ${RARITY_RANK[c.rarity] >= 3 || shiny ? 'big' : ''}${last ? ' final' : ''}">${packCardHtml(c, dupe, shiny, coins)}</div>
      </div>
      <p class="po-hint">${last ? 'Haz clic para ver el resumen' : 'Haz clic para la siguiente carta'}</p>`;
    if (last && v.cards.length > 1){ ov.classList.add('flash', 'final-reveal'); if (shiny) ov.classList.add('shiny-reveal'); setTimeout(() => ov.classList.remove('flash'), 600); return; }
    if (RARITY_RANK[c.rarity] >= 3 || shiny){ SFX.play && SFX.play('upgrade'); ov.classList.add('flash'); setTimeout(() => ov.classList.remove('flash'), 500); }
    return;
  }
  if (v.stage === 'summary'){ closePack(); }
}
/* la última carta (la mejor): boca abajo, tiembla y brilla cada vez más del color de su rareza, y estalla */
function lastCardSuspense(){
  const ov = document.getElementById('pack-open'), v = packView;
  const x = v.cards[v.cards.length - 1], col = x.shiny ? '#ffffff' : RARITY_COLOR[x.c.rarity];
  v.stage = 'suspense';
  ov.innerHTML = `<div class="po-count">¡Última carta!</div>
    <div class="po-suspense${x.shiny ? ' shiny' : ''}" style="--rar:${col}">
      <div class="po-rays"></div>
      <div class="pk-back"><div class="pk-back-logo"></div></div>
    </div>
    <p class="po-hint">Haz clic para descubrirla ya</p>`;
  SFX.play && SFX.play('chest');
  const tense = RARITY_RANK[x.c.rarity] >= 3 || x.shiny;
  const T = tense ? [900, 2000, 3200] : [800, 1700, 2400];       // cuanto mejor la carta, más dura la tensión
  v.timers = [
    setTimeout(() => { const el = ov.querySelector('.po-suspense'); el && el.classList.add('s2'); SFX.play && SFX.play('step'); }, T[0]),
    setTimeout(() => { const el = ov.querySelector('.po-suspense'); el && el.classList.add('s3'); SFX.play && SFX.play(tense ? 'ult_ready' : 'step'); }, T[1]),
    setTimeout(() => revealLast(tense), T[2]),
  ];
}
function revealLast(tense){
  const v = packView; if (!v || v.stage !== 'suspense') return;
  (v.timers || []).forEach(clearTimeout); v.timers = null;
  v.stage = 'cards'; v.suspenseDone = true; advancePack(); SFX.play && SFX.play(tense ? 'thunder' : 'upgrade');
}
/* saltar la animación de la última carta */
function skipSuspense(){
  const v = packView; if (!v || v.stage !== 'suspense') return;
  const x = v.cards[v.cards.length - 1];
  revealLast(RARITY_RANK[x.c.rarity] >= 3 || x.shiny);
}
function showPackSummary(){
  const ov = document.getElementById('pack-open'), v = packView;
  v.stage = 'summary';
  const nNew = v.cards.filter(x => !x.dupe).length, coins = v.cards.reduce((a, x) => a + (x.coins || 0), 0);
  ov.innerHTML = `<h3 class="po-title">${PACKS[v.kind].name}</h3>
    <p class="po-sum">${nNew} jugador${nNew === 1 ? '' : 'es'} nuevo${nNew === 1 ? '' : 's'}${coins ? ` · repetidos: +${coins} ${COIN_HTML}` : ''}</p>
    <div class="po-grid">${v.cards.map(x => packCardHtml(x.c, x.dupe, x.shiny, x.coins)).join('')}</div>
    <button class="btn btn-primary po-close">Continuar</button>`;
  ov.querySelector('.po-close').onclick = e => { e.stopPropagation(); closePack(); };
}
function closePack(){
  const ov = document.getElementById('pack-open');
  ov.className = 'pack-open hidden'; ov.innerHTML = ''; packView = null;
  if (typeof renderRoster === 'function' && !screens.roster.classList.contains('hidden')) renderRoster();
  renderGacha();
  if (welcomeQueue) setTimeout(nextWelcomePack, 250);                 // regalo de bienvenida: el siguiente sobre
}
/* ---- BIENVENIDA: los jugadores nuevos reciben 3 sobres de regalo (dorado, súper y épico) ---- */
const WELCOME_KINDS = ['yellow', 'blue', 'purple'];
let welcomeQueue = null;
(function welcomeGift(){
  let seen = null; try { seen = localStorage.getItem('ss_welcome'); } catch (e) {}
  if (seen || state.unlocked.length) return;
  // se abren ya (así nunca te quedas sin jugadores aunque cierres el juego a medias) y luego se enseñan con su animación
  welcomeQueue = WELCOME_KINDS.map(k => ({ kind: k, cards: openPackCards(k) }));
  const best = state.unlocked.map(id => CHARACTERS.find(c => c.id === id)).filter(Boolean)
    .sort((a, b) => (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0))[0];
  if (best) state.selected = best.id;
  saveState(); updateShowcase(); refreshCoinBadges();
  setTimeout(showWelcome, 300);
})();
function showWelcome(){
  const ov = document.createElement('div');
  ov.className = 'overlay welcome-ov'; ov.id = 'welcome-overlay';
  ov.innerHTML = `<div class="overlay-box welcome-box"><h3>¡Bienvenido!</h3>
    <p>Para empezar tu equipo te regalamos <b>3 sobres</b>: uno <b>dorado</b>, uno <b>súper</b> y uno <b>épico</b>.</p>
    <div class="welcome-packs">${WELCOME_KINDS.map(k => `<div class="pk-pack pk-${k}">${packArt(k)}</div>`).join('')}</div>
    <p class="welcome-sub">Con los jugadores que te toquen podrás empezar a jugar. Consigue más en la Tienda.</p>
    <button class="btn btn-primary" id="btn-welcome">¡Abrir mis sobres!</button></div>`;
  document.body.appendChild(ov);
  document.getElementById('btn-welcome').onclick = () => { ov.remove(); renderGacha(); showScreen('gacha'); nextWelcomePack(); };
}
function nextWelcomePack(){
  const w = welcomeQueue && welcomeQueue.shift();
  if (!w){ welcomeQueue = null; try { localStorage.setItem('ss_welcome', '1'); } catch (e) {} updateShowcase(); refreshCoinBadges(); showScreen('title'); return; }
  choosePack(w.kind, w.cards);
}

/* dibujo del sobre (HTML + CSS en estilo pixel) */
function packArt(kind, face){
  return `<div class="pk-shine"></div>
    <div class="pk-band"><img class="pk-logo-img" src="assets/logo.png" alt="Inazuma Survivor" draggable="false"></div>
    <div class="pk-title"><b>${kind === 'purple' ? 'ÉPICO' : kind === 'blue' ? 'SÚPER' : 'FICHAJE'}</b></div>
    <div class="pk-count">${PACKS[kind].cards} jugador${PACKS[kind].cards > 1 ? 'es' : ''}</div>
    ${face ? `<div class="pk-char-wrap"><div class="pk-burst"></div><img class="pk-char" src="assets/packs/${face}.png" alt="" draggable="false"></div>` : ''}`;
}
document.getElementById('btn-gacha').onclick = () => { renderGacha(); showScreen('gacha'); };
/* tabla de probabilidades de cada sobre (por carta) */
for (const k of PACK_KINDS){
  const W = PACKS[k].weights, tot = Object.values(W).reduce((a, b) => a + b, 0);
  document.getElementById(`pack-${k}-odds`).innerHTML = ['legendary', 'epic', 'rare', 'uncommon', 'common'].map(r => {
    const pct = W[r] / tot * 100;
    return `<li><i style="background:${RARITY_COLOR[r]}"></i><span>${RARITY_LABEL[r]}</span><b>${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%</b></li>`;
  }).join('') + (PACK_LAST_TXT[k] ? `<li class="odds-last">${PACK_LAST_TXT[k]}</li>` : '');
}
document.querySelectorAll('.shop-sign-ico').forEach(i => { i.src = PX_ICON_URL.m_packs; });
document.querySelectorAll('.shop-coin-ico').forEach(i => { try { i.src = COIN_SPRITE.toDataURL(); } catch (e) {} });
document.querySelectorAll('.tk-y, #tk-ico-y').forEach(i => { i.src = PX_ICON_URL.ticketY; });
document.querySelectorAll('.tk-p, #tk-ico-p').forEach(i => { i.src = PX_ICON_URL.ticketP; });
for (const k of PACK_KINDS){
  document.getElementById(`pack-${k}-art`).innerHTML = packArt(k);
  document.getElementById(`btn-pack-${k}-tk`).onclick = () => buyPack(k, true);
  document.getElementById(`btn-pack-${k}-coin`).onclick = () => buyPack(k, false);
  document.getElementById(`btn-pack-${k}-coin`).innerHTML = `Comprar · ${PACKS[k].coins} ${COIN_HTML}`;
}
document.addEventListener('keydown', e => { if (packView && (e.key === ' ' || e.key === 'Enter')){ e.preventDefault(); packView.byKey = true; advancePack(); } });

/* ======================================================================
   PARTIDA — bucle de juego estilo "survivor"
   ====================================================================== */
const canvas = document.getElementById('game-canvas');
let ctx = canvas.getContext('2d');
const ctxMain = ctx;
/* capa "arcade": las supertécnicas se dibujan a media resolución y se amplían
   sin suavizado, para que tengan aspecto de píxel como el resto del juego */
const FX_PIXEL = 3;
const fxCanvas = document.createElement('canvas');
const fxCtx = fxCanvas.getContext('2d');
function pxBegin(){
  const w = Math.max(1, Math.ceil(W / FX_PIXEL)), h = Math.max(1, Math.ceil(H / FX_PIXEL));
  if (fxCanvas.width !== w || fxCanvas.height !== h){ fxCanvas.width = w; fxCanvas.height = h; }
  fxCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxCtx.clearRect(0, 0, w, h);
  fxCtx.setTransform(1 / FX_PIXEL, 0, 0, 1 / FX_PIXEL, 0, 0);
  fxCtx.globalAlpha = 1; fxCtx.globalCompositeOperation = 'source-over';
  ctx = fxCtx;
}
function pxEnd(){
  ctx = ctxMain;
  if (!fxCanvas.width || !fxCanvas.height) return;       // lienzo sin tamaño (pantalla oculta): nada que copiar
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fxCanvas, 0, 0, fxCanvas.width * FX_PIXEL, fxCanvas.height * FX_PIXEL);
  ctx.imageSmoothingEnabled = true;
}
let W, H;
function resizeCanvas(){
  W = canvas.width = canvas.clientWidth;
  H = canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
// El campo se reajusta cuando el panel de estadísticas se abre o se cierra
new ResizeObserver(resizeCanvas).observe(document.getElementById('game-stage'));

let match = null; // objeto con todo el estado de la partida activa
let rafId = null;

function startMatch(charDef){
  canvas.classList.remove('dead-bw'); document.getElementById('screen-game').classList.remove('dead-bw');
  if (typeof hideVsIntro === 'function') hideVsIntro();
  if (rafId) cancelAnimationFrame(rafId);
  charDef = lookOf(charDef);                    // cromático si lo tiene puesto
  if (charDef) sheetImage(charDef.sprite); for (const k of Object.keys(KIT_SHEETS)) preloadKit(k); preloadBossSheets();
  preloadHeads([charDef && charDef.id, 'referee', 'willy', 'kappah', ...Object.keys(OUTFITS)]);
  showScreen('game');
  resizeCanvas();
  document.getElementById('levelup-overlay').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  lastBuffHtml = null;
  document.getElementById('boss-bar').classList.add('hidden');
  spawnTimer = 0;
  moveVec.x = 0; moveVec.y = 0;
  match = {
    char: charDef,
    x: FIELD_W / 2, y: FIELD_H / 2,   // el jugador arranca en el centro del campo
    aim: { x:1, y:0 },                // última dirección de movimiento
    hp: charDef.hp, maxHp: charDef.hp,
    dmg: charDef.dmg, atkSpeed: charDef.atkSpeed,
    range: charDef.range * START_RANGE_MULT,
    speed: charDef.speed,
    def: charDef.def || 0,      // % de daño que se reduce
    crit: 5, critMult: 2,       // prob. de crítico (%) y multiplicador
    dodge: charDef.dodge || 0,  // % de esquivar un golpe (regate, sale del Excel)
    multishot: 1,               // proyectiles por disparo
    xpMult: 1,                  // multiplicador de experiencia
    pickup: BASE_PICKUP,        // radio del imán de recogida
    upgrades: {},               // id de mejora -> nivel actual
    texts: [],                  // textos flotantes (críticos, esquives)
    level: 1, xp: 0, xpNext: psXpFor(1),
    coinsEarned: 0,
    ticketsEarned: 0,           // tickets amarillos recogidos en este partido
    ticketsEpicEarned: 0,       // tickets morados
    obstacles: buildFieldObstacles(),   // rocas, conos, neumáticos, hierbajos, barro y plátanos
    slip: null, slipCdUntil: 0, // resbalón con un plátano
    nextSpecialAt: {},          // cuándo intenta salir cada rival especial
    waveTime: 0, wave: 1,
    enemies: [], projectiles: [], gems: [], effects: [], bolts: [], bombs: [],
    atkCooldown: 0,
    element: ELEMENTS[charDef.element] ? charDef.element : null,
    techs: [],                  // hasta 2: { kind, lvl, charge }
    activeTech: 0,              // índice de la supertécnica en uso (0 = Q, 1 = E)
    orbAngle: 0, orbAngle2: 0, rainCd: 1.5, orbitBoostUntil: 0, orbitBoostExtra: 0,
    meleeCd: 0.6, meleeQueue: [], slashes: [], flurry: null,   // golpe cercano (ráfagas)
    breath: null,               // bocanada de balones (definitiva penetrante)
    patches: [],                // suelo ardiendo (definitiva de rebote)
    triangles: [],              // marca del triángulo (definitiva de lluvia)
    items: [],                  // objetos en el suelo
    buffs: { water:0, nectar:0 },   // instante (elapsed) en que acaba cada efecto
    menuOpen: false,            // menú de pausa abierto
    enemyShots: [],             // proyectiles de los bosses
    bossIdx: 0,                 // siguiente boss de la lista
    bossesBeaten: 0,
    talents: [],                // hasta 2: { key, lvl }
    notebook: null,             // cuaderno en el suelo tras vencer a un boss
    nextRefAt: BOSSES[0].minute * 60 + Math.random() * 40,
    referee: null,              // { x, y } cuando está en el campo
    bossSpawn: null,            // aviso antes de que salga el boss
    boss: null,                 // boss vivo
    inArena: false,             // true durante el duelo en el campo pequeño
    saved: null,                // lo que se deja congelado en el campo grande
    rocks: [], cracks: [],      // obstáculos y grietas del campo del duelo
    arenaExitAt: 0,             // cuándo se vuelve al campo grande tras ganar
    fade: 0,                    // fundido a negro al teletransportarse
    banner: null,
    levelupChoices: null,
    paused: false, over: false,
    elapsed: 0,
    clockT: 0,                  // reloj de partido (se para con el árbitro y en los duelos)
    keys: {},
  };
  applyMeta(match, charDef.id);
  match.charDef = charDef;
  // PokéSurvivor: los movimientos especiales pegan según el At. especial (los disparos básicos, según el daño)
  match.spRatio = Math.max(0.6, Math.min(1.6, ((charDef.spAtk || charDef.dmg * SP_AVG) / Math.max(1, charDef.dmg)) / SP_AVG));              // mejoras permanentes de este jugador
  match.base = { maxHp: match.maxHp, dmg: match.dmg, atkSpeed: match.atkSpeed, range: match.range,
                 speed: match.speed, def: match.def, crit: match.crit, critMult: match.critMult,
                 dodge: match.dodge, multishot: match.multishot, pickup: match.pickup, xpMult: match.xpMult };
  initStatsPanel(charDef);
  for (let k = 0; k < SPAWN.startBurst; k++) spawnEnemy();   // ya hay rivales desde el saque
  renderInventory();
  document.getElementById('tech-bar').style.setProperty('--el', getElement(match.element).color);
  renderTechBar();
  updateHud();
  document.getElementById('hud-portrait').innerHTML = charFace(charDef, 76);
  bindControls();
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
}

/* ---- controles: teclado + joystick táctil ---- */
let moveVec = { x:0, y:0 };
function bindControls(){
  window.onkeydown = e => {
    const key = e.key.toLowerCase();
    if (key === 'tab') e.preventDefault();
    // las teclas de movimiento se registran SIEMPRE (también con un menú de subida de nivel abierto):
    // así, al elegir la mejora, el personaje sigue andando con la tecla que ya tenías pulsada, sin trabarse
    if (MOVE_KEYS.includes(key)) match.keys[key] = true;
    // Subida de nivel: 1, 2 o 3 eligen la mejora correspondiente
    if (match.levelupChoices){
      const talentOpen = !document.getElementById('talent-overlay').classList.contains('hidden');
      if (talentOpen && !e.repeat && (key === 'escape' || key === 'enter') && !document.getElementById('btn-talent-reject').classList.contains('hidden')){ SFX.closeAs = 'reject'; closeNotebook(); return; }
      const relicOpen = !document.getElementById('relic-overlay').classList.contains('hidden');
      if (relicOpen && !e.repeat && key === 'escape'){ SFX.closeAs = 'reject'; closeRelic(); return; }
      if (relicOpen && (key === 'c' || key === 'r')) return;
      const hillOpen = !document.getElementById('hillman-overlay').classList.contains('hidden');
      if (hillOpen && !e.repeat && key === 'escape'){ SFX.closeAs = 'reject'; closeHillman(); return; }
      if (hillOpen && (key === 'c' || key === 'r')) return;
      if (talentOpen && !e.repeat && (key === 'c' || key === 'r')){ rerollTalents(); return; }
      if (!talentOpen && !e.repeat && (key === 'c' || key === 'r')){ rerollLevelup(); return; }
      if (!e.repeat && ['1','2','3','4','5'].includes(key)){
        const pick = match.levelupChoices[Number(key) - 1];
        if (pick) pick();
      }
      return;
    }
    // Pausa con estadísticas: Esc, Tab o P
    if (['escape', 'tab', 'p'].includes(key)){ if (!e.repeat) togglePause(); return; }
    if (match.menuOpen) return;
    match.keys[key] = true;
    if (e.repeat) return;
    if (key === 'q') selectTech(0);
    if (key === 'e') selectTech(1);
    if (key === ' ' || e.code === 'Space'){ e.preventDefault(); selectTech(match.activeTech === 0 ? 1 : 0); }   // espacio: cambia de supertécnica
    if (key === 'r') triggerUltimate();
    if (['1', '2', '3', '4'].includes(key)) usePBall(Number(key) - 1);   // balones de poder
  };
  window.onkeyup = e => { match.keys[e.key.toLowerCase()] = false; };
  window.onblur = () => { match.keys = {}; };                  // si cambias de ventana no se queda una tecla "pegada"

  const zone = document.getElementById('joystick-zone');
  let active = false, startX=0, startY=0;
  zone.ontouchstart = e => {
    active = true;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
  };
  zone.ontouchmove = e => {
    if (!active) return;
    const t = e.touches[0];
    let dx = t.clientX - startX, dy = t.clientY - startY;
    const len = Math.hypot(dx,dy) || 1;
    const clamped = Math.min(len, 50) / 50;
    moveVec.x = (dx/len) * clamped;
    moveVec.y = (dy/len) * clamped;
  };
  zone.ontouchend = () => { active = false; moveVec.x = 0; moveVec.y = 0; };
}
document.getElementById('btn-tech-0').onclick = () => selectTech(0);
document.getElementById('btn-tech-1').onclick = () => selectTech(1);
document.getElementById('btn-ult').onclick = () => triggerUltimate();
document.getElementById('btn-pause').onclick = () => togglePause();
document.getElementById('btn-resume').onclick = () => togglePause();
document.getElementById('btn-quit').onclick = () => {
  document.getElementById('pause-overlay').classList.add('hidden');
  if (match && !match.over){ match.menuOpen = false; SFX.play('whistle_end'); endMatch(false); }
};

/* ---- pausa: abre el menú con todas las estadísticas ---- */
/* MODO PRUEBAS: en la pausa, botones para conseguir cada definitiva cargada y probarla (pon DEV_ULTS en false para quitarlos) */
const DEV_ULTS = false;   // herramientas de prueba desactivadas (versión pública)
const DEV_ELS = ['fire', 'air', 'forest', 'mountain', 'dragon', 'celestial'];
const DEV_KINDS = [['pierce', 'Tiro'], ['orbit', 'Órbita'], ['bounce', 'Rebote'], ['rain', 'Lluvia'], ['melee', 'Cuerpo a cuerpo']];
function renderDevUlts(){
  const sec = document.getElementById('sp-dev'); if (!sec) return;
  sec.classList.toggle('hidden', !DEV_ULTS); if (!DEV_ULTS) return;
  const box = document.getElementById('sp-dev-ults');
  // una fila por tipo de supertécnica y una columna por afinidad, todas ya evolucionadas
  box.innerHTML = DEV_KINDS.map(([kind, label]) => `<div class="dev-row"><span class="dev-kind">${label}</span>` +
    DEV_ELS.map(el => `<button class="dev-ult" data-el="${el}" data-kind="${kind}" style="--c:${getElement(el).color}">${elIcon(el, 14)}<span>${TECH_NAMES[el][kind][1]}</span></button>`).join('') + '</div>').join('')
    // ir directamente al duelo contra el boss que elijas
    + `<div class="dev-row dev-bosses"><span class="dev-kind">Prueba</span><div class="dev-boss-list"><button class="dev-boss dev-power" id="dev-power" style="--c:#f2a705">⚡<span>Ponerme al máximo (2 fusionadas, 2 talentos, objeto y stats)</span></button></div></div>`
    + `<div class="dev-row dev-bosses"><span class="dev-kind">Ir al boss</span><div class="dev-boss-list">` +
    `<button class="dev-boss" id="dev-mark" style="--c:#ffd84a">⚽<span>Mark Evans</span></button>` + BOSSES.map((d, i) => `<button class="dev-boss" data-boss="${i}" style="--c:${d.color || '#b377e0'}">${(d.group || [d]).map(p => bossFace(p.name, 22) || p.emoji).join('')}<span>${d.name}</span></button>`).join('') + '</div></div>';
  box.querySelectorAll('.dev-boss[data-boss]').forEach(b => b.onclick = () => devGoBoss(+b.dataset.boss));
  const pw = document.getElementById('dev-power'); if (pw) pw.onclick = devPowerUp;
  const dm = document.getElementById('dev-mark'); if (dm) dm.onclick = () => { if (match.menuOpen) togglePause(); match.referee = null; match.bossSpawn = null; if (!match.inArena){ match.arenaColor = '#ffd84a'; enterArena(); startStrike(); } else { match.enemies = match.enemies.filter(e => !e.boss); match.boss = null; match.bossGroup = []; match.towers = []; } match.bossIdx = BOSSES.length; match.mark = null; spawnMark(); };
  box.querySelectorAll('.dev-ult').forEach(b => b.onclick = () => {
    const el = b.dataset.el, kind = b.dataset.kind;
    // esa supertécnica en Nv. de evolución con la R cargada, en la Q
    match.orbitBoostUntil = 0; match.rainUlt = null; match.flurry = null; match.ultAnim = null; match.breath = null; match.ultCdUntil = 0;   // limpia la prueba anterior
    match.techs[0] = { kind, lvl: EVOLVE_AT, charge: 9999, element: el };
    match.activeTech = 0;
    renderTechBar(); updateUltButton();
    togglePause();
    showBanner('Prueba', `${b.textContent.trim()} lista: pulsa R`, getElement(el).color);
  });
}
/* MODO PRUEBAS: personaje muy fuerte para probar los bosses
   2 supertécnicas fusionadas al Nv. 10, 2 talentos al máximo, un objeto y estadísticas muy altas */
function devPowerUp(){
  if (!match) return;
  const el = match.element;
  match.techs = [
    { kind: 'pierce', lvl: TECH_MAX, charge: 9999, element: el, fused: { kind: 'orbit', lvl: TECH_MAX, element: el } },
    { kind: 'rain',   lvl: TECH_MAX, charge: 9999, element: el, fused: { kind: 'melee', lvl: TECH_MAX, element: el } },
  ];
  match.activeTech = 0;
  for (const key of ['ataque', 'defensa']){ for (let i = 0; i < TALENT_MAX; i++) gainTalentLevel(key); }   // Ataque+ y Defensa+ al máximo
  equipRelic('botasInazuma');                                            // Botas Inazuma: te curas con el daño que haces
  match.maxHp *= 2.5; match.hp = match.maxHp;                            // estadísticas de una build muy buena (no invencible)
  match.dmg *= 4; match.atkSpeed *= 1.8; match.speed *= 1.3;
  match.def = Math.max(match.def, 35); match.crit = Math.min(100, (match.crit || 0) + 40); match.critMult = (match.critMult || 2) + 1;
  match.range = (match.range || 135) * 1.4; match.pickup = (match.pickup || 80) * 2;
  renderTechBar(); updateUltButton(); renderInventory();
  togglePause();
  showBanner('¡Modo prueba!', '2 técnicas fusionadas Nv.10 · Ataque+ y Defensa+ al máximo · Botas Inazuma', '#ffd84a');
}
/* MODO PRUEBAS: teletransporte al duelo contra un boss (quita el boss actual si estabas en uno) */
function devGoBoss(i){
  if (!match || !BOSSES[i]) return;
  if (match.menuOpen) togglePause();
  if (match.inArena){
    match.enemies = match.enemies.filter(e => !e.boss);
    match.boss = null; match.bossGroup = []; match.bossMarks = []; match.enemyShots = [];
    document.getElementById('boss-bar').classList.add('hidden');
  }
  match.referee = null; match.bossSpawn = null;
  match.bossIdx = i;
  const def = BOSSES[i];
  match.arenaColor = def.color || '#b377e0';
  if (!match.inArena){ enterArena(); startStrike(); }
  match.towers = []; if (def.special === 'byron') setupByronTowers();
  match.bossSpawn = { x: ARENA_W / 2, y: 190, t: 1.2, dur: 1.2 };
  showBanner(`${def.emoji} ${def.name}`, `Prueba · ${def.team}`, getElement(def.element).color);
  showVsIntro(def);
}
function togglePause(){
  if (match && match.vsActive) return;                 // durante la presentación VS no se pausa
  if (!match || match.over || match.levelupChoices) return;
  match.menuOpen = !match.menuOpen;
  match.paused = match.menuOpen;
  match.keys = {};                       // evita que el jugador siga andando solo al volver
  if (match.menuOpen){ renderStatsPanel(); renderDevUlts(); }
  document.getElementById('pause-overlay').classList.toggle('hidden', !match.menuOpen);
}

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
function readMove(){
  let dx = moveVec.x, dy = moveVec.y;
  if (match.keys['w'] || match.keys['arrowup']) dy -= 1;
  if (match.keys['s'] || match.keys['arrowdown']) dy += 1;
  if (match.keys['a'] || match.keys['arrowleft']) dx -= 1;
  if (match.keys['d'] || match.keys['arrowright']) dx += 1;
  const len = Math.hypot(dx,dy);
  if (len > 1){ dx/=len; dy/=len; }
  return { dx, dy };
}

/* ---- oleadas de enemigos ---- */
/* ---- tipos de rivales que van apareciendo y escalan con el tiempo ----
   from   = segundo desde el que pueden salir
   chance = [al empezar a salir, en el minuto 30]: probabilidad de que un rival nuevo sea de ese tipo
   max    = [al empezar, en el minuto 30]: cuántos puede haber a la vez (si se indica)
   Tipos: tirador 🟦 (dispara un balón), velocista 🟨 (rápido y frágil), muro 🟫 (grande y duro),
   embestidor 🔶 (avisa y embiste), cañonero 🔷 (dispara 3 balones en abanico),
   lanzador 🟪 (lanza el balón en parábola: marca una zona en el suelo y al rato cae y golpea) */
const ENEMY_VARIANTS = {
  shooter: { from: 60,  chance: [0.12, 0.30], max: [2, 8], emoji:'🟦', hpMult: 1.2, speed: 0.9, xp: 12, shotEvery: [3.2, 2.6] },
  runner:  { from: 90,  chance: [0.10, 0.28], emoji:'🟨', build:'small', size: -4, hpMult: 0.55, speed: [1.9, 2.7], dmgMult: 0.8, xp: 5 },
  tank:    { from: 240, chance: [0.04, 0.12], emoji:'🟫', build:'big', hpMult: 5, speed: 0.55, dmgMult: 1.7, size: 12, xp: 35 },
  dasher:  { from: 360, chance: [0.05, 0.14], emoji:'🔶', hpMult: 1.5, speed: 0.95, dmgMult: 1.3, xp: 18,
             dashEvery: [4, 2.5], dashSpeed: 6, dashTime: 0.65, warn: 0.5 },   // embestida más larga (≈234 px)
  lobber:  { from: 300, chance: [0.05, 0.12], max: [2, 6], emoji:'🟪', hpMult: 1.4, speed: 0.85, xp: 20,
             lobEvery: [4.8, 3.2], lobR: [44, 58], lobWarn: 1.25, lobDmg: 1.5 },   // lanzador: tira el balón por arriba y cae en una zona marcada
  gunner:  { from: 480, chance: [0.03, 0.10], max: [1, 4], emoji:'🔷', hpMult: 2, speed: 0.8, xp: 24, shotEvery: [3.6, 2.4], spread: 3 },
};
/* todos los rivales normales van algo más rápido con el tiempo */
const ENEMY_SPEED_PER_WAVE = 0.005, ENEMY_SPEED_MAX = 1.45;
const ENEMY_BOOST = 1.05;          // +5% de vida, daño y velocidad a todos los rivales
const PER_BOSS_BOOST = 0.05;       // +5% más por cada boss vencido (rivales que salen después)
const BOSS_HP_FLOOR = 95;          // vida mínima de un boss = daño inicial × esto
const BOSS_BOOST = 1.15;           // +15% de vida, daño y velocidad a bosses y mini bosses
/* avalanchas: de vez en cuando te rodea un anillo de velocistas */
const SWARM = { from: 180, every: [70, 100], count: [10, 40] };
/* interpola un valor [inicio, minuto 30] según el tiempo desde "from" */
function scaleT(v, from){
  if (!Array.isArray(v)) return v;
  const k = Math.max(0, Math.min(1, (matchClock() - from) / (MATCH_LENGTH - from)));
  return v[0] + (v[1] - v[0]) * k;
}
const ENEMY_KINDS = [
  { emoji:'🟥', hp:22,  speed:1.25, dmg:8,  xp:3,  coin:1 },   // el más flojo (su vida mínima depende de tu daño inicial: nunca cae de un disparo)
  { emoji:'🟧', hp:80,  speed:1.0,  dmg:12, xp:8,  coin:2 },
  { emoji:'🟪', hp:165, speed:0.85, dmg:17, xp:18, coin:4 },   // duro y lento: mucha experiencia
];
/* ---- rivales especiales (solo en el campo grande, no en el duelo) ----
   Willy Glass: no ataca; pasea tranquilo hasta que le pegas, y entonces huye
   a toda velocidad. Si le matas antes de que se escape suelta muchísima
   experiencia (como el esqueleto azul de Megabonk).
   Kappah: rival duro y lento que, al morir, suelta un saco de monedas o,
   a veces, un ticket para el gacha. */
const SPECIAL_ENEMIES = {
  // chance = probabilidad de que salga cada vez que le toca intentarlo (cada "every" segundos)
  willy:  { name:'Willy Glass', emoji:'💀', color:'#7fe3ff', hp:160, wanderSpeed:0.55, fleeSpeed:2.7,
            firstAt:150, every:[100, 160], chance:0.6, max:1, wanderTime:45, fleeTime:22,
            xpLevels:0.7,          // experiencia = 70 % de la que pide el nivel actual
            coin:15 },
  kappah: { name:'Kappah', emoji:'🐢', color:'#62c96c', hp:240, speed:0.7, dmg:10,
            fleeSpeed:2.4, fleeTime:20,   // al recibir el primer golpe deja de atacar y huye
            firstAt:120, every:[80, 130], chance:0.6, max:1,
            ticketChance:0.3,      // 30 % ticket 🎟️ · 70 % saco de monedas 💰
            bagCoins:[20, 40] },
};

function spawnSpecial(kind){
  const S = SPECIAL_ENEMIES[kind];
  const waveBoost = waveMult(BALANCE.enemyHpPerWave);
  const angle = Math.random() * Math.PI * 2, dist = Math.max(W, H) * 0.55;
  const x = Math.max(FIELD_MARGIN * 3, Math.min(FIELD_W - FIELD_MARGIN * 3, match.x + Math.cos(angle) * dist));
  const y = Math.max(FIELD_MARGIN * 3, Math.min(FIELD_H - FIELD_MARGIN * 3, match.y + Math.sin(angle) * dist));
  const e = {
    x, y, special: kind, name: S.name, emoji: S.emoji, color: S.color, size: -4, build: 'small',
    hp: S.hp * waveBoost, maxHp: S.hp * waveBoost,
    speed: kind === 'willy' ? S.wanderSpeed : S.speed,
    dmg: kind === 'willy' ? 0 : S.dmg * waveMult(BALANCE.enemyDmgPerWave),
    xp: kind === 'willy' ? 0 : 10, coin: kind === 'willy' ? S.coin : 3,
    element: ELEMENT_ORDER[Math.floor(Math.random() * ELEMENT_ORDER.length)],
  };
  if (kind === 'willy'){
    e.harmless = true; e.fleeing = false;
    e.wanderAng = Math.random() * Math.PI * 2;
    e.leaveAt = match.elapsed + S.wanderTime;
  } else {
    e.fleeing = false;
  }
  match.enemies.push(e);
}

function updateSpecialSpawns(){
  if (match.inArena) return;
  for (const kind of Object.keys(SPECIAL_ENEMIES)){
    const S = SPECIAL_ENEMIES[kind];
    if (match.nextSpecialAt[kind] === undefined) match.nextSpecialAt[kind] = S.firstAt;
    if (matchClock() < match.nextSpecialAt[kind]) continue;
    match.nextSpecialAt[kind] = matchClock() + S.every[0] + Math.random() * (S.every[1] - S.every[0]);
    const alive = match.enemies.filter(e => e.special === kind && !e.dead).length;
    if (alive < S.max && Math.random() < S.chance) spawnSpecial(kind);
  }
}

/* Willy Glass pasea y Kappah persigue; al recibir un golpe los dos huyen del jugador
   y, si tardas mucho en cazarlos, se escapan */
function updateWilly(e, dx, dy, d, dt){
  const S = SPECIAL_ENEMIES[e.special];
  let vx, vy;
  if (!e.fleeing){
    e.wanderAng += (Math.random() - 0.5) * 2.5 * dt;
    vx = Math.cos(e.wanderAng); vy = Math.sin(e.wanderAng);
    if (match.elapsed > e.leaveAt){ willyEscapes(e, `${e.name} se ha ido`); return; }
  } else {
    const a = Math.atan2(-dy, -dx) + Math.sin(match.elapsed * 3 + e.x * 0.01) * 0.45;   // huye en zigzag
    vx = Math.cos(a); vy = Math.sin(a);
    if (match.elapsed > e.fleeUntil){ willyEscapes(e, `¡${e.name} se ha escapado!`); return; }
  }
  const nx = e.x + vx * e.speed * 60 * dt, ny = e.y + vy * e.speed * 60 * dt;
  const cx = Math.max(FIELD_MARGIN, Math.min(FIELD_W - FIELD_MARGIN, nx));
  const cy = Math.max(FIELD_MARGIN, Math.min(FIELD_H - FIELD_MARGIN, ny));
  if (!e.fleeing && (cx !== nx || cy !== ny)) e.wanderAng += Math.PI;      // rebota en las vallas
  e.x = cx; e.y = cy;
  pushOutOfObstacles(e, 14);
}
function willyEscapes(e, text){
  e.dead = true; e.escaped = true;
}
/* primer golpe a Willy Glass o a Kappah: echa a correr */
function startWillyFlee(e){
  if (e.fleeing) return;
  const S = SPECIAL_ENEMIES[e.special];
  e.fleeing = true;
  e.speed = S.fleeSpeed;
  e.fleeUntil = match.elapsed + S.fleeTime;
  addFloatText(e.x, e.y - 30, '¡Huye!', e.color);
}

/* lo que suelta un rival al morir: gema de experiencia + monedas (todos) + premios especiales */
function dropLoot(e){
  const jitter = () => (Math.random() - 0.5) * 30;
  if (e.special === 'willy'){
    match.gems.push({ x:e.x, y:e.y, xp: Math.round(match.xpNext * SPECIAL_ENEMIES.willy.xpLevels), coin:0, big:true });
  } else if (e.miniBoss){
    match.gems.push({ x:e.x, y:e.y, xp:e.xp, coin:e.coin, big:true });
  } else if (e.xp > 0){
    if (!match.inArena && !e.special && Math.random() < PBALL.dropChance){ const P = pbInit(); if (P.ground.length < PBALL.maxGround) P.ground.push({ k: PBALL.order[Math.floor(Math.random() * 4)], x: e.x, y: e.y, t: 0, ph: Math.random() * 6 }); }   // balón de poder
    // menos gemas verdes: la mitad de las veces el rival medio suelta una azul pequeña
    let xp = e.xp;
    if ((match.bossesBeaten || 0) >= 1 && gemTier(xp) === 'm' && Math.random() < GREEN_GEM_DOWNGRADE) xp = ENEMY_KINDS[0].xp;   // hasta el 1º boss, todos sueltan su experiencia entera
    match.gems.push({ x:e.x, y:e.y, xp, coin:0 });
  }
  // no todos los rivales sueltan monedas: los normales solo a veces
  if (e.coin > 0 && !e.miniBoss && (e.special || Math.random() < COIN_DROP_CHANCE)) match.gems.push({ x:e.x + jitter(), y:e.y + jitter(), xp:0, coin:e.coin, kind:'coin' });
  if (e.miniBoss) rollTicket(e.x + jitter(), e.y + jitter(), TICKET_MINIBOSS);
  else if (!e.special) rollTicket(e.x + jitter(), e.y + jitter(), [TICKET_DROP, TICKET_DROP_EPIC]);
  if (e.special === 'kappah'){
    const S = SPECIAL_ENEMIES.kappah;
    if (Math.random() < S.ticketChance) dropTicket(e.x + jitter(), e.y + jitter(), Math.random() < KAPPAH_EPIC);
    else match.gems.push({ x:e.x + jitter(), y:e.y + jitter(), xp:0, kind:'bag',
                           coin: S.bagCoins[0] + Math.floor(Math.random() * (S.bagCoins[1] - S.bagCoins[0] + 1)) });
  }
}

/* ======================================================================
   EQUILIBRIO DEL PARTIDO (curva de progreso)
   "oleada" = match.wave, sube 1 cada 20 s (oleada 31 ≈ minuto 10, 91 ≈ minuto 30).
   Ajustado jugando partidas con un bot y comparando con el ritmo de PokeSurvivor.
   ====================================================================== */
const BALANCE = {
  enemyHpPerWave: 0.18,        // vida de los rivales:  ×(1 + oleada × esto + oleada² × quad)
  enemyDmgPerWave: 0.08,       // daño de los rivales:  ×(1 + oleada × esto + oleada² × quad)
  enemyHpQuad: 0.0035, enemyDmgQuad: 0.0005,   // a partir de la mitad del partido se dispara (min 30 ≈ ×33 vida, ×12 daño)
  enemyXpPerWave: 0,           // experiencia que dan:  ×(1 + oleada × esto)
  bossHpPerWave: 0.14, bossDmgPerWave: 0.06,
  bossHpQuad: 0.0015, bossDmgQuad: 0.0004,
  bossHpBase: 12, bossHpPerIdx: 24,
  // (cada boss además se multiplica por BOSS_HP_SCALE: con 1:30 de duelo, una build floja no llega)     // vida base del boss nº i = 55 × (base + porIdx × i)
  xpStart: 12, xpGrowth: 1.10, xpLinear: 6, xpQuad: 0,   // exp. siguiente nivel = anterior × growth + linear
  xpLateFrom: 5, xpLateGrowth: 1.13, xpLateLinear: 14,     // desde nivel 5 cuesta bastante más subir
  xpEndFrom: 25, xpEndGrowth: 1.055, xpEndLinear: 60,      // desde nivel 25 ya no se dispara tanto (subir en el lategame)
  maxEnemies: 400,             // tope de rivales a la vez en el campo grande
};
/* vida extra de cada boss (en orden): el primero es más asequible */
const BOSS_HP_SCALE = [0.7, 2.0, 2.6, 2.8, 3.6, 4, 4, 4.2, 4.5];   // Chicken y Artist algo menos (duelos de ~1-2 min con una build buena) · Aphrodite ×4,5
function waveMult(perWave, quad = 0){ const w = match.wave - 1; return 1 + w * perWave + w * w * quad; }
/* experiencia que pide el siguiente nivel */
function xpForLevel(prev, level){
  return psXpFor(level);                                                // curva de PokéSurvivor
  const B = BALANCE;
  if (level >= B.xpEndFrom) return Math.floor(prev * B.xpEndGrowth + B.xpEndLinear);
  const late = level >= B.xpLateFrom;
  return Math.floor(prev * (late ? B.xpLateGrowth : B.xpGrowth) + (late ? B.xpLateLinear : B.xpLinear) + B.xpQuad * level);
}

/* ---- ritmo de aparición de los rivales (dificultad) ----
   startBurst: rivales que ya te rodean al empezar el partido
   interval:   segundos entre tandas = max(min, base - perWave × oleada)
   group:      rivales por tanda = 1 + 1 cada "groupEvery" oleadas (máx. groupMax) */
const EARLY_EASE = [0.65, 0.7, 0.75, 0.55];          // daño de los rivales antes del 1º / 2º / 3º / 4º boss (todo el camino hasta Jude, más suave)
const MID_EASE = 0.5;                               // a partir de Jude: rivales un 22% más suaves (vida −11%)
/* máximo de rivales a la vez en el campo: pocos al principio y más según avanza el partido (tope 400) */
function maxEnemiesNow(){ return Math.round(PS.CAP * (match ? fieldCrowdMult() : 1)); }   // tope de PokéSurvivor (64), +15% por Torre Inazuma
/* tras el 3º boss algo menos de rivales */
const LATE_FIELD = { from: 3, crowd: 0.87, dmg: 1 };
/* menos rivales en el campo pero más duros (menos lag y menos spam de definitivas):
   count = cuántos salen respecto a antes, hp = vida de cada uno, xp = experiencia que da cada uno */
const POP = { count: 0.55, hp: 1.7, xp: 1.4 };
function popK(k){ return (match.bossesBeaten || 0) >= 1 && !match.inArena ? POP[k] : 1; }   // solo en el campo (en el duelo los rivales siguen igual)   // desde el 1º boss (antes, el arranque ya va a su ritmo)
/* cuántos rivales hay en el campo respecto a lo normal: tras el 3º boss algo menos; cada Torre Inazuma activada, más */
function fieldCrowdMult(){ return 1 + ITOWER.perLvl * (match.itowerLvl || 0); }   // cada Torre Inazuma activada: +15% de rivales
/* antes del 1º boss los rivales salen más despacio al principio y se va acelerando hasta la normalidad */
function earlySpawnSlow(){ if (match.bossesBeaten > 0) return 1; const q = Math.min(1, (typeof matchClock === 'function' ? matchClock() : 0) / SPAWN.earlyRamp); return SPAWN.earlySlow + (1 - SPAWN.earlySlow) * q; }
const SPAWN = { startBurst: 4, earlyRamp: 180, earlySlow: 1.9, earlyCap0: 20, earlyCapPerSec: 0.35, base: 0.6, perWave: 0.0175, min: 0.08, groupEvery: 6, groupMax: 6, arenaSlow: 9.5, arenaMax: 8 };   // en los duelos, pocos rivales   // el doble de rivales que antes (el duelo igual)

/* ======================================================================
   OLEADAS Y DIFICULTAD AL ESTILO POKÉSURVIVOR
   Adaptado de PokéSurvivor (https://github.com/JPTER78/pokesurvivor,
   Copyright 2026 JPTER78, licencia PolyForm Noncommercial 1.0.0):
   spawner.js y enemies.js (ritmo, tope, élites, mareas, tramos y jefes).
   Los números son los suyos, pasados a nuestra escala con kD (tu daño
   inicial frente al suyo) y kH (tu vida inicial frente a la suya).
   ====================================================================== */
const PS = {
  kD: 0.45, kH: 1.15,                 // daño: el disparo básico medio de nuestra base de datos ≈ 14/s (su movimiento inicial ≈ 32/s) · vida media de nuestra base de datos ≈ 117 (la suya ≈ 101)
  CAP: 64, ELITE_FROM: 0.85,         // tope de rivales a la vez; desde el 85% salen élites
  DENSITY: 0.24, DMG_K: 2.4, XP_K: 5.6,
  TIERS: [                           // tramos por tiempo (s): vida, daño y experiencia base
    { from: 0,   hp: 17,  dmg: 6,   xp: 3.5 },
    { from: 70,  hp: 32,  dmg: 8.5, xp: 5 },
    { from: 160, hp: 52,  dmg: 11,  xp: 8 },
    { from: 260, hp: 88,  dmg: 14,  xp: 13 },
    { from: 380, hp: 150, dmg: 22,  xp: 24 },
    { from: 500, hp: 250, dmg: 28,  xp: 38 },
  ],
  BOSS: [[180, 1400, 34], [360, 3200, 42], [540, 5600, 48], [720, 9000, 56], [900, 16000, 68]],   // [segundo, vida, daño]
  SURGE: [38, 56],                   // marea cada 38-56 s
  bossK: 1e9,
  nerf: 0.88,                        // un pelín menos de daño de todos los rivales y bosses
  hpGrow: 105, dmgGrow: 480, bossDmgGrow: 680,   // la vida y el daño suben algo más despacio con el tiempo (PokéSurvivor: 95 / 420 / 600)
};
/* segundo de partida para la dificultad (contra Aphrodite sigue subiendo mientras dura el duelo) */
function psTime(){ return matchClock() + (match.inArena && typeof byronBoss === 'function' && byronBoss() ? duelTime() : 0); }
function psRate(t){ return (1.6 + t * 0.028 + Math.pow(t / 60, 1.6) * 0.5) * PS.DENSITY; }   // rivales por segundo
function psHpK(t){ return 3.3 + Math.min(1.7, t / 210); }
/* tramo del que sale un rival: los que ya han salido, y los viejos (más de 260 s) pesan menos */
function psTier(t){
  const w = PS.TIERS.map(tr => t < tr.from ? 0 : (t - tr.from > 260 ? 3 : 10));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++){ if (r < w[i]) return PS.TIERS[i]; r -= w[i]; }
  return PS.TIERS[0];
}
/* stats de un rival normal en el segundo t (antes de su tipo y complexión) */
function psEnemyStats(t){
  const tr = psTier(t), hs = 1 + t / PS.hpGrow, ds = 1 + t / PS.dmgGrow;
  return { hp: tr.hp * hs * psHpK(t) * PS.kD, dmg: tr.dmg * ds * PS.DMG_K * PS.kH * PS.nerf, shot: tr.dmg * 0.8 * ds * PS.kH * PS.nerf, xp: tr.xp * PS.XP_K };
}
/* jefes: vida y daño de su franja (interpolado en el tiempo; más allá del último, sigue creciendo) */
function psBossStats(t){
  const B = PS.BOSS; let hp, dmg;
  if (t <= B[0][0]){ const q = Math.max(0, t) / B[0][0]; hp = B[0][1] * (0.5 + 0.5 * q); dmg = B[0][2] * (0.85 + 0.15 * q); }
  else if (t >= B[B.length - 1][0]){ const L = B[B.length - 1], P = B[B.length - 2], n = (t - L[0]) / (L[0] - P[0]); hp = L[1] * Math.pow(L[1] / P[1], n); dmg = L[2] + (L[2] - P[2]) * n; }
  else { let i = 0; while (t > B[i + 1][0]) i++; const a = B[i], b = B[i + 1], q = (t - a[0]) / (b[0] - a[0]); hp = a[1] + (b[1] - a[1]) * q; dmg = a[2] + (b[2] - a[2]) * q; }
  const sc = 1 + t / 600, dsc = 1 + t / PS.bossDmgGrow;
  // (× bossK: nuestras supertécnicas suben bastante más que sus movimientos, así que con el tiempo los jefes aguantan algo más)
  return { hp: hp * 1.35 * sc * PS.kD * (1 + Math.max(0, t - 300) / PS.bossK), dmg: dmg * 1.2 * dsc * PS.kH * PS.nerf, shot: dmg * 0.55 * dsc * PS.kH * PS.nerf };
}
/* PokéSurvivor: experiencia para el siguiente nivel */
function psXpFor(level){ return Math.floor((8 + level * 6 + Math.pow(level, 1.75) * 1.6) * 4 * XP_HARDER); }
const XP_HARDER = 1.1;   // un pelín más que en PokéSurvivor
/* con el tiempo cuesta más ganar experiencia: en el minuto 10 cada gema da un 25% menos, en el 20 un 40% menos */
function xpTimeK(){ return 1 / (1 + psTime() / 1800); }
/* marea: una avalancha concentrada desde un lado */
function updateSurge(dt){
  if (match.inArena || match.boss || match.referee) return;
  if (match.surgeT === undefined) match.surgeT = 32;
  match.surgeT -= dt;
  if (match.surgeT > 0) return;
  match.surgeT = PS.SURGE[0] + Math.random() * (PS.SURGE[1] - PS.SURGE[0]);
  const t = psTime(), base = Math.random() * Math.PI * 2, alive = match.enemies.filter(e => !e.dead).length;
  const n = Math.min(maxEnemiesNow() + 10 - alive, Math.round((14 + Math.floor(t / 22)) * 0.4 * fieldCrowdMult()));
  for (let k = 0; k < n; k++){
    const a = base + (Math.random() - 0.5) * 1.1, dist = Math.max(W, H) * 0.7;
    const x = Math.max(FIELD_MARGIN, Math.min(FIELD_W - FIELD_MARGIN, match.x + Math.cos(a) * dist));
    const y = Math.max(FIELD_MARGIN, Math.min(FIELD_H - FIELD_MARGIN, match.y + Math.sin(a) * dist));
    spawnEnemy({ x, y, ignoreCap: true });
  }
  if (n > 0) showBanner('¡Marea de rivales!', null, '#ff8a3a');
}

let spawnTimer = 0;
function spawnEnemy(opts = {}){
  if (!match.inArena && !opts.ignoreCap && match.enemies.filter(e => !e.dead).length >= maxEnemiesNow()) return;
  const hpBoost = waveMult(BALANCE.enemyHpPerWave, BALANCE.enemyHpQuad), waveBoost = waveMult(BALANCE.enemyDmgPerWave, BALANCE.enemyDmgQuad);
  const kindIdx = Math.min(ENEMY_KINDS.length - 1, Math.floor(match.wave / 4));
  const kind = ENEMY_KINDS[Math.floor(Math.random() * (kindIdx+1))];
  let ex, ey;
  if (match.inArena){
    // en el duelo entran por las bandas, lejos del jugador
    let tries = 0;
    do {
      const side = Math.floor(Math.random() * 4);
      ex = side < 2 ? FIELD_MARGIN + Math.random() * (ARENA_W - 2 * FIELD_MARGIN) : (side === 2 ? FIELD_MARGIN : ARENA_W - FIELD_MARGIN);
      ey = side >= 2 ? FIELD_MARGIN + Math.random() * (ARENA_H - 2 * FIELD_MARGIN) : (side === 0 ? FIELD_MARGIN : ARENA_H - FIELD_MARGIN);
    } while (Math.hypot(ex - match.x, ey - match.y) < 280 && ++tries < 20);
  } else {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(W,H) * 0.7;
    ex = Math.max(FIELD_MARGIN, Math.min(FIELD_W - FIELD_MARGIN, match.x + Math.cos(angle)*dist));
    ey = Math.max(FIELD_MARGIN, Math.min(FIELD_H - FIELD_MARGIN, match.y + Math.sin(angle)*dist));
  }
  if (opts.x !== undefined){ ex = opts.x; ey = opts.y; }
  const enemy = {
    x: ex,
    y: ey,
    hp: kind.hp * hpBoost, maxHp: kind.hp * hpBoost,
    speed: kind.speed, dmg: kind.dmg * waveBoost, xp: Math.round(kind.xp * waveMult(BALANCE.enemyXpPerWave)), coin: kind.coin,
    emoji: kind.emoji,
    element: ELEMENT_ORDER[Math.floor(Math.random() * ELEMENT_ORDER.length)],
  };
  enemy.speed *= Math.min(ENEMY_SPEED_MAX, 1 + (match.wave - 1) * ENEMY_SPEED_PER_WAVE);
  const relBase = { hp: enemy.maxHp / Math.pow(kind.hp / ENEMY_KINDS[0].hp, 0.35), dmg: enemy.dmg / Math.pow(kind.dmg / ENEMY_KINDS[0].dmg, 0.35) };   // (los tipos 🟧/🟪 algo más duros que el 🟥: ×1,6 / ×2 de vida)
  applyVariant(enemy, kind, waveBoost, opts.variant);
  if (!enemy.variant && !match.inArena) applyBuild(enemy);
  // todos los rivales: un 5% más de vida, daño y velocidad
  // y otro +5% por cada boss que ya hayas vencido
  enemy.speed *= ENEMY_BOOST * (1 + PER_BOSS_BOOST * (match.bossesBeaten || 0));
  // vida mínima según el daño con el que empiezas (mejoras permanentes incluidas):
  // ningún rival cae de un solo disparo normal al principio (los pequeños, mínimo 2 también)

  { const pel = sheetElement(enemySheetPath(enemy)); if (pel) enemy.element = pel; }   // cada rival tiene la afinidad de su personaje
  // stats de PokéSurvivor: se respeta lo que cambian su tipo (tirador, muro…) y su complexión
  { const P = psEnemyStats(psTime()), relHp = enemy.maxHp / Math.max(1e-6, relBase.hp), relDmg = enemy.dmg / Math.max(1e-6, relBase.dmg);
    enemy.hp = enemy.maxHp = P.hp * relHp;
    enemy.dmg = P.dmg * relDmg;
    if (enemy.shotDmg) enemy.shotDmg = P.shot * (enemy.spread ? 0.7 / 0.8 : 1);           // cañonero: abanico, cada balón algo menos
    enemy.xp = Math.max(1, Math.round(P.xp * Math.min(3, Math.max(0.6, relHp))));
    if (!match.inArena && match.enemies.filter(e => !e.dead).length >= maxEnemiesNow() * PS.ELITE_FROM){   // élite: con el campo casi lleno
      enemy.hp *= 1.6; enemy.maxHp *= 1.6; enemy.dmg *= 1.25; if (enemy.shotDmg) enemy.shotDmg *= 1.25; enemy.xp = Math.round(enemy.xp * 1.6); enemy.elite = true; } }
  match.enemies.push(enemy);
  return enemy;
}

/* convierte un rival recién creado en uno de los tipos especiales (o lo deja normal) */
/* complexión de los rivales normales: pequeños (rápidos y con poca vida),
   estándar, y grandes (lentos pero con mucha más vida). Los velocistas ya son
   pequeños y los tanques grandes por su tipo. */
const ENEMY_BUILDS = {
  small: { chance: [0.18, 0.26], hp: 0.5, speed: 1.55, xp: 0.7, size: -4 },
  big:   { chance: [0.06, 0.16], hp: 3.2, speed: 0.6,  xp: 2.2, size: 10, dmg: 1.25 },
};
function applyBuild(enemy){
  const t = Math.min(1, matchClock() / MATCH_LENGTH), r = Math.random();
  const lerp = c => c[0] + (c[1] - c[0]) * t;
  const key = r < lerp(ENEMY_BUILDS.small.chance) ? 'small' : r < lerp(ENEMY_BUILDS.small.chance) + lerp(ENEMY_BUILDS.big.chance) ? 'big' : null;
  if (!key) return;
  const B = ENEMY_BUILDS[key];
  enemy.build = key; enemy.size = B.size;
  enemy.hp *= B.hp; enemy.maxHp *= B.hp; enemy.speed *= B.speed;
  enemy.xp = Math.max(1, Math.round(enemy.xp * B.xp));
  if (B.dmg) enemy.dmg *= B.dmg;
}
function applyVariant(enemy, kind, waveBoost, forced){
  let pick = forced || null;
  if (!pick){
    for (const [key, V] of Object.entries(ENEMY_VARIANTS)){
      if (matchClock() < V.from) continue;
      if (match.inArena && key !== 'shooter') continue;          // en el duelo solo tiradores
      if (V.max && match.enemies.filter(o => o.variant === key && !o.dead).length >= Math.round(scaleT(V.max, V.from))) continue;
      if (Math.random() < scaleT(V.chance, V.from)){ pick = key; break; }
    }
  }
  if (!pick) return;
  const V = ENEMY_VARIANTS[pick];
  enemy.variant = pick;
  enemy.emoji = V.emoji;
  enemy.hp *= V.hpMult; enemy.maxHp *= V.hpMult;
  const spdScale = Math.min(ENEMY_SPEED_MAX, 1 + (match.wave - 1) * ENEMY_SPEED_PER_WAVE);
  enemy.speed = scaleT(V.speed, V.from) * (Array.isArray(V.speed) ? 1 : spdScale);
  if (V.dmgMult) enemy.dmg *= V.dmgMult;
  if (V.size) enemy.size = V.size;
  if (V.build) enemy.build = V.build;
  enemy.xp = Math.round(V.xp * waveMult(BALANCE.enemyXpPerWave));
  if (pick === 'shooter' || pick === 'gunner'){
    enemy.shooter = true;
    enemy.shotDmg = kind.dmg * waveBoost * 0.6;
    enemy.shotEvery = scaleT(V.shotEvery, V.from);
    enemy.shotCd = 1.5 + Math.random() * 2;
    if (V.spread) enemy.spread = V.spread;
  }
  if (pick === 'lobber'){
    enemy.lobber = true;
    enemy.shotDmg = kind.dmg * waveBoost * 0.6;                    // (se ajusta igual que el de los tiradores)
    enemy.shotEvery = scaleT(V.lobEvery, V.from);
    enemy.shotCd = 2 + Math.random() * 2;
  }
  if (pick === 'dasher'){
    enemy.dashCd = 1.5 + Math.random() * 2;
    enemy.dashT = 0; enemy.warnT = 0;
  }
}

/* embestidor: se para, avisa con una línea roja y embiste en línea recta */
function updateDasher(e, ex, ey, d, dt){
  const V = ENEMY_VARIANTS.dasher;
  if (e.dashT > 0){
    e.dashT -= dt;
    e.x += e.dashVx * dt; e.y += e.dashVy * dt;
    e.x = Math.max(FIELD_MARGIN, Math.min(fieldW() - FIELD_MARGIN, e.x));
    e.y = Math.max(FIELD_MARGIN, Math.min(fieldH() - FIELD_MARGIN, e.y));
    return true;
  }
  if (e.warnT > 0){
    e.warnT -= dt;
    if (e.warnT <= 0){
      e.dashT = V.dashTime;
      e.dashVx = e.dashDir.x * V.dashSpeed * 60; e.dashVy = e.dashDir.y * V.dashSpeed * 60;
    }
    return true;                                    // quieto mientras avisa
  }
  e.dashCd -= dt;
  if (e.dashCd <= 0 && d < 420){
    e.dashCd = scaleT(V.dashEvery, V.from) * (0.8 + Math.random() * 0.4);
    e.warnT = V.warn;
    e.dashDir = { x: ex / d, y: ey / d };
    return true;
  }
  return false;
}

/* avalancha: un anillo de velocistas a tu alrededor */
function updateSwarm(){
  if (match.inArena || match.boss || matchClock() < SWARM.from) return;
  if (match.nextSwarmAt === undefined) match.nextSwarmAt = SWARM.from;
  if (matchClock() < match.nextSwarmAt) return;
  match.nextSwarmAt = matchClock() + SWARM.every[0] + Math.random() * (SWARM.every[1] - SWARM.every[0]);
  const n = Math.round(scaleT(SWARM.count, SWARM.from));
  const R = Math.max(W, H) * 0.55, off = Math.random() * Math.PI * 2;
  for (let k = 0; k < n; k++){
    const a = off + k / n * Math.PI * 2;
    const x = Math.max(FIELD_MARGIN, Math.min(FIELD_W - FIELD_MARGIN, match.x + Math.cos(a) * R));
    const y = Math.max(FIELD_MARGIN, Math.min(FIELD_H - FIELD_MARGIN, match.y + Math.sin(a) * R));
    spawnEnemy({ x, y, variant:'runner', ignoreCap:true });
  }
}

const SHOT_CAP = 16;   // (antes 24)
const LOB_CAP = 4;      // como mucho 6 zonas de lanzadores a la vez
/* lanzador: cada pocos segundos lanza el balón por arriba hacia donde vas; marca la zona y cae */
function updateLobber(e, d, dt){
  e.shotCd -= dt;
  if (e.lobT > 0) e.lobT -= dt;                                   // anima el brazo en alto un momento
  if (e.shotCd > 0 || d > 560 || bossInvisible(e)) return;
  if ((match.bossMarks || []).filter(m => m.kind === 'lob').length >= LOB_CAP){ e.shotCd = 0.6; return; }
  const V = ENEMY_VARIANTS.lobber;
  e.shotCd = e.shotEvery + Math.random() * 1.2;
  e.lobT = 0.35;
  const lead = 0.5, vx = (match.x - (match._lx ?? match.x)), vy = (match.y - (match._ly ?? match.y));   // apunta un poco por delante
  const r = scaleT(V.lobR, V.from);
  const tx = match.x + vx / Math.max(dt, 1e-3) * lead * 0.5, ty = match.y + vy / Math.max(dt, 1e-3) * lead * 0.5;
  const dmg = e.shotDmg * V.lobDmg * ENEMY_SHOT_MULT / ENEMY_PROJ_X3 * elementMult(e.element, match.element) * weatherMult(e.element);
  match.bossMarks = match.bossMarks || [];
  bossMark(tx, ty, V.lobWarn, r, dmg, 'lob', getElement(e.element).color, { fromX: e.x, fromY: e.y, el: e.element });
}
/* tiradores: se quedan a distancia y lanzan un balón lento cada pocos segundos */
function updateShooter(e, d, dt){
  e.shotCd -= dt;
  if (e.shotCd > 0 || d > 420) return;
  if (!match.inArena && match.enemyShots.length >= SHOT_CAP){ e.shotCd = 0.5; return; }   // tope de balones rivales en el campo
  e.shotCd = (e.shotEvery || 3.2) + Math.random() * 1.2;
  const ang = Math.atan2(match.y - e.y, match.x - e.x);
  const n = e.spread || 1;
  for (let k = 0; k < n; k++){
    const a = ang + (k - (n - 1) / 2) * 0.28;
    match.enemyShots.push({
      x:e.x, y:e.y, vx:Math.cos(a) * 3.2, vy:Math.sin(a) * 3.2,
      r: match.inArena ? 6 : 9, dmg:e.shotDmg, element:e.element, life:3.5,   // en el campo, balones más gordos (se ven mejor)
    });
  }
}

/* ---- bucle principal ---- */
let lastTime = 0;
function loop(now){
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  // si algo falla en un fotograma, se avisa en la consola pero el juego NO se congela
  try { if (!match.paused) update(dt); }
  catch (err){ console.error('[update]', err); }
  if (match.over) return;           // fin de partida: el bucle se detiene aquí
  try { render(); if (match.dying) drawDeathFx(); }
  catch (err){ console.error('[render]', err); }
  finally { ctx = ctxMain; ctx.restore && ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  rafId = requestAnimationFrame(loop);
}

/* ---- muerte: la pantalla pasa a blanco y negro, el jugador cae a cámara lenta y sale el fin del partido ---- */
const DEATH_TIME = 1.6;
function startDeath(){
  match.dying = { t: 0, won: !!match.mark, reason: match.mark ? 'mark' : null };
  match.hp = 0; match.keys = {}; moveVec.x = moveVec.y = 0;
  SFX.play('whistle_end');
  canvas.classList.add('dead-bw'); document.getElementById('screen-game').classList.add('dead-bw');
}
function updateDeath(dt){
  const D = match.dying;
  D.t += dt; match.elapsed += dt * 0.35;                 // todo va a cámara lenta
  for (const f of match.effects) f.life -= dt * 0.35;
  match.effects = match.effects.filter(f => f.life > 0);
  updateHud();
  if (D.t >= DEATH_TIME){ match.dying = null; endMatch(D.won, D.reason); }
}
function drawDeathFx(){                                   // sencilla: solo blanco y negro (CSS), cámara lenta y un leve oscurecido al final
  const D = match.dying; if (!D) return;
  const k = Math.max(0, (D.t - DEATH_TIME * 0.55) / (DEATH_TIME * 0.45));
  if (k > 0){ ctx.save(); ctx.globalAlpha = 0.45 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
function update(dt){
  if (match.dying){ updateDeath(dt); return; }
  match.elapsed += dt;
  if (match.hurtFx > 0) match.hurtFx = Math.max(0, match.hurtFx - dt * 2.2);
  if (match.ultAnim) updateFenix();
  if (clockRunning()){ match.clockT = (match.clockT || 0) + dt; match.waveTime += dt; }   // en el minuto del árbitro la oleada no sube
  // (ya no acaba a los 25:00: tras Aphrodite sale Mark Evans y la partida termina cuando te elimina)
  if (match.waveTime > 20){ match.waveTime = 0; match.wave++; }

  // movimiento del jugador, confinado dentro del campo
  const { dx, dy } = readMove();
  if (dx || dy){ const l = Math.hypot(dx, dy); match.aim = { x: dx/l, y: dy/l }; }
  // animación del cuerpo: hacia dónde mira y ritmo de los pasos
  match.moving = !!(dx || dy) && !match.slip;
  if (dx || dy){ match.face8 = face8Of(dx, dy); match.facing = bodyDirOf(match.face8); }
  if (match.moving){
    const prevStep = Math.floor(match.walkT || 0);
    match.walkT = (match.walkT || 0) + dt * 8;
    const st = Math.floor(match.walkT);
    if (st !== prevStep && st % 2 === 0) SFX.play('step');    // un paso por cada pie (al apoyarlo)
  }
  const spd = moveSpeedNow();
  if (match.slip){                                  // resbalando con un plátano: sin control
    match.x += match.slip.vx * dt; match.y += match.slip.vy * dt;
    match.slip.t -= dt;
    if (match.slip.t <= 0) match.slip = null;
  } else {
    const ts = terrainSlow(match.x, match.y);        // hierbajos y barro te frenan
    match.x += dx * spd * ts * 60 * dt;
    match.y += dy * spd * ts * 60 * dt;
    if (dx || dy) checkBananas(spd);
  }
  match.x = Math.max(FIELD_MARGIN, Math.min(fieldW() - FIELD_MARGIN, match.x));
  match.y = Math.max(FIELD_MARGIN, Math.min(fieldH() - FIELD_MARGIN, match.y));
  pushOutOfRocks(match, 14 + playerHitOff());
  pushOutOfObstacles(match, 14 + playerHitOff());
  if (match.fade > 0) match.fade -= dt;
  if (match.strike){ match.strike.t -= dt; if (match.strike.t <= 0) match.strike = null; }
  if (match.regen && match.hp > 0) match.hp = Math.min(match.maxHp, match.hp + match.regen * dt);   // Síntesis

  // efectos visuales en curso
  for (const f of match.effects) f.life -= dt;
  for (const b of match.bolts) b.life -= dt;
  for (const t of match.texts){ t.life -= dt; t.y -= 32 * dt; }
  match.texts = match.texts.filter(t => t.life > 0);
  match.effects = match.effects.filter(f => f.life > 0);
  match.bolts = match.bolts.filter(b => b.life > 0);
  if (match.banner){ match.banner.life -= dt; if (match.banner.life <= 0) match.banner = null; }

  // spawn de enemigos, cada vez más frecuente
  spawnTimer -= dt;
  const spawnRate = Math.max(SPAWN.min, SPAWN.base - match.wave * SPAWN.perWave);
  const byr = match.inArena && (byronBoss() || (match.mark && { towerShield: false }));
  if (byr && spawnTimer <= 0){                      // duelo contra Aphrodite: rivales todo el rato, cada vez más duros
    const dt2 = duelTime(), saveW = match.wave;
    spawnTimer = 1.9 * Math.pow(0.95, Math.floor(dt2 / 30)) * (byr.towerShield ? 0.67 : 1);
    if (match.enemies.filter(o => !o.boss && !o.dead).length < 60){ match.wave = Math.max(saveW, 75 + Math.floor(dt2 / 15)); spawnEnemy(); match.wave = saveW; }
  }
  if (!byr && match.inArena && spawnTimer <= 0){
    // en el duelo pocos rivales: el reto es el boss
    if (match.enemies.filter(o => !o.boss && !o.dead).length < SPAWN.arenaMax) spawnEnemy();
    spawnTimer = spawnRate * SPAWN.arenaSlow;
  }
  if (!match.inArena){                              // campo: goteo de PokéSurvivor (rivales por segundo según el minuto)
    match.psAcc = (match.psAcc || 0) + psRate(psTime()) * fieldCrowdMult() * (match.referee ? 0.6 : 1) * dt;
    let n = Math.floor(match.psAcc); match.psAcc -= n;
    while (n-- > 0 && match.enemies.filter(o => !o.dead).length < maxEnemiesNow()) spawnEnemy();
    updateSurge(dt);
  }
  updateSpecialSpawns();

  updateReferee(dt);
  updateMiniBoss(dt);
  updateMark(dt);
  updatePBalls(dt);
  updateHillman();
  updateRelics(dt);
  updateNotebook(dt);
  if (match.inArena && match.arenaExitAt && match.elapsed >= match.arenaExitAt){ exitArena(); }

  // enemigos: persiguen al jugador
  for (const e of match.enemies){
    const ex = match.x - e.x, ey = match.y - e.y;
    const d = Math.hypot(ex,ey) || 1;
    if (e.special === 'willy' || (e.special === 'kappah' && e.fleeing)){ updateWilly(e, ex, ey, d, dt); continue; }   // huyendo no ataca
    const dashing = e.variant === 'dasher' && updateDasher(e, ex, ey, d, dt);
    const keepAway = dashing || (e.shooter && d < 240) || (e.lobber && d < 300) || (e.boss && (e.holdUntil > match.elapsed || e.dashT > 0 || e.warnT > 0 || e.tpAt));   // los tiradores no se acercan del todo; Chicken se frena
    if (!keepAway){
      const ts = terrainSlow(e.x, e.y) * (e.slowUntil > match.elapsed ? 0.6 : 1) * (e.airSlowUntil > match.elapsed ? AFF.airSlow : 1);   // Técnica secreta / pasiva de Aire
      e.x += (ex/d) * e.speed * ts * 60 * dt;
      e.y += (ey/d) * e.speed * ts * 60 * dt;
    }
    if (e.shooter) updateShooter(e, d, dt);
    if (e.lobber) updateLobber(e, d, dt);
    if (match.inArena) pushOutOfRocks(e, 12 + (e.size || 0));
    else pushOutOfObstacles(e, 12 + (e.size || 0));
    // golpe de contacto cada 0.5 s, con regate (esquiva) y defensa
    e.hitCd = (e.hitCd || 0) - dt;
    if (e.boss || e.miniBoss) updateBoss(e, dt);
    if (d < 26 + (e.size || 0) + playerHitOff() && e.hitCd <= 0){
      e.hitCd = 0.5;
      if (Math.random() * 100 < effDodge()){
        addFloatText(match.x, match.y - 26, '¡Regate!', '#5ec8f2');
      } else {
        hurtPlayer(e.dmg * MELEE_DMG * (1 - Math.min(75, match.def) / 100) * elementMult(e.affEl || e.element, match.element), e);
      }
    }
  }

  autoAttack(dt);
  updateProjectiles(dt);
  updateTechs(dt);
  match.enemies = match.enemies.filter(e => !e.dead);
  updateGems(dt);
  updateItems(dt);
  updateEnemyShots(dt);
  updateBossMarks(dt);
  match._lx = match.x; match._ly = match.y;
  updateWeather(dt);

  if (match.hp <= 0){ startDeath(); return; }   // te eliminan: animación en blanco y negro y luego el final (contra Mark cuenta como final)   // te eliminan: pitido final (contra Mark cuenta como final)
  if (!match.levelupChoices && match.xp >= match.xpNext) levelUp();
  updateHud();
}

/* ---- ataque automático: dispara al enemigo más cercano dentro de rango ---- */
function autoAttack(dt){
  match.atkCooldown -= dt;
  if (match.kickT > 0) match.kickT -= dt;
  if (match.atkCooldown > 0) return;
  if (loneNotebook()) return;                 // con un cuaderno solo no atacas: lo estás cargando
  // con una supertécnica activa solo ataca ella: los disparos básicos solo salen
  // con el hueco vacío o si la técnica es de disparo (penetrante / rebote)
  const at = activeTech();
  if (at && !techLvl('pierce') && !techLvl('bounce') && !(isBuffKind(at.kind) && (!at.fused || isBuffKind(at.fused.kind)))) return;
  const target = nearestEnemy();
  if (!target) return;
  const d = Math.hypot(target.x-match.x, target.y-match.y);
  if (d > match.range) return;

  const ang = Math.atan2(target.y-match.y, target.x-match.x);
  const pl = techLvl('pierce'), bl = techLvl('bounce');
  const n = match.multishot + (pl > 1 ? 2 + Math.floor((pl - 2) / 2) : 0);   // penetrante: 1 balón en Nv.1; x3 en Nv.2; luego +1 cada 2 niveles
  const spread = pl ? 0.12 : 0.16;
  // (subir de nivel las supertécnicas da menos que antes: lo más fuerte son los talentos)
  const techDmg = (pl ? (1.1 + 0.12 * (pl - 1)) * (pl >= EVOLVE_AT ? 1.15 : 1) : 1)
                + 0.07 * Math.max(0, bl - 1);
  for (let i = 0; i < n; i++){
    const a = ang + (i - (n - 1) / 2) * spread;
    const crit = Math.random() * 100 < effCrit();
    const proj = {
      x:match.x, y:match.y, vx:Math.cos(a)*9, vy:Math.sin(a)*9,
      r: pl ? (pl >= EVOLVE_AT ? 11 : 9) : bl ? 8 + 0.5 * bl + (bl >= EVOLVE_AT ? 2 : 0) : 5,     // rebote: gordo y crece con el nivel
      dmg: match.dmg * techDmg * (crit ? effCritMult() : 1), crit, life:1.2,
      techKind: pl ? 'pierce' : bl ? 'bounce' : null, style: pl ? 'pierce' : bl ? 'bounce' : null,
    };
    proj.element = techElement(pl ? 'pierce' : bl ? 'bounce' : null);
    if (pl) proj.pierce = true;                // atraviesa a los rivales
    if (bl) proj.bounces = 2 + Math.floor((bl - 1) / 2);   // rebota entre cercanos: 2,2,3,3,4,4,5,5
    if (proj.pierce || proj.bounces) proj.hit = [];
    match.projectiles.push(proj);
  }
  SFX.play('shoot');
  match.kickT = KICK_TIME; match.kickFace = face8Of(Math.cos(ang), Math.sin(ang));   // pose de chutar hacia el rival
  match.atkCooldown = cdMult() / (match.atkSpeed * allK() * (buffActive('nectar') ? NECTAR_ATK : 1) * (pbActive('yellow') ? PBALL.yellow.mult : 1));
  if (hasRelic('nectarDioses')) match.hp = Math.max(1, match.hp - match.maxHp * 0.005);   // el néctar cuesta vida
}

/* ---- proyectiles: movimiento y colisiones ---- */
const BOUNCE_TRAIL = { every: 0.05, life: 2.4, dmg: 0.22, hitCd: 0.3, max: 320 };   // (antes 0,9 s)   // estela que dejan los balones de rebote: daña a quien la pisa
/* llamita pixel (12x12) estilo arcade para el rastro del rebote: 4 fotogramas que bailan,
   con el color de la afinidad (núcleo claro abajo, borde oscuro con contorno) */
const _trailFlame = {};
function trailFlameSprite(el, f){
  const key = el + f; if (_trailFlame[key]) return _trailFlame[key];
  const P = FX_PAL[el] || FX_PAL.fire, N = 12;
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return -1;
    const yy = y / (N - 1), sway = Math.sin((y + f * 3) * 0.9) * (1 - yy) * 1.3;
    const hw = 0.4 + 4.6 * Math.pow(yy, 0.85) * (yy > 0.78 ? 1 - (yy - 0.78) * 2.6 : 1);
    const dx = Math.abs(x + 0.5 - (N / 2 + sway));
    return dx < hw ? dx / hw : -1;
  };
  return (_trailFlame[key] = pixelSprite(N, (x, y) => {
    const t = inside(x, y), yy = y / (N - 1);
    if (t < 0) return (inside(x - 1, y) >= 0 || inside(x + 1, y) >= 0 || inside(x, y - 1) >= 0 || inside(x, y + 1) >= 0) ? (P.ink || '#1b1d26') : null;
    if (t < 0.38 && yy > 0.5) return P.core;
    if (t < 0.62 && yy > 0.28) return P.mid;
    if (t < 0.86) return P.hot;
    return P.deep;
  }));
}
function drawBounceTrail(camX, camY){
  const T = match.bounceTrail; if (!T || !T.length) return;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < T.length; i++){
    const s = T[i], k = 1 - s.t / BOUNCE_TRAIL.life;
    const sc = Math.max(2, Math.round(s.r / 4.5)), w = 12 * sc;
    const fr = (Math.floor(match.elapsed * 9) + i) % 4;
    const x = Math.round((s.x + camX - w / 2) / sc) * sc, y = Math.round((s.y + camY - w + s.r * 0.6) / sc) * sc;
    ctx.globalAlpha = k < 0.3 ? (Math.floor(match.elapsed * 12) % 2 ? 0.35 : 0.9) : 1;    // parpadea al apagarse (como en las recreativas)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + sc * 2, y + w - sc, w - sc * 4, sc);   // sombra en el suelo
    ctx.drawImage(trailFlameSprite(s.el || 'fire', fr), x, y, w, w);
  }
  ctx.restore();
}
function updateBounceTrail(dt){
  const T = match.bounceTrail = match.bounceTrail || [];
  for (const s of T){
    s.t += dt;
    for (const e of match.enemies){
      if (e.dead || (e.trailCd || 0) > match.elapsed) continue;
      const rr = s.r + 10 + (e.size || 0);
      if (Math.abs(e.x - s.x) < rr && Math.abs(e.y - s.y) < rr && Math.hypot(e.x - s.x, e.y - s.y) < rr){ e.trailCd = match.elapsed + BOUNCE_TRAIL.hitCd; damageEnemy(e, s.dmg, { element: s.el }); }
    }
  }
  match.bounceTrail = T.filter(s => s.t < BOUNCE_TRAIL.life);
}
function updateProjectiles(dt){
  for (const p of match.projectiles){
    p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt; p.life -= dt;
    if (p.style === 'bounce' && !p.ult && !p.ultBounce && p.life > 0){
      p.trailT = (p.trailT || 0) - dt;
      if (p.trailT <= 0 && (match.bounceTrail || []).length < BOUNCE_TRAIL.max){ p.trailT = BOUNCE_TRAIL.every; (match.bounceTrail = match.bounceTrail || []).push({ x: p.x, y: p.y, t: 0, r: p.r * 0.9, dmg: p.dmg * BOUNCE_TRAIL.dmg, el: p.element }); }
    }
  }
  updateBounceTrail(dt);
  for (const p of match.projectiles){
    if (p.life <= 0) continue;
    for (const e of match.enemies){
      if (e.dead) continue;
      if (p.hit && p.hit.includes(e)) continue;     // ya golpeó a este rival
      if (Math.hypot(p.x-e.x, p.y-e.y) >= 14 + p.r + (e.size || 0)) continue;

      damageEnemy(e, p.dmg, { crit:p.crit, chargeKind:p.techKind, ult:p.ultDmg, ultKind:p.ultKind, element:p.element, proj:true });
      if (p.patch) match.patches.push({ x:e.x, y:e.y, r:p.patch.r, dmg:p.patch.dmg, life:p.patch.dur, dur:p.patch.dur, fx:p.fx, el:p.element });
      if (p.hit) p.hit.push(e);

      // rebote: salta al rival cercano más próximo que aún no ha tocado
      if (p.bounces > 0){
        let next = null, nd = p.bounceRange || 260;
        for (const o of match.enemies){
          if (o.dead || p.hit.includes(o)) continue;
          const dd = Math.hypot(o.x-e.x, o.y-e.y);
          if (dd < nd){ nd = dd; next = o; }
        }
        if (next){
          const a = Math.atan2(next.y-e.y, next.x-e.x);
          p.x = e.x; p.y = e.y;
          p.vx = Math.cos(a)*9; p.vy = Math.sin(a)*9;
          p.bounces--; p.life = 1.0;
          break;
        }
      }
      if (!p.pierce){ p.life = 0; break; }   // sin rebote ni penetración: se gasta
    }
  }
  match.projectiles = match.projectiles.filter(p => p.life > 0);
}

/* daño a un rival (con ventaja/desventaja elemental).
   chargeKind = supertécnica que ha dado el golpe (carga su R) */
/* ---- supertécnicas al ritmo de PokéSurvivor ----
   Sus movimientos multiplican su daño ≈ ×3,5 del Nv.1 al 5 y ≈ ×7 al evolucionar; las nuestras
   subían hasta ×15-55. Esta tabla (medida con el bot: daño por segundo de cada supertécnica en cada
   nivel frente al disparo básico) las deja en ×1,5 (Nv.1) … ×9,5 (Nv.10) del disparo básico. */
const SP_AVG = 1.77;            // At. especial / daño medio de la base de datos de jugadores
const TECH_CORR = {
  pierce: [1.3, 0.365, 0.404, 0.425, 0.328, 0.319, 0.376, 0.354, 0.354, 0.317],
  bounce: [0.54, 0.63, 0.69, 0.86, 1.0, 1.05, 1.1, 1.15, 1.2, 1.2],
  orbit:  [0.57, 0.564, 0.563, 0.582, 0.475, 0.494, 0.448, 0.521, 0.598, 0.64],
  rain:   [0.269, 0.317, 0.201, 0.237, 0.177, 0.203, 0.185, 0.178, 0.149, 0.174],
  melee:  [0.432, 0.435, 0.49, 0.538, 0.277, 0.184, 0.186, 0.197, 0.199, 0.231],
};
function techDmgCorr(){
  const t = activeTech(); if (!t || !TECH_CORR[t.kind]) return 1;
  return TECH_CORR[t.kind][Math.max(0, Math.min(9, t.lvl - 1))] * (match.spRatio || 1);
}
/* los escudos de los bosses (Artist, Jude, Cloak, Walters) y las torres de Aphrodite salen SIEMPRE
   al 75%, 50% y 25% de vida: un golpe enorme no puede saltárselos (la vida se queda en ese %) */
const BOSS_GATES = [0.75, 0.5, 0.25];
const GATE_SHIELD = { shield: true, walters: true, royal: true, teleport: true };
function bossGate(e){
  if (e.special === 'byron'){
    const thr = BYRON.thresholds[e.towersDone || 0];
    if (thr !== undefined && e.hp < e.maxHp * thr) e.hp = e.maxHp * thr;      // hasta que apagues esa torre no baja de ahí
    return;
  }
  if (!GATE_SHIELD[e.special]) return;
  const i = e.gateIdx || 0, thr = BOSS_GATES[i];
  if (thr === undefined || e.hp >= e.maxHp * thr) return;
  e.hp = e.maxHp * thr; e.gateIdx = i + 1;
  startShield(e); if (e.specialCd !== undefined && GATE_SHIELD[e.special]) e.specialCd = Math.max(e.specialCd, 6);
}
function damageEnemy(e, amount, opts = {}){
  if (e.dead) return;
  if (!opts.noProc) amount *= techDmgCorr();
  if (pbActive('red')) amount *= PBALL.red.mult;                        // balón rojo: más ataque
  if (e.boss){
    if (e.towerShield){ if (!(e.blockTxtAt > match.elapsed)){ e.blockTxtAt = match.elapsed + 0.5; addFloatText(e.x, e.y - 50, '¡Bloqueado!', '#ffd84a'); } return; }   // Aphrodite con torre activa
    if (e.shieldUntil > match.elapsed){                                 // escudo (Artist / Walters): aguanta hasta un umbral de daño
      e.shieldHp -= amount;
      if (Math.random() < 0.2) addFloatText(e.x, e.y - 30, '🛡️', e.shieldColor || '#e45fa8');
      if (e.shieldHp <= 0){ e.shieldUntil = 0; addFloatText(e.x, e.y - 50, '💥 ¡Escudo roto!', '#ffffff');
        match.effects.push({ x:e.x, y:e.y, fixed:true, maxR:70, life:0.35, dur:0.35, color:e.shieldColor || '#e45fa8' }); }
      return;
    }
    if (e.special === 'royal' && Math.random() < JUDE_DODGE){            // Jude esquiva
      if (!(e.dodgeTxtAt > match.elapsed)){ e.dodgeTxtAt = match.elapsed + 0.35; addFloatText(e.x, e.y - 40, 'Esquivado', '#9fb4ff'); }
      return;
    }
  }
  if (e.boss && opts.ult) amount *= 0.6;                                // las R hacen menos a los bosses
  const eEl = e.affEl || e.element;                                    // (los bosses tienen una afinidad al azar distinta de la de su dibujo)
  let mult = elementMult(opts.element || match.element, eEl);
  // técnica definitiva (R): doble afinidad — usa la que mejor le venga contra ese rival
  let dual = false;
  if (opts.ult){
    const e2 = ultSecond(opts.element || match.element, opts.ultKind || (ultPart(activeTech()) || {}).kind);
    if (e2){ const m2 = elementMult(e2, eEl); if (m2 > mult){ mult = m2; dual = true; } }
    // mezcla de 4 (o fusión): la R pega con la afinidad que mejor le venga de TODAS las que llevas mezcladas
    for (const q of techParts(activeTech())){ if (!q.element || isBuffKind(q.kind)) continue; const m3 = elementMult(q.element, eEl); if (m3 > mult){ mult = m3; dual = true; } }
  }
  const hit = amount * mult * weatherMult(opts.element || match.element) * (buffActive('nectar') ? NECTAR_DMG : 1) * talentDmgMult(mult, opts.ult);
  e.hp -= hit;
  if (e.boss && !e.dead) bossGate(e);                    // escudos / torres: siempre salen en su % de vida, aunque le pegues de golpe
  // Dragón (pasiva): remata a los rivales normales que se quedan con menos del 10%
  if (match.element === 'dragon' && e.hp > 0 && !e.boss && !e.miniBoss && !e.special && e.hp < e.maxHp * AFF.execute) e.hp = 0;
  if (!opts.noProc){ relicOnHit(e, hit); affinityOnHit(e, hit, opts); }
  if (opts.crit) addFloatText(e.x, e.y - 18, `${Math.round(hit)}!`, '#f2b705');
  else if (hit >= 0.5) addDamageText(e, hit);          // contador de daño en cada golpe
  else showElementHint(e, mult);
  if (opts.chargeKind) addCharge(opts.chargeKind);
  if ((e.special === 'willy' || e.special === 'kappah') && e.hp > 0) startWillyFlee(e);
  if (e.hp <= 0){
    e.dead = true;
    if (e.boss){
      const alive = (match.bossGroup || []).filter(o => !o.dead);
      if (alive.length){                                                 // quedan hermanos en pie: recuperan un 30% de su vida
        match.boss = alive[0];
        for (const o of alive){ const h = o.maxHp * MURDOCK_REGEN; o.hp = Math.min(o.maxHp, o.hp + h); addFloatText(o.x, o.y - 50, `+${Math.round(h)}`, '#6fdc8c'); }
        showBanner(`¡${e.name} derrotado!`, alive.length > 1 ? `Quedan ${alive.length} y se curan un 30%` : 'Queda uno: ya no se cura', getElement(e.element).color);
        return;
      }
      onBossDefeated(e); return;
    }
    dropLoot(e);
    maybeDropItem(e);
  }
}

/* ---- gemas: el imán las atrae y al tocarlas das experiencia y monedas ---- */
const GEM_CAP = 140;   // si hay más gemas/monedas en el suelo, las de lejos se juntan en una sola (menos lag)
function mergeGems(){
  const far = match.gems.filter(g => !g.pull && !g.ticket && g.kind !== 'bag');
  if (match.gems.length <= GEM_CAP || far.length < 20) return;
  far.sort((a, b) => Math.hypot(b.x - match.x, b.y - match.y) - Math.hypot(a.x - match.x, a.y - match.y));
  const n = Math.min(far.length - 1, match.gems.length - GEM_CAP + 40);
  // se agrupan por zonas de 300 px: cada zona queda con una gema grande con toda su experiencia y monedas
  const zones = new Map();
  for (const g of far.slice(0, n)){
    const key = Math.floor(g.x / 300) + ',' + Math.floor(g.y / 300);
    const z = zones.get(key);
    if (!z){ zones.set(key, g); continue; }
    z.xp = (z.xp || 0) + (g.xp || 0); z.coin = (z.coin || 0) + (g.coin || 0); z.big = true; if (z.coin && z.kind === 'coin' && z.xp) z.kind = undefined;
    g.got = true;
  }
  match.gems = match.gems.filter(g => !g.got);
}
function updateGems(dt){
  if (match.gems.length > GEM_CAP) mergeGems();
  for (const g of match.gems){
    const dx = match.x - g.x, dy = match.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 22){
      g.got = true;
      collectPickup(g);
      continue;
    }
    if (g.pull || d < match.pickup){
      g.pull = true; g.pt = (g.pt || 0) + dt;                       // una vez te persigue ya no para, y cada vez va más rápido
      const step = Math.min(d, Math.min(30, (g.fast ? 22 : 9) + g.pt * 14) * 60 * dt);
      g.x += dx / d * step; g.y += dy / d * step;
    }
  }
  match.gems = match.gems.filter(g => !g.got);
}

/* recoger una gema, monedas o un ticket */
function collectPickup(g){
  match.xp += (g.xp || 0) * effXpMult();
  match.coinsEarned += g.coin || 0;
  if (g.kind === 'bag') addFloatText(match.x, match.y - 30, `+${g.coin} monedas`, '#f2b705');
  if (g.ticket){
    if (g.purple){ match.ticketsEpicEarned = (match.ticketsEpicEarned || 0) + g.ticket; addFloatText(match.x, match.y - 40, '¡Ticket morado!', '#c48bff'); }
    else { match.ticketsEarned += g.ticket; addFloatText(match.x, match.y - 40, 'Ticket amarillo', '#f2d21f'); }
  }
}

/* ---- talentos: lectura de efectos ---- */
function talentLvl(key){ const t = match.talents.find(tt => tt.key === key); return t ? t.lvl : 0; }
/* valor total de un talento en tanto por uno (p. ej. Ataque+ Nv. 3 = 0,30) */
function tval(key){ return TALENT_VAL[key] * talentLvl(key) / 100; }
function lowHp(){ return match.hp / match.maxHp < LOW_HP; }
function effDodge(){
  return Math.min(75, match.dodge + 100 * tval('vamosTodos') * 0.5 + 100 * tval('portero') + (lowHp() ? 100 * tval('piscinazo') : 0) + nbBonus('nbDribble'));
}
/* crítico: base + mejoras + Lance crítico + Luz certera + objetos + nivel del jugador (+0,5% por nivel, hasta +25%) */
const CRIT_PER_LEVEL = 0.5, CRIT_LEVEL_MAX = 25;
function critFromLevel(){ return Math.min(CRIT_LEVEL_MAX, CRIT_PER_LEVEL * (match.level || 1)); }
function effCritRaw(){ return match.crit + (match.element === 'celestial' ? AFF.crit : 0) + 100 * tval('lance') + (hasRelic('camiseta') && lowHp() ? 25 : 0)
  + (hasRelic('manto') && match.hp / match.maxHp < 0.2 ? 40 : 0) + critFromLevel(); }
function effCrit(){ return effCritRaw() + 100 * tval('vamosTodos') * 0.5; }
function effXpMult(){ return match.xpMult * allK() * (1 + tval('vagueza')) * (hasRelic('gafas') ? 1.3 : 1) * xpTimeK(); }   // cada vez cuesta más ganar experiencia
/* desbordamiento: cada 1% de crítico por encima del 100% suma +0,02 al multiplicador */
function effCritMult(){ return match.critMult + tval('tiro') + 0.02 * Math.max(0, effCritRaw() - 100); }
function talentSpeedMult(){
  return allK() * (1 + tval('rapidez')) * (lowHp() ? 1 + tval('fuerzaDef') : 1) * (1 + (nbBonus('nbSpeed') + nbLoneSpeed()) / 100) * (hasRelic('botasHalcon') ? 1.3 : 1);
}
/* cuaderno de velocidad SOLO en uso: la velocidad sube a la vez que se llena el círculo
   (vacío = +0 %, lleno = el mismo máximo que da al cambiar de supertécnica) */
function nbLoneSpeed(){
  if (!match) return 0;
  const t = activeTech();
  if (!t || t.kind !== 'nbSpeed' || t.fused) return 0;
  return nbPow('nbSpeed', t.lvl) * Math.min(1, t.nbCharge || 0);
}
/* lone = cuaderno sin fusionar en uso (mientras tanto no atacas) */
function loneNotebook(){ const t = activeTech(); return !!t && isBuffKind(t.kind) && !t.fused; }
/* bonus activo de un cuaderno:
   - fusionado con la supertécnica que usas: permanente
   - cargado y luego cambiado a la otra supertécnica: durante el tiempo del círculo */
function nbBonus(kind){
  if (!match) return 0;
  const t = activeTech();
  if (t && t.fused){
    const ps = techParts(t), me = ps.find(q => q.kind === kind);
    if (me && ps.some(q => q !== me && !isBuffKind(q.kind))) return nbPow(kind, me.lvl);
  }
  if (match.nbUntil && match.nbUntil[kind] > match.elapsed && !loneNotebook()) return nbPow(kind, match.nbLvl[kind]);
  return 0;
}
function talentDmgMult(elemMult, isUlt){
  let m = (1 + tval('ataque')) * (1 + nbBonus('nbShoot') / 100) * relicDmgMult();
  m *= 1 + tval('aMuerte') * (1 - Math.max(0, match.hp) / match.maxHp);
  if (elemMult > 1) m *= 1 + tval('cargaElem');
  if (elemMult < 1) m *= 1 + tval('antiAfin');
  if (isUlt) m *= 1 + tval('ultra');
  return m * vamosMult() * allK();
}
/* carga que necesita la R (Ahorro la reduce) */
function chargeNeeded(){ return CHARGE_MAX * (1 - Math.min(0.75, tval('ahorro'))); }

/* la gema cambia de color según cuánta experiencia da */
const GREEN_GEM_DOWNGRADE = 0.5;   // probabilidad de que una gema verde salga como azul pequeña
function gemEmoji(xp){ return xp >= 15 ? '🟣' : xp >= 7 ? '🔵' : '🟢'; }
function gemTier(xp){ return xp >= 15 ? 'l' : xp >= 7 ? 'm' : 's'; }

/* ---- objetos del suelo ---- */
function buffActive(k){ return match.buffs[k] > match.elapsed; }

/* ======================================================================
   BALONES DE PODER: salen por el campo al azar (sin avisar). Se guardan (hasta 6 de cada)
   y se activan con 1 / 2 / 3 / 4:
   1 rojo = más ataque · 2 azul = más velocidad · 3 verde = escudo total · 4 amarillo = más velocidad de ataque
   ====================================================================== */
const PBALL = {
  order: ['red', 'blue', 'green', 'yellow'],
  red:    { name: 'Balón rojo',     desc: '+50% de ataque',            dur: 8, color: '#ff4a3c', mult: 1.5 },
  blue:   { name: 'Balón azul',     desc: '+40% de velocidad',          dur: 8, color: '#4f9dff', mult: 1.4 },
  green:  { name: 'Balón verde',    desc: 'Escudo: no recibes daño',    dur: 4, color: '#4fd05a' },
  yellow: { name: 'Balón amarillo', desc: '+60% de velocidad de ataque', dur: 8, color: '#ffd21e', mult: 1.6 },
  maxEach: 6, maxGround: 6, life: 45, every: [11, 19], fieldSpawn: false, dropChance: 0.012,   // ya no salen solos: los suelta un rival al caer (1,2%)   // uno cada ~11-19 s y como mucho 6 en el suelo
};
const PBALL_IMG = { img: new Image(), ok: false }; PBALL_IMG.img.onload = () => { PBALL_IMG.ok = true; }; PBALL_IMG.img.src = 'assets/ui/pballs.png';
function pbInit(){ if (!match.pb) match.pb = { inv: { red: 0, blue: 0, green: 0, yellow: 0 }, until: {}, ground: [], next: 6 }; return match.pb; }
function pbActive(k){ const P = match && match.pb; return !!P && P.until[k] > match.elapsed; }
function pbLeft(k){ const P = match && match.pb; return P ? Math.max(0, (P.until[k] || 0) - match.elapsed) : 0; }
function usePBall(i){
  const P = pbInit(), k = PBALL.order[i]; if (!k || P.inv[k] <= 0 || match.paused) return;
  P.inv[k]--; P.until[k] = Math.max(P.until[k] || 0, match.elapsed) + PBALL[k].dur;   // si ya estaba, se alarga
  addFloatText(match.x, match.y - 46, PBALL[k].desc, PBALL[k].color);
  match.effects.push({ x: match.x, y: match.y, fixed: true, maxR: 70, life: 0.35, dur: 0.35, color: PBALL[k].color });
  SFX.play('switch'); renderPBallBar();
}
function updatePBalls(dt){
  const P = pbInit();
  if (match.inArena) return;
  P.next -= dt;
  if (PBALL.fieldSpawn && P.next <= 0){
    P.next = PBALL.every[0] + Math.random() * (PBALL.every[1] - PBALL.every[0]);
    if (P.ground.length < PBALL.maxGround){
      let x, y, tries = 0;
      do { const a = Math.random() * 6.28, r = 260 + Math.random() * 420; x = match.x + Math.cos(a) * r; y = match.y + Math.sin(a) * r; }
      while ((x < 60 || y < 60 || x > FIELD_W - 60 || y > FIELD_H - 60 || obstacleAt(x, y, 24)) && ++tries < 25);
      if (tries < 25) P.ground.push({ k: PBALL.order[Math.floor(Math.random() * 4)], x, y, t: 0, ph: Math.random() * 6 });   // sin aviso
    }
  }
  for (const b of P.ground){
    b.t += dt;
    const d = Math.hypot(match.x - b.x, match.y - b.y);
    if (P.inv[b.k] >= PBALL.maxEach) continue;                    // ya llevas 6 de ese color: no lo coges
    if (b.pull || d < match.pickup * 0.6){ b.pull = true; b.pt = (b.pt || 0) + dt; const sp = Math.min(1500, 260 + b.pt * 700) * dt; b.x += (match.x - b.x) / (d || 1) * sp; b.y += (match.y - b.y) / (d || 1) * sp; }
    if (d < 26){ b.got = true; P.inv[b.k]++; SFX.play('select'); renderPBallBar(); }
  }
  P.ground = P.ground.filter(b => !b.got && b.t < PBALL.life);
}
/* balones en el suelo: sprite pixel que bota un poco, con brillo de su color */
function drawPBallsGround(camX, camY){
  const P = match.pb; if (!P || match.inArena || !PBALL_IMG.ok) return;
  for (const b of P.ground){
    const x = b.x + camX, y = b.y + camY; if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
    const bob = Math.abs(Math.sin(match.elapsed * 4 + b.ph)) * 6, fade = b.t > PBALL.life - 5 ? (Math.floor(match.elapsed * 8) % 2 ? 0.35 : 1) : 1;
    const sh = 1 - bob / 14;                                              // sombra que se encoge al botar
    ctx.save(); ctx.globalAlpha = 0.5 * fade; ctx.fillStyle = '#1a1208'; ctx.beginPath(); ctx.ellipse(x, y + 9, 9 * sh, 3.5 * sh, 0, 0, 6.28); ctx.fill();
    ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = PBALL[b.k].color; ctx.beginPath(); ctx.arc(x, y - bob, 13, 0, 6.28); ctx.fill();
    ctx.globalAlpha = fade; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(PBALL_IMG.img, PBALL.order.indexOf(b.k) * 16, 0, 16, 16, Math.round(x - 12), Math.round(y - 12 - bob), 24, 24);
    ctx.restore();
  }
}
/* efecto alrededor del jugador mientras dura cada balón (parpadea cuando se va a acabar) */
function drawPBallAuras(feetX, feetY){
  const P = match.pb; if (!P) return;
  const t = match.elapsed, blink = k => { const l = pbLeft(k); return l > 0 && (l > 1.5 || Math.floor(t * 12) % 2 === 0); };
  const cy = feetY - 26;
  ctx.save();
  if (blink('red')){                                              // ataque: llamitas rojas alrededor
    for (let k = 0; k < 8; k++){ const a = t * 3 + k * 0.785, r = 30 + 3 * Math.sin(t * 9 + k), x = feetX + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.6;
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#1b1d26'; ctx.fillRect(x - 4, y - 7, 8, 10); ctx.fillStyle = '#ff4a3c'; ctx.fillRect(x - 3, y - 6, 6, 8); ctx.fillStyle = '#ffd21e'; ctx.fillRect(x - 1, y - 2, 2, 3); }
  }
  if (blink('yellow')){                                           // velocidad de ataque: anillo de destellos amarillos
    ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffd21e'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 80;
    ctx.beginPath(); ctx.ellipse(feetX, feetY - 2, 30, 11, 0, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
    for (let k = 0; k < 4; k++){ const a = -t * 5 + k * 1.57, x = feetX + Math.cos(a) * 24, y = cy - 8 + Math.sin(a) * 26;
      ctx.fillStyle = '#fff6b0'; ctx.fillRect(x - 1, y - 5, 2, 10); ctx.fillRect(x - 5, y - 1, 10, 2); }
  }
  if (blink('blue')){                                             // velocidad: estela y rayas azules
    const mv = match.aim || { x: 0, y: 0 };
    for (let k = 1; k <= 3; k++){ ctx.globalAlpha = 0.45 - k * 0.12; ctx.fillStyle = '#4f9dff'; ctx.beginPath(); ctx.ellipse(feetX - mv.x * k * 10, cy - mv.y * k * 10, 16, 24, 0, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#bfe0ff';
    for (let k = 0; k < 3; k++){ const oy = cy - 18 + k * 14, ox = feetX - 26 - ((t * 120 + k * 20) % 30); ctx.fillRect(ox, oy, 14, 2); ctx.fillRect(feetX + 14 + ((t * 120 + k * 20) % 30), oy + 6, 14, 2); }
  }
  if (blink('green')){                                            // escudo: esfera verde
    const R = 38 + Math.sin(t * 8) * 1.5, g = ctx.createRadialGradient(feetX - 12, cy - 14, 4, feetX, cy, R);
    g.addColorStop(0, 'rgba(220,255,220,0.15)'); g.addColorStop(0.75, 'rgba(79,208,90,0.18)'); g.addColorStop(1, 'rgba(79,208,90,0.55)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(feetX, cy, R, 0, 6.28); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#1b4a1e'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#9dff8a'; ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(feetX, cy, R * 0.75, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
  }
  ctx.restore();
}
/* barra de los 4 balones (abajo a la izquierda): cantidad, tecla y tiempo que le queda */
function renderPBallBar(){
  const bar = document.getElementById('pball-bar'); if (!bar || !match) return;
  const P = pbInit();
  bar.classList.remove('hidden');
  bar.innerHTML = PBALL.order.map((k, i) => {
    const left = pbLeft(k), n = P.inv[k];
    return `<div class="pb-slot${n ? '' : ' pb-empty'}${left > 0 ? ' pb-on' : ''}" style="--c:${PBALL[k].color}" title="${PBALL[k].name}: ${PBALL[k].desc}">
      <kbd>${i + 1}</kbd><i class="pb-ico" style="background-position:${-i * 32}px 0"></i><b>${n}</b>${left > 0 ? `<em>${Math.ceil(left)}s</em>` : ''}</div>`;
  }).join('');
}

function maybeDropItem(e, force = false){
  if (!force && Math.random() >= DROP_CHANCE) return;
  const total = Object.values(ITEMS).reduce((a, it) => a + it.weight, 0);
  let r = Math.random() * total;
  for (const [key, it] of Object.entries(ITEMS)){
    if (r < it.weight){ match.items.push({ key, x:e.x, y:e.y, life:ITEM_LIFE }); return; }
    r -= it.weight;
  }
}

/* silbato / imán: atrae toda la experiencia, monedas, objetos del suelo (leche, agua…) y balones de poder */
function pullAllPickups(){
  for (const g of match.gems){ g.pull = true; g.fast = true; }
  for (const it of match.items) it.pull = true;
  for (const b of (match.pb ? match.pb.ground : [])) b.pull = true;
}
function updateItems(dt){
  for (const it of match.items){
    it.life -= dt;
    const dx = match.x - it.x, dy = match.y - it.y, d = Math.hypot(dx, dy) || 1;
    if (it.pull || d < match.pickup){                 // el imán también atrae los objetos
      it.pull = true; it.pt = (it.pt || 0) + dt;
      const step = Math.min(d, Math.min(26, 9 + it.pt * 12) * 60 * dt);
      it.x += dx / d * step; it.y += dy / d * step;
    }
    if (Math.hypot(it.x - match.x, it.y - match.y) < 34){
      it.life = 0;
      useItem(it.key);
    }
  }
  match.items = match.items.filter(it => it.life > 0);
}

/* bomba: explosión grande alrededor del jugador que daña a todos los rivales del área */
function bombBlast(x, y){
  const P = psEnemyStats(psTime()), dmg = Math.max(match.dmg * BOMB.dmgMul, P.hp * BOMB.kill);
  for (const e of match.enemies){
    if (e.dead || bossInvisible(e)) continue;
    const d = Math.hypot(e.x - x, e.y - y); if (d > BOMB.r + (e.size || 0)) continue;
    damageEnemy(e, (e.boss || e.miniBoss) ? e.maxHp * BOMB.bossPct : dmg, { noProc: true, element: 'fire' });
    if (!e.boss && !e.dead){ const k = 40 * (1 - d / BOMB.r); e.x += (e.x - x) / (d || 1) * k; e.y += (e.y - y) / (d || 1) * k; }   // los empuja
  }
  match.effects.push({ x, y, fixed:true, maxR: BOMB.r, life:0.45, dur:0.45, color:'#ff8a3a', fill:true });
  match.effects.push({ x, y, fixed:true, maxR: BOMB.r * 0.6, life:0.3, dur:0.3, color:'#ffe14a', fill:true });
  match.effects.push({ x, y, fixed:true, maxR: BOMB.r * 1.1, life:0.55, dur:0.55, color:'#ffffff' });
  if (typeof isFireFx === 'function' && typeof emitEmber === 'function'){ isFireFx('fire'); for (let k = 0; k < 40; k++){ const a = Math.random() * 6.28, r = Math.random() * BOMB.r * 0.8; emitEmber(x + Math.cos(a) * r, y + Math.sin(a) * r, { spread: 220, r: 3 + Math.random() * 4 }); } }
  SFX.play('thunder');
}
function useItem(key){
  const it = ITEMS[key];
  if (key === 'water' || key === 'nectar'){
    match.buffs[key] = match.elapsed + it.dur;          // volver a cogerlo reinicia la duración
  } else if (key === 'whistle'){
    pullAllPickups();
  } else if (key === 'bomb'){
    bombBlast(match.x, match.y);
  } else if (key === 'rice'){
    const heal = 25 + match.maxHp * 0.15;
    match.hp = Math.min(match.maxHp, match.hp + heal);
    addFloatText(match.x, match.y - 46, `+${Math.round(heal)}`, it.color);
  }
  addFloatText(match.x, match.y - 30, `${it.emoji} ${it.text}`, it.color);
}

/* ======================================================================
   LÓGICA DEL ÁRBITRO Y LOS BOSSES
   ====================================================================== */
function updateReferee(dt){
  // aparece el árbitro en un punto aleatorio del campo (lejos del jugador)
  if (!match.referee && !match.inArena && !match.boss && !match.bossSpawn && match.bossIdx < BOSSES.length
      && matchClock() >= match.nextRefAt){
    let x, y, tries = 0;
    do {
      x = 120 + Math.random() * (FIELD_W - 240);
      y = 120 + Math.random() * (FIELD_H - 240);
    } while ((Math.hypot(x - match.x, y - match.y) < 450 || obstacleAt(x, y, 50)) && ++tries < 30);
    match.referee = { x, y, until: match.elapsed + REFEREE_WAIT };
    SFX.play('whistle');
    showBanner('¡Ha salido el árbitro!', `Tócalo antes de ${REFEREE_WAIT} s o pitará el final del partido`, '#f2b705');
  }
  // si tardas más de 1 minuto en llegar, el árbitro pita el final y pierdes el partido
  if (match.referee && match.elapsed >= (match.referee.until ?? Infinity)){ SFX.play('whistle_end'); endMatch(false, 'referee'); return; }
  // al tocarlo pita y anuncia al boss
  if (match.referee && Math.hypot(match.referee.x - match.x, match.referee.y - match.y) < 40){
    match.referee = null;
    const def = BOSSES[match.bossIdx];
    match.arenaColor = def.color || '#b377e0';
    enterArena();
    if (def.special === 'byron') setupByronTowers();   // Aphrodite: las torres ya están en la arena al entrar
    startStrike();                                   // destellos blancos al entrar al duelo
    match.bossSpawn = { x: ARENA_W / 2, y: 190, t: 1.8, dur: 1.8 };
    showVsIntro(def);
    showBanner(`${def.emoji} ${def.name}`, `${def.team} · ${getElement(def.element).emoji} ${getElement(def.element).name}`, getElement(def.element).color);
  }
  if (match.bossSpawn){
    match.bossSpawn.t -= dt;
    if (match.bossSpawn.t <= 0){ spawnBoss(match.bossSpawn.x, match.bossSpawn.y); match.bossSpawn = null; }
  }
}

function spawnBoss(x, y){   // (y puede cambiar para Aphrodite, que sale en el centro)
  const i = match.bossIdx;
  const def = BOSSES[i];
  const PB = psBossStats(psTime());                 // vida y daño de jefe de PokéSurvivor para este minuto
  const hp = PB.hp * (PS_BOSS_HP[i] ?? 1);
  const parts = def.group || [def];
  match.bossGroup = [];
  parts.forEach((p, k) => {
    const n = parts.length;
    const bx = n > 1 ? ARENA_W * (k + 1) / (n + 1) : def.special === 'byron' ? ARENA_W / 2 : x;
    if (def.special === 'byron') y = ARENA_H / 2;
    const boss = {
      boss:true, idx:i, name:p.name, team:def.team, emoji:p.emoji, element: sheetElement(BOSS_SHEETS[p.name]) || p.element,
      x:bx, y, size:20, hp: hp / n, maxHp: hp / n, speed:0.8,
      dmg: PB.dmg,                                // daño por contacto
      shotDmg: PB.shot,                           // daño de cada proyectil
      attacks:p.attacks, attackIdx:k, special: def.special || null,
      attackCd: 2 + k * 0.7, attackEvery: def.attackEvery || Math.max(1.8, 3 - 0.12 * i) * (n > 1 ? 1.3 : 1),
      pending: [], specialCd: 3,
    };
    boss.affEl = ELEMENT_ORDER[Math.floor(Math.random() * ELEMENT_ORDER.length)];   // afinidad al azar en cada partido (su dibujo y sus ataques siguen igual)
    if (def.hpMult){ boss.hp *= def.hpMult; boss.maxHp *= def.hpMult; }
    if (boss.special === 'royal'){ boss.speed = 1.5; boss.dmg *= 1.4; boss.orbAng = 0; }
    if (boss.special === 'murdock'){ boss.speed = 1.45; boss.specialCd = 3 + k * 1.8; }   // los Murdock corren mucho y se teletransportan por turnos
    if (p.name === 'Marvin Murdock'){ boss.ultList = ['bounce', 'rain']; boss.ultIdx = 0; }   // Marvin: Pájaro de fuego y Triángulo Z
    if (boss.special === 'byron'){ boss.speed = 0; boss.towersDone = 0; boss.fistCd = 2.5; boss.ultList = ['rain', 'bounce']; boss.ultIdx = 0; if (!(match.towers || []).length) setupByronTowers(); }   // Sabiduría divina y Flecha divina
    if (boss.special === 'shield' || boss.special === 'walters') boss.specialCd = 2;
    // vida mínima según tu daño inicial: aunque vayas muy fuerte, un boss dura al menos ~10 s
    boss.speed *= BOSS_BOOST;
    match.enemies.push(boss);
    match.bossGroup.push(boss);
    match.effects.push({ x:bx, y, fixed:true, maxR:120, life:0.5, dur:0.5, color:getElement(p.element).color });
  });
  match.boss = match.bossGroup[0];
  match.bossMarks = []; match.bossStomp = null; match.murdockZCd = MURDOCK_Z_FIRST;
  document.getElementById('boss-emoji').innerHTML = (def.group || [def]).map(p => bossFace(p.name, 30) || p.emoji).join('');
  document.getElementById('boss-name').textContent = def.name;
  { const tm = TEAM_BY_ID[(def.team || '').toLowerCase()], ci = document.getElementById('boss-crest');   // escudo de su equipo
    if (ci){ if (tm && tm.crest){ ci.src = encodeURI(tm.crest); ci.style.display = ''; } else ci.style.display = 'none'; } }
  document.getElementById('boss-team').innerHTML = def.group ? `${def.team} · ${match.bossGroup.map(o => elIcon(o.affEl, 14)).join('')}` : `${def.team} · ${elLabel(match.bossGroup[0].affEl, 14)}`;   // afinidad de este partido (al azar)
  document.getElementById('boss-bar').style.setProperty('--c', getElement(def.element).color);
  document.getElementById('boss-bar').classList.remove('hidden');
}

/* ---- lo que hace único a cada boss (sección 7) ---- */
const BOSS_DARK = { dark: 230, teleport: 330 };     // radio de visión cuando el boss oscurece el mapa
const BOSS_SHIELD = { dur: 5, every: 15, breakAt: 0.08, color: { shield:'#e45fa8', walters:'#7fd03a', royal:'#5f8cff', teleport:'#b0b6c8' } };
const EXTRA_SHIELD = { royal: true, teleport: true };   // Jude y Cloak también se ponen escudo (aparte de su habilidad)   // breakAt = % de su vida que rompe el escudo
const JUDE_DODGE = 0.38;                            // Jude esquiva ~35-40% de tus golpes
const MURDOCK_REGEN = 0.30;                         // al caer un hermano, los otros recuperan un 30%
/* zona marcada en el suelo que, al acabar el aviso, golpea (puños de Feldt, rocas de Walters, misiles) */
function bossMark(x, y, dur, r, dmg, kind, color, extra = {}){
  match.bossMarks.push({ x, y, t: 0, dur, r, dmg, kind, color, ...extra });
}
function startShield(b){
  b.shieldUntil = match.elapsed + BOSS_SHIELD.dur;
  b.shieldHp = b.maxHp * BOSS_SHIELD.breakAt;
  b.shieldColor = BOSS_SHIELD.color[b.special] || '#e45fa8';
  addFloatText(b.x, b.y - 50, '🛡️ ¡Escudo!', b.shieldColor);
}
/* ======================================================================
   APHRODITE (Byron Love): quieto en el centro. Hora celestial permanente (te ralentiza un 45%),
   puños divinos telegrafiados y 3 torres de poder que se activan al 75 / 50 / 25 % de su vida.
   Con una torre activa tiene escudo total y se cura; quédate ~6 s dentro de la torre para apagarla.
   ====================================================================== */
const BYRON = { zoneR: 300, slow: 0.45, towerR: 88, towerTime: 6, towerDecay: 0.5, heal: 0.015, thresholds: [0.75, 0.5, 0.25] };
function byronBoss(){ return (match.bossGroup || []).find(b => b.special === 'byron' && !b.dead) || null; }
function setupByronTowers(){
  const cx = ARENA_W / 2, cy = ARENA_H / 2, R = BYRON.zoneR;   // las torres están sobre el círculo del tiempo
  match.towers = [0, 1, 2].map(k => { const a = -Math.PI / 2 + k * Math.PI * 2 / 3;
    return { x: Math.max(70, Math.min(ARENA_W - 70, cx + Math.cos(a) * R)), y: cy + Math.sin(a) * R, active: false, done: false, prog: 0 }; });
  match.rocks = (match.rocks || []).filter(r => !match.towers.some(t => Math.hypot(r.x - t.x, r.y - t.y) < BYRON.towerR + r.r + 20) && Math.hypot(r.x - cx, r.y - cy) > 90);
}
function inHoraCelestial(){ const b = byronBoss(); if (b && Math.hypot(match.x - b.x, match.y - b.y) < BYRON.zoneR) return true;
  const m = match.mark; return !!m && !m.tpAt && Math.hypot(match.x - m.x, match.y - m.y) < MARK.orbitR + 30; }   // también el círculo de Mark
function updateByron(b, dt){
  const frac = b.hp / b.maxHp, T = match.towers || [];
  const act = T.find(t => t.active);
  if (!act && b.towersDone < 3 && frac <= BYRON.thresholds[b.towersDone]){          // se enciende la siguiente torre
    const t = T[b.towersDone]; if (t){ t.active = true; t.prog = 0; }
    b.towerShield = true; b.ult = null; b.jumpH = 0;
    showBanner('¡Torre de poder!', 'Quédate dentro de su círculo para desactivarla', '#ffd84a', true);
  }
  const on = T.find(t => t.active);
  if (on){
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * BYRON.heal * dt);                     // se cura mientras la torre está encendida
    const inside = Math.hypot(match.x - on.x, match.y - on.y) < BYRON.towerR;
    on.prog = inside ? Math.min(1, on.prog + dt / BYRON.towerTime) : Math.max(0, on.prog - dt * BYRON.towerDecay / BYRON.towerTime);
    if (on.prog >= 1){
      on.active = false; on.done = true; b.towerShield = false; b.towersDone++;
      match.effects.push({ x: on.x, y: on.y, fixed: true, maxR: 180, life: 0.5, dur: 0.5, color: '#ffffff', fill: true });
      showBanner('¡Torre desactivada!', b.towersDone >= 3 ? '¡Ya no le quedan escudos: remátalo!' : `Quedan ${3 - b.towersDone}`, '#ffd84a');
    }
  } else b.towerShield = false;
  // puños divinos: balones divinos que caen donde estás (1 s de aviso), ráfagas de 3-5; más rápidos con menos vida
  if (b.fistsLeft > 0){
    b.fistCd -= dt;
    if (b.fistCd <= 0){ b.fistsLeft--; b.fistCd = 0.3 + 0.2 * frac;
      bossMark(match.x + (Math.random() - 0.5) * 50, match.y + (Math.random() - 0.5) * 50, 1.0, 64, b.shotDmg * 2, 'ult', '#ffd84a', { el: 'celestial' }); }
  } else {
    b.burstCd = (b.burstCd ?? 2.5) - dt * (b.towerShield ? 0.35 : 1);              // con la torre encendida ataca mucho más suave
    if (b.burstCd <= 0 && !b.ult){ b.fistsLeft = 3 + Math.floor(Math.random() * 3); b.fistCd = 0; b.burstCd = 1.8 + 2.4 * frac; }
  }
}
/* teletransporte: destello de aviso donde va a salir, desaparece y aparece cerca de ti y ataca */
function bossTeleport(b, attack, every){
  if (b.tpAt){
    if (match.elapsed >= b.tpAt){
      match.effects.push({ x:b.x, y:b.y, fixed:true, maxR:60, life:0.3, dur:0.3, color:'#5f6575', fill:true });
      b.x = b.tpX; b.y = b.tpY; b.tpAt = 0;
      match.effects.push({ x:b.x, y:b.y, fixed:true, maxR:70, life:0.35, dur:0.35, color:'#ffffff', fill:true });
      if (attack) bossAttack(b, attack);
      else { const a = Math.atan2(match.y - b.y, match.x - b.x); match.enemyShots.push({ x:b.x, y:b.y, vx:Math.cos(a) * 4.6, vy:Math.sin(a) * 4.6, r:11, dmg:b.shotDmg * 0.8, element:b.element, affEl:b.affEl, life:3.5 }); }   // al aparecer, un disparo básico
    }
    return;
  }
  if (b.specialCd <= 0){
    b.specialCd = every;
    const a = Math.random() * Math.PI * 2, r = 170 + Math.random() * 90;
    b.tpX = Math.max(40, Math.min(ARENA_W - 40, match.x + Math.cos(a) * r));
    b.tpY = Math.max(40, Math.min(ARENA_H - 40, match.y + Math.sin(a) * r));
    b.tpAt = match.elapsed + 0.55;
    match.effects.push({ x:b.tpX, y:b.tpY, fixed:true, maxR:55, life:0.55, dur:0.55, color:'#d8dde8' });   // destello previo
  }
}
function updateBossSpecial(b, dt){
  if (b.special === 'byron'){ updateByron(b, dt); return; }
  if (EXTRA_SHIELD[b.special]){ b.shieldCd = (b.shieldCd ?? 3) - dt; if (b.shieldCd <= 0 && !(b.shieldUntil > match.elapsed)){ b.shieldCd = 11; startShield(b); } }   // Jude y Cloak: escudo cada ~11 s
  b.specialCd -= dt;
  const toP = Math.atan2(match.y - b.y, match.x - b.x);
  switch (b.special){
    case 'charge':                    // Chicken: 2-3 embestidas seguidas con aviso corto; tras cada una se frena (tu ventana)
      if (b.dashT > 0){
        b.dashT -= dt; b.x += b.dashVx * dt; b.y += b.dashVy * dt;
        b.x = Math.max(30, Math.min(ARENA_W - 30, b.x)); b.y = Math.max(30, Math.min(ARENA_H - 30, b.y));
        if (b.dashT <= 0){ b.holdUntil = match.elapsed + (b.chain > 0 ? 0.45 : 1.3); b.nextDashAt = b.holdUntil; }
        break;
      }
      if (b.warnT > 0){ b.warnT -= dt; if (b.warnT <= 0){ b.dashT = 0.5; b.dashVx = Math.cos(b.dashAng) * 620; b.dashVy = Math.sin(b.dashAng) * 620; } break; }
      if (b.chain > 0 && match.elapsed >= (b.nextDashAt || 0)){ b.chain--; b.warnT = 0.6; b.dashAng = toP; b.holdUntil = match.elapsed + 0.6; break; }
      if (!(b.chain > 0) && b.specialCd <= 0){ b.specialCd = 4.2; b.chain = 2 + (Math.random() < 0.5 ? 1 : 0); b.nextDashAt = 0; }
      break;
    case 'fists': {                   // Feldt: ráfagas de 3-5 cohetes seguidos y tandas de cohetes del cielo (nunca a la vez)
      if (b.fistsLeft > 0){
        b.fistCd -= dt;
        if (b.fistCd <= 0){
          b.fistsLeft--; b.fistCd = 0.45;
          const off = b.fistsLeft % 2 ? 0 : 40 + Math.random() * 50, a = Math.random() * Math.PI * 2;
          bossMark(match.x + Math.cos(a) * off, match.y + Math.sin(a) * off, 1.0, 62, b.shotDmg * 2.8, 'missile', '#3fb8c9');   // ráfaga de cohetes
        }
        break;
      }
      if (match.bossMarks.length || b.specialCd > 0) break;
      b.feldtPhase = (b.feldtPhase || 0) + 1;
      if (b.feldtPhase % 2){ b.fistsLeft = 3 + Math.floor(Math.random() * 3); b.fistCd = 0; b.specialCd = 1.6; }
      else {
        for (let k = 0; k < 3; k++){ const a = Math.random() * Math.PI * 2, off = k ? 110 : 0;
          bossMark(match.x + Math.cos(a) * off, match.y + Math.sin(a) * off, 0.8 + k * 0.15, 80, b.shotDmg * 2.2, 'missile', '#3fb8c9'); }
        b.specialCd = 2.2;
      }
      break;
    }
    case 'shield':                    // Artist: escudo de ~5 s que se rompe por tiempo o por daño; se renueva cada ~15 s
      if (b.specialCd <= 0){ b.specialCd = BOSS_SHIELD.every; startShield(b); }
      break;
    case 'walters':                   // Walters: el mismo escudo (verde) y rocas grandes marcadas con onda expansiva
      if (b.specialCd <= 0){ b.specialCd = BOSS_SHIELD.every; startShield(b); }
      b.rockCd = (b.rockCd ?? 2.5) - dt;
      if (b.rockCd <= 0 && !match.bossMarks.length){
        b.rockCd = 3.2;
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++){ const a = Math.random() * Math.PI * 2, off = k ? 90 + Math.random() * 60 : 0;
          bossMark(match.x + Math.cos(a) * off, match.y + Math.sin(a) * off, 1.1 + k * 0.2, 88, b.shotDmg * 3, 'rock', '#b07a3a', { wave: 150 }); }
      }
      break;
    case 'royal':                     // Jude: espiral de balones que gira y daña al tocarla + Espejismo de balón
      b.orbAng += dt * 2.6;
      if (b.orbHitCd > 0) b.orbHitCd -= dt;
      for (const o of royalOrbs(b)){
        if (Math.hypot(o.x - match.x, o.y - match.y) < 22 && !(b.orbHitCd > 0)){
          b.orbHitCd = 0.6;
          hurtPlayer(b.shotDmg * ENEMY_PROJ_X3 * (1 - Math.min(75, match.def) / 100), null);   // espiral de balones de Jude
        }
      }
      if (b.specialCd <= 0){                                 // Espejismo de balón: 5 balones iguales, solo uno es de verdad
        b.specialCd = 4.5;
        const toP = Math.atan2(match.y - b.y, match.x - b.x), real = Math.floor(Math.random() * 5);
        for (let k = 0; k < 5; k++){ const a = toP + (k - 2) * 0.22;
          match.enemyShots.push({ x: b.x, y: b.y, vx: Math.cos(a) * 4.6, vy: Math.sin(a) * 4.6, r: 12, dmg: b.shotDmg * 1.6, element: b.element, affEl: b.affEl, life: 3.5, fake: k !== real, mirage: true }); }
        match.effects.push({ x: b.x, y: b.y, fixed: true, maxR: 70, life: 0.35, dur: 0.35, color: '#9fdcff' });
      }
      break;
    case 'murdock':                   // los Murdock: se teletransportan como Cloak (cada uno a su ritmo)
      if (b.tpAt || b.specialCd <= 0){ bossTeleport(b, null, 5 + Math.random() * 2.5); }   // solo se teletransportan (sin ataques raros)
      break;
    case 'teleport':                  // Cloak: destello de aviso, aparece cerca de ti y lanza spiral o aimed3
      bossTeleport(b, Math.random() < 0.5 ? 'spiral' : 'aimed3', 4);
      break;
    case 'teleport_old':
      if (b.tpAt){
        if (match.elapsed >= b.tpAt){
          match.effects.push({ x:b.x, y:b.y, fixed:true, maxR:60, life:0.3, dur:0.3, color:'#5f6575', fill:true });
          b.x = b.tpX; b.y = b.tpY; b.tpAt = 0;
          match.effects.push({ x:b.x, y:b.y, fixed:true, maxR:70, life:0.35, dur:0.35, color:'#ffffff', fill:true });
          bossAttack(b, Math.random() < 0.5 ? 'spiral' : 'aimed3');
        }
        break;
      }
      if (b.specialCd <= 0){
        b.specialCd = 4;
        const a = Math.random() * Math.PI * 2, r = 170 + Math.random() * 90;
        b.tpX = Math.max(40, Math.min(ARENA_W - 40, match.x + Math.cos(a) * r));
        b.tpY = Math.max(40, Math.min(ARENA_H - 40, match.y + Math.sin(a) * r));
        b.tpAt = match.elapsed + 0.55;
        match.effects.push({ x:b.tpX, y:b.tpY, fixed:true, maxR:55, life:0.55, dur:0.55, color:'#d8dde8' });   // destello previo
      }
      break;
  }
}
function royalOrbs(b){
  const out = [];
  const n = 6;
  for (let k = 0; k < n; k++){ const a = b.orbAng + k * Math.PI * 2 / n, r = 70 + 35 * Math.sin(b.orbAng * 0.8 + k * 0.9);   // espiral que respira
    out.push({ x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r }); }
  return out;
}
/* misiles que caen del cielo (Feldt) */
function updateBossMarks(dt){
  if (!match.bossMarks) return;
  for (const m of match.bossMarks){
    m.t += dt;
    if (m.t >= m.dur){
      m.done = true;
      match.effects.push({ x:m.x, y:m.y, fixed:true, maxR:m.r, life:0.35, dur:0.35, color:m.color, fill:true });
      const dm = Math.hypot(m.x - match.x, m.y - match.y), red = 1 - Math.min(75, match.def) / 100;
      if (dm < m.r) hurtPlayer(m.dmg * ENEMY_PROJ_X3 * red, null);
      else if (m.wave && dm < m.wave){ hurtPlayer(m.dmg * 0.35 * ENEMY_PROJ_X3 * red, null);                  // onda expansiva pequeña
        match.effects.push({ x:m.x, y:m.y, fixed:true, maxR:m.wave, life:0.3, dur:0.3, color:m.color }); }
      if (m.wave) match.effects.push({ x:m.x, y:m.y, fixed:true, maxR:m.wave, life:0.3, dur:0.3, color:m.color });
    }
  }
  match.bossMarks = match.bossMarks.filter(m => !m.done);
}
function bossInvisible(b){ return b && b.invisUntil > match.elapsed; }

/* ---- destellos blancos (solo visual) al entrar al duelo y al volver al campo ---- */
function startStrike(){ match.fade = 0; lightningFlash(() => {}); }   // dos destellos blancos (como al empezar el partido)
function drawStrike(){}

/* ---- teletransporte al campo del duelo y vuelta ---- */
function enterArena(){
  match.saved = {
    x:match.x, y:match.y, enemies:match.enemies, gems:match.gems, items:match.items,
  };
  match.inArena = true;
  match.itower = null; match.bounceTrail = [];
  match.bossMarks = (match.bossMarks || []).filter(m => m.kind !== 'lob');   // las zonas de los lanzadores del campo se quedan fuera                           // la torre Inazuma de este tramo desaparece
  match.arenaStart = match.elapsed;              // el reloj del partido se para; empieza la cuenta atrás del boss
  match.arenaExitAt = 0;
  match.enemies = []; match.gems = []; match.items = [];
  match.projectiles = []; match.bombs = []; match.enemyShots = [];
  match.patches = []; match.triangles = []; match.towers = []; match.rainUlt = null; match.breath = null; match.meleeQueue = []; match.slashes = []; match.flurry = null; match.ultAnim = null;
  match.effects = []; match.bolts = []; match.texts = [];
  match.x = ARENA_W / 2; match.y = ARENA_H - 150;
  buildArena();
  spawnTimer = 3;                // unos segundos de calma antes de que entren rivales
  match.fade = 0.7;
}

function exitArena(){
  startStrike();                                   // destellos al volver al campo (que ya tiene el aspecto del rival vencido)
  // lo que quede en el suelo del duelo se recoge al salir
  for (const g of match.gems) collectPickup(g);
  const leftItems = match.items;
  const sv = match.saved;
  match.arenaOffset = (match.arenaOffset || 0) + (match.elapsed - (match.arenaStart ?? match.elapsed));
  match.inArena = false;
  match.arenaExitAt = 0;
  match.rocks = []; match.cracks = [];
  match.x = sv.x; match.y = sv.y;
  match.gems = sv.gems; match.items = sv.items;
  // los rivales que estaban pegados a ti se apartan para no recibir un golpe al volver
  match.enemies = sv.enemies.filter(e => Math.hypot(e.x - match.x, e.y - match.y) > 220);
  match.projectiles = []; match.bombs = []; match.enemyShots = []; match.effects = []; match.bolts = [];
  match.patches = []; match.triangles = []; match.towers = []; match.rainUlt = null; match.breath = null; match.meleeQueue = []; match.slashes = []; match.flurry = null; match.ultAnim = null;
  leftItems.forEach((it, i) => match.items.push({ ...it, x: match.x + 50 + i * 40, y: match.y - 40, life: ITEM_LIFE }));
  match.saved = null;
  spawnTimer = 1.5;
  match.fade = 0;                  // sin fundido negro: lo cubren los destellos blancos
  showBanner('De vuelta al campo', null, '#eafff3');
  if (match.pendingRelic){ const k = match.pendingRelic; match.pendingRelic = null; offerRelic(k, 'boss'); }
}

/* coloca las rocas rotas y las grietas del campo del duelo */
function buildArena(){
  match.rocks = [];
  let tries = 0;
  while (match.rocks.length < ARENA_ROCKS && tries++ < 300){
    const r = 26 + Math.random() * 22;
    const x = 70 + Math.random() * (ARENA_W - 140);
    const y = 300 + Math.random() * (ARENA_H - 560);   // ni en la salida del jugador ni en la del boss
    if (match.rocks.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 70)) continue;
    const n = 7 + Math.floor(Math.random() * 3);
    const pts = [];
    for (let k = 0; k < n; k++){
      const a = k / n * Math.PI * 2;
      const rr = r * (0.75 + Math.random() * 0.35);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    const crack = [[(Math.random()-0.5) * r * 0.6, -r * 0.7]];
    for (let k = 1; k <= 3; k++) crack.push([(Math.random()-0.5) * r * 0.8, -r * 0.7 + k * r * 0.45]);
    match.rocks.push({ x, y, r, pts, crack });
  }
  // grietas del suelo
  match.cracks = [];
  for (let c = 0; c < 9; c++){
    let x = Math.random() * ARENA_W, y = Math.random() * ARENA_H;
    let a = Math.random() * Math.PI * 2;
    const line = [[x, y]];
    const segs = 4 + Math.floor(Math.random() * 4);
    for (let k = 0; k < segs; k++){
      a += (Math.random() - 0.5) * 1.2;
      x += Math.cos(a) * (25 + Math.random() * 35);
      y += Math.sin(a) * (25 + Math.random() * 35);
      line.push([x, y]);
    }
    match.cracks.push(line);
  }
}

/* empuja a algo fuera de las rocas (jugador, rivales y boss) */
function pushOutOfRocks(o, radius){
  for (const r of match.rocks){
    const dx = o.x - r.x, dy = o.y - r.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const min = r.r + radius;
    if (d < min){ o.x = r.x + dx / d * min; o.y = r.y + dy / d * min; }
  }
}

/* programa los disparos de un ataque: [retraso, ángulo (null = apunta al disparar), velocidad, radio] */
function bossAttack(b, kind){
  const toP = Math.atan2(match.y - b.y, match.x - b.x);
  const shots = [];
  if (kind === 'wind'){                       // viento: abanico rápido de balones pequeños
    for (let k = -3; k <= 3; k++) shots.push([0, toP + k * 0.14, 6.5, 6]);
  } else if (kind === 'rocks'){               // rocas: pocas, enormes y lentas
    for (let k = -1; k <= 1; k++) shots.push([k === 0 ? 0 : 0.3, toP + k * 0.5, 2.2, 20]);
  } else if (kind === 'aimed3'){
    for (let k = -1; k <= 1; k++) shots.push([0, toP + k * 0.22, 4.4, 8]);
  } else if (kind === 'aimed5'){
    for (let k = -2; k <= 2; k++) shots.push([0, toP + k * 0.18, 4.6, 8]);
  } else if (kind === 'burst'){
    for (let k = 0; k < 5; k++) shots.push([k * 0.14, null, 5.2, 7]);
  } else if (kind === 'ring'){
    const n = 12, off = Math.random() * Math.PI;
    for (let k = 0; k < n; k++) shots.push([0, off + k * Math.PI * 2 / n, 3.6, 8]);
  } else if (kind === 'bigring'){
    const n = 14, off = Math.random() * Math.PI;
    for (let w = 0; w < 2; w++)
      for (let k = 0; k < n; k++) shots.push([w * 0.5, off + (k + w * 0.5) * Math.PI * 2 / n, 3, 12]);
  } else if (kind === 'spiral'){
    for (let k = 0; k < 24; k++) shots.push([k * 0.06, toP + k * 0.5, 3.8, 7]);
  }
  for (const [t, ang, speed, r] of shots) b.pending.push({ t, ang, speed, r });
}

/* ======================================================================
   DEFINITIVAS DE LOS BOSSES: cada uno usa la supertécnica evolucionada de su afinidad
   (salta con su aura como el jugador; lo avisa con una zona roja antes de golpear)
   ====================================================================== */
const BOSS_ULT = {
  'Talisman':'pierce',        // Tornado oscuro
  'Chicken':'melee',          // Despeje explosivo
  'Feldt':'bounce',           // Remate dragón (un solo balón, sin rebotes)
  'Artist':'rain',            // Flecha huracán
  'Jude':'penguin',           // Pingüino emperador Nº2
  'Cloak':'orbit',            // Potenciación
  'Greeny':'rain',           // Pisotón de sumo (con el pie gigante)
  'Thomas Murdock':'bounce',  // Ruptura relámpago
  'Tyler Murdock':'bounce',   // Disparo con rebotes
  'Marvin Murdock':'bounce',  // Pájaro de fuego
  'Aphrodite':'rain',         // Sabiduría divina (cuando exista su boss)
};
const BOSS_ULT_NAME = { penguin: 'Pingüino emperador Nº2' };
const MURDOCK_Z_EVERY = 20, MURDOCK_Z_FIRST = 12;   // los tres hermanos juntos: Triángulo Z
const BOSS_ULTS_ON = false;                         // los bosses NO usan supertécnicas definitivas
const BOSS_ULT_EVERY = 15, BOSS_ULT_FIRST = 7;
function bossUltName(b){ const k = b.ult ? b.ult.kind : BOSS_ULT[b.name]; return BOSS_ULT_NAME[k] || (TECH_NAMES[b.element] || NEUTRAL_TECH_NAMES)[k][1]; }
function bossJumpState(u){                                   // mismo salto que el jugador (subida, disparo, caída)
  const t = match.elapsed - u.start;
  if (t < FENIX.rise){ const k = t / FENIX.rise; return { phase:'rise', k, h: FENIX.height * (1 - Math.pow(1 - k, 2.2)), t }; }
  const td = t - FENIX.rise, hold = 0.45;
  if (td < hold) return { phase:'shoot', k: td / hold, h: FENIX.height, t };
  const kf = Math.min(1, (td - hold) / FENIX.fall);
  return { phase:'fall', k: kf, h: FENIX.height * (1 - kf * kf), t };
}
/* triángulo de impactos (con aviso) alrededor del jugador; devuelve cuándo cae el remate del centro */
function bossTriangle(el, shotDmg, color, extra = 0){
  const cx = match.x, cy = match.y, R = 190 + extra, rot = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
  const v = [0, 1, 2].map(k => [cx + Math.cos(rot + k * 2.094) * R, cy + Math.sin(rot + k * 2.094) * R]);
  let d = 0.9;
  for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++){
    const f = j / 4, [ax, ay] = v[k], [bx, by] = v[(k + 1) % 3];
    bossMark(ax + (bx - ax) * f, ay + (by - ay) * f, d, 62, shotDmg * 2.4, 'ult', color, { el }); d += 0.06;
  }
  bossMark(cx, cy, d + 0.35, 120, shotDmg * 4, 'ult', color, { el, big: true });
  return d + 0.35;
}
/* Hermanos Murdock: Triángulo Z entre los tres (saltan a la vez con su aura) */
function startMurdockZ(){
  const bros = (match.bossGroup || []).filter(x => !x.dead); if (!bros.length) return;
  showBanner('¡Triángulo Z!', 'Hermanos Murdock', getElement('fire').color, true);
  SFX.play('ult');
  for (const x of bros){ if (x.ult && x.ult.kind === 'melee') x.speed = x.ultBaseSpeed || x.speed; x.ult = { kind: 'rain', el: x.element, start: match.elapsed, bolts: [], nextBolt: 0, group: true }; }
  bossTriangle('fire', bros[0].shotDmg * 1.3, getElement('fire').color, 30);
}
function startBossUlt(b){
  const kind = b.ultList ? b.ultList[(b.ultIdx++) % b.ultList.length] : BOSS_ULT[b.name]; if (!kind) return;
  const toP = Math.atan2(match.y - b.y, match.x - b.x), color = getElement(b.element).color;
  b.ult = { kind, el: b.element, start: match.elapsed, ang: toP, bolts: [], nextBolt: 0, fired: false, hitCd: 0, jump: b.special === 'byron' };   // Aphrodite salta con alas en todas
  showBanner(`¡${bossUltName(b)}!`, b.name, color, true);
  SFX.play('ult');
  if (kind === 'rain'){                                      // triángulo de impactos alrededor de ti y remate en el centro
    const hit = bossTriangle(b.element, b.shotDmg, color);
    if (b.element === 'mountain') match.bossStomp = { el: 'mountain', start: match.elapsed, hit, cx: match.x, cy: match.y };   // Pisotón de sumo: el pie pisa el centro
  }
  if (kind === 'penguin'){                                   // 5 pingüinos giran a su alrededor y luego se lanzan hacia ti en abanico
    const toP2 = Math.atan2(match.y - b.y, match.x - b.x);
    for (let k = 0; k < 5; k++) match.enemyShots.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: 14, dmg: b.shotDmg * 1.4, element: b.element, affEl: b.affEl, life: 4, penguin: true,
      orbit: { owner: b, ang: k * Math.PI * 2 / 5, R: 0, Rmax: 60, spin: 5.2, releaseAt: match.elapsed + 1.2, fan: (k - 2) * 0.18, speed: 6.2 } });
  }
  if (kind === 'orbit'){                                     // balones que giran a su alrededor y te golpean si te tocan
    for (let k = 0; k < 8; k++) match.enemyShots.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: 11, dmg: b.shotDmg * 1.3, element: b.element, affEl: b.affEl, life: 4.5,
      orbit: { owner: b, ang: k * Math.PI / 4, R: 0, Rmax: 125, spin: 3.2 } });
  }
  if (kind === 'bounce' && !b.ult.jump){                     // un solo balón gigante hacia ti que rebota en las paredes de la arena
    match.enemyShots.push({ x: b.x, y: b.y, vx: Math.cos(toP) * 6.8, vy: Math.sin(toP) * 6.8, r: 18, dmg: b.shotDmg * 2.2, element: b.element, affEl: b.affEl, life: 6, bounces: 4 });   // rebota en las paredes
  }
  if (kind === 'melee'){ b.ultBaseSpeed = b.speed; b.speed *= 2.1; }
}
/* devuelve true mientras dura (el boss no hace sus ataques normales) */
function updateBossUlt(b, dt){
  if (!BOSS_ULT[b.name] || b.dead) return false;
  if (!b.ult){
    b.ultCd = (b.ultCd ?? (BOSS_ULT_FIRST + (b.attackIdx || 0) * 3)) - dt;
    if (b.ultCd <= 0 && !bossInvisible(b) && !b.towerShield){ b.ultCd = (b.special === 'byron' ? 11 : BOSS_ULT_EVERY) * ((match.bossGroup || []).length > 1 ? 1.5 : 1); startBossUlt(b); }
    b.jumpH = 0;
    return false;
  }
  const u = b.ult, t = match.elapsed - u.start;
  if (u.jump && u.kind === 'bounce'){                         // Aphrodite: salta con las alas y, arriba, lanza la Flecha divina
    const f = bossJumpState(u); b.jumpH = f.h;
    if (f.phase !== 'rise' && !u.fired){
      u.fired = true; const a = Math.atan2(match.y - b.y, match.x - b.x);
      match.enemyShots.push({ x: b.x, y: b.y - 20, vx: Math.cos(a) * 6.8, vy: Math.sin(a) * 6.8, r: 18, dmg: b.shotDmg * 1.2, element: b.element, affEl: b.affEl, life: 6, bounces: 4 });
      match.effects.push({ x: b.x, y: b.y - FENIX.height, fixed: true, maxR: 140, life: 0.4, dur: 0.4, color: '#fff3a0', fill: true });
    }
    if (f.phase === 'fall' && f.k >= 1){ b.ult = null; b.jumpH = 0; }
    return true;
  }
  if (u.kind === 'pierce' || u.kind === 'rain'){
    const f = bossJumpState(u); b.jumpH = f.h;
    if (u.kind === 'pierce' && f.phase === 'rise') u.ang = Math.atan2(match.y - b.y, match.x - b.x);   // apunta mientras sube
    if (u.kind === 'pierce' && f.phase !== 'rise' && !u.fired){                                        // arriba del todo: bocanada en cono
      u.fired = true; u.acc = 0; u.shots = 0;
      match.effects.push({ x: b.x, y: b.y - FENIX.height, fixed: true, maxR: 150, life: 0.4, dur: 0.4, color: getElement(b.element).color, fill: true });
    }
    if (u.fired && u.kind === 'pierce' && u.shots < 22){
      u.acc += dt;
      while (u.acc >= 0.04 && u.shots < 22){ u.acc -= 0.04; u.shots++;
        const a = u.ang + (Math.random() - 0.5) * 0.7, sp = 5 + Math.random() * 1.5;
        match.enemyShots.push({ x: b.x, y: b.y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 9, dmg: b.shotDmg * 1.1, element: b.element, affEl: b.affEl, life: 3 }); }
    }
    if (f.phase === 'fall' && f.k >= 1 && (u.kind === 'rain' || u.shots >= 22)){ b.ult = null; b.jumpH = 0; }
    return true;
  }
  if (u.kind === 'melee'){                                   // torbellino de golpes: te persigue girando
    u.hitCd -= dt;
    if (u.hitCd <= 0 && Math.hypot(match.x - b.x, match.y - b.y) < 105){ u.hitCd = 0.35; hurtPlayer(b.dmg * 0.55 * (1 - Math.min(75, match.def) / 100), null); }
    if (t > 2.4){ b.speed = b.ultBaseSpeed || b.speed; b.ult = null; }
    return true;
  }
  if (u.kind === 'orbit'){ if (t > 4.5) b.ult = null; return true; }
  if (u.kind === 'penguin'){ if (t > 1.5) b.ult = null; return true; }
  if (u.kind === 'bounce'){ if (t > 1.2) b.ult = null; return true; }
  b.ult = null; return false;
}
/* aura de la definitiva alrededor del boss (en su posición de pantalla) */
/* círculo del tiempo (zona dorada que late con marcas de reloj y aguja): Aphrodite y Mark */
function drawTimeCircle(zx, zy, R, alpha = 1){
  const pul = 0.5 + 0.5 * Math.sin(match.elapsed * 2.4);
  ctx.save(); ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(zx, zy, R * 0.2, zx, zy, R);
  g.addColorStop(0, 'rgba(255,240,170,0.05)'); g.addColorStop(0.8, `rgba(255,220,110,${0.08 + 0.06 * pul})`); g.addColorStop(1, `rgba(255,210,80,${0.22 + 0.12 * pul})`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(zx, zy, R, 0, 6.28); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#7a5208'; ctx.globalAlpha = 0.7 * alpha; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = '#ffe680'; ctx.globalAlpha = 0.9 * alpha; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -match.elapsed * 30; ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = (0.25 + 0.5 * pul) * alpha; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(zx, zy, R * (0.3 + 0.7 * ((match.elapsed * 0.4) % 1)), 0, 6.28); ctx.stroke();
  ctx.globalAlpha = 0.6 * alpha; ctx.fillStyle = '#fff3b0';
  for (let k = 0; k < 12; k++){ const a = k * Math.PI / 6; const q = k % 3 ? 4 : 8; ctx.fillRect(zx + Math.cos(a) * (R - 14) - q / 2, zy + Math.sin(a) * (R - 14) - q / 2, q, q); }
  ctx.globalAlpha = 0.5 * alpha; ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 4;
  const ha = match.elapsed * 0.6; ctx.beginPath(); ctx.moveTo(zx, zy); ctx.lineTo(zx + Math.cos(ha) * R * 0.75, zy + Math.sin(ha) * R * 0.75); ctx.stroke();
  ctx.restore();
}
/* Aphrodite: zona de Hora celestial y las 3 torres de poder (con su barra de progreso) */
function drawByronArena(camX, camY){
  const b = byronBoss(); if (!b && !(match.towers || []).length) return;
  ctx.save();
  if (b || !(match.towers || []).some(t => t.destroyAt)){ const b0 = b || { x: ARENA_W / 2, y: ARENA_H / 2 };   // el círculo del tiempo (no tras vencerla)                                                  // Hora celestial: zona dorada que late, con marcas de reloj
    const zx = b0.x + camX, zy = b0.y + camY, R = BYRON.zoneR, pul = 0.5 + 0.5 * Math.sin(match.elapsed * 2.4);
    const g = ctx.createRadialGradient(zx, zy, R * 0.2, zx, zy, R);
    g.addColorStop(0, 'rgba(255,240,170,0.05)'); g.addColorStop(0.8, `rgba(255,220,110,${0.08 + 0.06 * pul})`); g.addColorStop(1, `rgba(255,210,80,${0.22 + 0.12 * pul})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(zx, zy, R, 0, 6.28); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#7a5208'; ctx.globalAlpha = 0.7; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffe680'; ctx.globalAlpha = 0.9; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -match.elapsed * 30; ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.25 + 0.5 * pul; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 3;           // onda que sale cada pulso
    ctx.beginPath(); ctx.arc(zx, zy, R * (0.3 + 0.7 * ((match.elapsed * 0.4) % 1)), 0, 6.28); ctx.stroke();
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#fff3b0';
    for (let k = 0; k < 12; k++){ const a = k * Math.PI / 6; const q = k % 3 ? 4 : 8; ctx.fillRect(zx + Math.cos(a) * (R - 14) - q / 2, zy + Math.sin(a) * (R - 14) - q / 2, q, q); }
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 4;
    const ha = match.elapsed * 0.6; ctx.beginPath(); ctx.moveTo(zx, zy); ctx.lineTo(zx + Math.cos(ha) * R * 0.75, zy + Math.sin(ha) * R * 0.75); ctx.stroke();
  }
  match.towers = (match.towers || []).filter(t => !t.destroyAt || match.elapsed - t.destroyAt < 1.2);
  for (const t of (match.towers || [])){
    const dk = t.destroyAt ? Math.min(1, (match.elapsed - t.destroyAt) / 1.2) : 0;   // derrumbe: tiembla, se hunde y desaparece
    if (dk > 0){ ctx.save(); const ax = t.x + camX, ay = t.y + camY; ctx.translate(ax + Math.sin(match.elapsed * 60) * 4 * (1 - dk), ay); ctx.scale(1 - dk * 0.3, 1 - dk); ctx.translate(-ax, -ay); }
    const tx = t.x + camX, ty = t.y + camY, R = BYRON.towerR;
    // círculo de la torre
    ctx.globalAlpha = t.active ? 0.22 + 0.1 * Math.sin(match.elapsed * 6) : 0.08; ctx.fillStyle = t.active ? '#ffd84a' : t.done ? '#8a8f9a' : '#ffe9a0';
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, 6.28); ctx.fill();
    ctx.globalAlpha = t.done ? 0.4 : 0.8; ctx.lineWidth = 4; ctx.strokeStyle = '#7a5208'; ctx.stroke();
    ctx.globalAlpha = t.active ? 1 : t.done ? 0.35 : 0.7; ctx.lineWidth = 2; ctx.strokeStyle = t.active ? '#fff3a0' : '#ffe680';
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = t.active ? -match.elapsed * 40 : 0; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = t.done ? '#9a9ea8' : '#fff3b0';                 // marcas de reloj, como el círculo de Aphrodite
    for (let k = 0; k < 8; k++){ const a = k * Math.PI / 4 + (t.active ? match.elapsed * 0.8 : 0), q = k % 2 ? 3 : 6; ctx.fillRect(tx + Math.cos(a) * (R - 9) - q / 2, ty + Math.sin(a) * (R - 9) - q / 2, q, q); }
    if (t.active && t.prog > 0){                          // barra de progreso alrededor
      ctx.globalAlpha = 1; ctx.lineWidth = 9; ctx.strokeStyle = '#1b1d26'; ctx.beginPath(); ctx.arc(tx, ty, R + 8, -Math.PI / 2, -Math.PI / 2 + 6.283 * t.prog); ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = '#7fe36a'; ctx.stroke();
    }
    // base y pilar
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(tx, ty + 6, 30, 10, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#3a3f4e'; ctx.fillRect(tx - 24, ty - 6, 48, 12); ctx.fillStyle = '#c9ccd4'; ctx.fillRect(tx - 22, ty - 6, 44, 6); ctx.fillStyle = '#8a8f9a'; ctx.fillRect(tx - 22, ty, 44, 4);
    ctx.fillStyle = '#3a3f4e'; ctx.fillRect(tx - 14, ty - 70, 28, 66);
    ctx.fillStyle = t.done ? '#9a9ea8' : '#e8eaf0'; ctx.fillRect(tx - 12, ty - 68, 24, 62);
    ctx.fillStyle = t.done ? '#7d828e' : '#b9bcc6'; ctx.fillRect(tx + 4, ty - 68, 8, 62);
    for (let k = 0; k < 4; k++){ ctx.fillStyle = '#9aa0ad'; ctx.fillRect(tx - 12, ty - 60 + k * 15, 24, 2); }
    ctx.fillStyle = '#ffcf3a'; ctx.fillRect(tx - 18, ty - 76, 36, 8); ctx.fillStyle = '#7a5208'; ctx.fillRect(tx - 18, ty - 70, 36, 2);
    // orbe de poder: dorado si está encendida, gris si está apagada, roto si ya la desactivaste
    const oy = ty - 92 + (t.active ? Math.sin(match.elapsed * 4) * 3 : 0);
    if (t.active){ const gg = ctx.createRadialGradient(tx, oy, 2, tx, oy, 40); gg.addColorStop(0, 'rgba(255,250,210,.9)'); gg.addColorStop(1, 'rgba(255,220,90,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(tx, oy, 40, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = '#1b1d26'; ctx.beginPath(); ctx.arc(tx, oy, 14, 0, 6.28); ctx.fill();
    ctx.fillStyle = t.active ? '#ffd84a' : t.done ? '#6e727c' : '#b9c3cf'; ctx.beginPath(); ctx.arc(tx, oy, 11, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = t.done ? 0.3 : 0.9; ctx.fillRect(tx - 6, oy - 6, 4, 4);
    if (t.done){ ctx.globalAlpha = 1; ctx.strokeStyle = '#1b1d26'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx - 8, oy - 6); ctx.lineTo(tx, oy + 1); ctx.lineTo(tx + 6, oy - 4); ctx.lineTo(tx + 9, oy + 6); ctx.stroke(); }
    if (t.active && b){                                   // rayo de energía de la torre que cura a Aphrodite
      const x0 = tx, y0 = oy, x1 = b.x + camX, y1 = b.y + camY - 20 - (b.jumpH || 0), dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const seg = 14, pts = [];
      for (let i = 0; i <= seg; i++){ const q = i / seg, w = (i === 0 || i === seg) ? 0 : Math.sin(q * 9 + match.elapsed * 14) * 7 + (Math.random() - 0.5) * 6; pts.push([x0 + dx * q + nx * w, y0 + dy * q + ny * w]); }
      const line = (wd, col, al) => { ctx.globalAlpha = al; ctx.lineWidth = wd; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke(); };
      const pul = 0.7 + 0.3 * Math.sin(match.elapsed * 18);
      line(22, '#ffd84a', 0.18 * pul); line(12, '#7a5208', 0.75); line(8, '#ffd84a', 0.95); line(4, '#fff3a0', 1); line(1.5, '#ffffff', 1);
      for (let k = 0; k < 6; k++){                         // bolitas de energía que viajan hacia ella
        const q = (match.elapsed * 0.9 + k / 6) % 1, px = x0 + dx * q, py = y0 + dy * q, r = 5 + 2 * Math.sin(match.elapsed * 10 + k);
        ctx.globalAlpha = 1; ctx.fillStyle = '#1b1d26'; ctx.beginPath(); ctx.arc(px, py, r + 2, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.28); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      // destello en la torre y cruces verdes de curación sobre Aphrodite
      ctx.globalAlpha = 0.5 + 0.4 * pul; ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(x0, y0, 18 * pul, 0, 6.28); ctx.fill();
      for (let k = 0; k < 4; k++){
        const q = (match.elapsed * 0.8 + k / 4) % 1, hx = x1 + Math.sin(k * 2.3 + match.elapsed) * 26, hy = y1 + 10 - q * 46, sz = 5;
        ctx.globalAlpha = 1 - q; ctx.fillStyle = '#1b5e20'; ctx.fillRect(hx - sz - 1, hy - 2.5, sz * 2 + 2, 5); ctx.fillRect(hx - 2.5, hy - sz - 1, 5, sz * 2 + 2);
        ctx.fillStyle = '#7fe36a'; ctx.fillRect(hx - sz, hy - 1.5, sz * 2, 3); ctx.fillRect(hx - 1.5, hy - sz, 3, sz * 2);
      }
    }
    if (dk > 0) ctx.restore();
  }
  ctx.restore();
}
/* porcentaje de carga de la torre encendida, nítido y en un recuadro pixel */
function drawTowerLabels(camX, camY){
  for (const t of (match.towers || [])){
    if (!t.active) continue;
    const x = Math.round(t.x + camX), y = Math.round(t.y + camY - 128), txt = `${Math.round(t.prog * 100)}%`;
    ctx.save();
    ctx.font = '900 20px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(txt).width) + 20, h = 28;
    ctx.fillStyle = '#071233'; ctx.fillRect(x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6);
    ctx.fillStyle = '#7fe36a'; ctx.fillRect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2);
    ctx.fillStyle = '#0d2a12'; ctx.fillRect(x - w / 2 + 1, y - h / 2 + 1, w - 2, h - 2);
    ctx.fillStyle = '#7fe36a'; ctx.fillRect(x - w / 2 + 1, y + h / 2 - 5, (w - 2) * t.prog, 4);   // barrita de progreso
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(txt, x, y - 1);
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, x, y - 1);
    ctx.restore();
  }
}
function drawBossUltAura(b, ex, ey, front){
  const u = b.ult; if (!u) return;
  const ov = { u, cx: ex, feet: ey + 14, wx: b.x, wy: b.y, tall: 96 };
  if (u.kind === 'pierce' || u.kind === 'rain' || u.jump){
    ov.f = bossJumpState(u); ov.J = Object.assign({}, JUMP_ULT[u.el] || JUMP_ULT.fire, { hand: false }); ov.tall = 70;
    if (!front && (u.jump || (u.el === 'celestial' && u.kind === 'rain')) && ALAS.ok && ov.f.t < 1.6){   // alas de ángel durante todo el salto
      const t = ov.f.t, fade = t > 1.3 ? 1 - (t - 1.3) / 0.3 : 1, open = easeOut3(t / 0.3), fr = Math.sin(match.elapsed * 9) > 0.2 ? 1 : 0;
      const w = 90 * FX_PIXEL * 0.5 * (0.2 + 0.8 * open), h = 36 * FX_PIXEL * 0.5;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = fade;
      ctx.drawImage(ALAS.img, fr * 90, 0, 90, 36, Math.round(ex - w / 2), Math.round(ey + 14 - 26 - ov.f.h - h * 0.62), w, h); ctx.restore();
    }
    drawFenixTornado(front, ov); return;
  }
  const t = match.elapsed - u.start, dur = u.kind === 'melee' ? 2.4 : u.kind === 'orbit' ? 4.5 : u.kind === 'penguin' ? 1.5 : 1.2, left = dur - t;
  ov.f = left < 0.4 ? { phase:'shoot', k: 1 - left / 0.4, h: 0, t } : { phase:'rise', k: Math.min(1, t / 0.4), h: 0, t };
  ov.J = { spiral: u.el === 'forest' ? 'dark' : u.el === 'celestial' ? 'gold' : u.el, rocks: u.el === 'mountain', thunder: u.el === 'air' && u.kind !== 'melee', dragon: u.el === 'dragon' };
  drawFenixTornado(front, ov);
  if (u.kind === 'melee' && front && isFireFx(u.el)){       // anillo de estelas girando, como la definitiva cuerpo a cuerpo
    const P = FIRE, R = 92, a = match.elapsed * 15, fade = Math.min(1, left / 0.25);
    ctx.save();
    for (let k = 0; k < 3; k++){ const h = a + k * 2.094; ctx.globalAlpha = 0.95 * fade;
      smearArc(ex, ey, R, h - 1.6, h, 20, P.mix ? P.accent2 : P.deep, true); smearArc(ex, ey, R + 3, h - 1.1, h, 12, P.mix ? P.accent : P.hot, false); smearArc(ex, ey, R + 6, h - 0.6, h, 4, P.core, false); }
    ctx.restore();
  }
}
function updateBoss(b, dt){
  if (b.boss) dt *= bossFury();                  // furia suave: todo su ritmo de ataque se acelera
  updateBossSpecial(b, dt);
  if ((BOSS_ULTS_ON || b.special === 'byron') && updateBossUlt(b, dt)) return;   // solo Aphrodite usa definitivas   // (desactivado: los bosses usan sus habilidades propias, no supertécnicas)
  if (b.towerShield) return;                     // Aphrodite con la torre encendida: no dispara
  // disparo normal: un balón directo hacia ti cada poco, además de sus ataques especiales
  b.basicCd = (b.basicCd ?? 1.5) - dt;
  if (b.basicCd <= 0){
    const grp = (match.bossGroup || []).length;
    b.basicCd = Math.max(0.8, 1.3 - 0.05 * b.idx) * (grp > 1 ? 1.6 : 1);
    const a = Math.atan2(match.y - b.y, match.x - b.x);
    match.enemyShots.push({ x:b.x, y:b.y, vx:Math.cos(a) * 4.2, vy:Math.sin(a) * 4.2, r:11, dmg:b.shotDmg * 0.8, element:b.element, affEl:b.affEl, life:3.5 });   // balón de su afinidad, más grande
  }
  b.attackCd -= dt;
  if (b.attackCd <= 0 && b.attacks && b.attacks.length){
    b.attackCd = b.attackEvery;
    bossAttack(b, b.attacks[b.attackIdx % b.attacks.length]);
    b.attackIdx++;
  }
  for (const s of b.pending){
    s.t -= dt;
    if (s.t > 0) continue;
    s.done = true;
    const ang = s.ang ?? Math.atan2(match.y - b.y, match.x - b.x);
    match.enemyShots.push({
      x:b.x, y:b.y, vx:Math.cos(ang) * s.speed, vy:Math.sin(ang) * s.speed,
      r:s.r + 3, dmg:b.shotDmg, element:b.element, affEl:b.affEl, life:4.5,
    });
  }
  b.pending = b.pending.filter(s => !s.done);
}

/* ======================================================================
   EQUILIBRIO DE DAÑO (probado con un bot que juega solo).
   Objetivo: los proyectiles de los bosses quitan mucho — un disparo de un boss a una build buena
   (todas las mejoras permanentes) le quita ~15% al 1º y ~55% a Aphrodite: la pelea es de ESQUIVAR.
   Sin mejoras permanentes ni una build cuidada, a partir del 3º boss es casi imposible.
   ====================================================================== */
const ENEMY_SHOT_MULT = 1;   // (antes 3,5) ahora el daño ya sale con la escala de PokéSurvivor                         // proyectiles de rivales y bosses (×3,5; antes ×4)
const ENEMY_PROJ_X3 = 1;                           // lo que cae del cielo (cohetes, rocas, puños, impactos) y los balones que giran
/* dificultad extra de cada boss (en orden): multiplica TODO su daño (proyectiles, zonas marcadas, cohetes, rocas…) */
/* vida de cada jefe respecto a la de su minuto en PokéSurvivor (Aphrodite: jefe final, más dura; Murdock: ×1,3 entre los tres) */
const PS_BOSS_HP = [1, 1, 1, 1, 1, 1, 1, 1.3, 1.2];
const BOSS_DMG_MULT = [1.17, 1.35, 1.7, 0.85, 0.65, 1.4, 1.3, 1.05, 1.1];   // (−10 %)   // (los 3 primeros, algo más suaves)   // Talisman … Murdock (×3 a la vez) · Aphrodite  (≈15/20/28/32/36/40/44/36/55 % de vida por disparo a una build buena)
function updateEnemyShots(dt){
  for (const s of match.enemyShots){
    if (s.orbit){                                  // gira alrededor de su boss
      const o = s.orbit; if (!o.owner || o.owner.dead){ s.life = 0; continue; }
      if (o.releaseAt && match.elapsed >= o.releaseAt){        // se lanza hacia ti
        const a = Math.atan2(match.y - s.y, match.x - s.x) + (o.fan || 0);
        s.vx = Math.cos(a) * o.speed; s.vy = Math.sin(a) * o.speed; s.orbit = null; continue;
      }
      o.ang += o.spin * dt; o.R = Math.min(o.Rmax, o.R + 300 * dt);
      const nx = o.owner.x + Math.cos(o.ang) * o.R, ny = o.owner.y + Math.sin(o.ang) * o.R; s.vx = (nx - s.x) / 60 / Math.max(dt, 1e-3); s.vy = (ny - s.y) / 60 / Math.max(dt, 1e-3);
      s.x = nx; s.y = ny; s.life -= dt;
    } else {
      s.x += s.vx * 60 * dt; s.y += s.vy * 60 * dt; s.life -= dt;
    }
    if (s.bounces > 0 && match.inArena){            // rebota en las bandas de la arena
      if (s.x < FIELD_MARGIN || s.x > ARENA_W - FIELD_MARGIN){ s.vx *= -1; s.bounces--; s.x = Math.max(FIELD_MARGIN, Math.min(ARENA_W - FIELD_MARGIN, s.x)); }
      if (s.y < FIELD_MARGIN || s.y > ARENA_H - FIELD_MARGIN){ s.vy *= -1; s.bounces--; s.y = Math.max(FIELD_MARGIN, Math.min(ARENA_H - FIELD_MARGIN, s.y)); }
    }
    { const rk = match.rocks.find(r => Math.hypot(s.x - r.x, s.y - r.y) < r.r + s.r * 0.5);
      if (rk){
        if (s.bounces > 0 && !s.orbit){                // los balones de rebote también rebotan en las rocas
          const nx = (s.x - rk.x), ny = (s.y - rk.y), nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl, dot = s.vx * ux + s.vy * uy;
          if (dot < 0){ s.vx -= 2 * dot * ux; s.vy -= 2 * dot * uy; s.bounces--; }
          s.x = rk.x + ux * (rk.r + s.r * 0.5 + 1); s.y = rk.y + uy * (rk.r + s.r * 0.5 + 1);
        } else { s.life = 0; continue; }
      } }
    if (!match.inArena && obstacleAt(s.x, s.y, s.r * 0.5)){ s.life = 0; continue; }
    if (s.fake && s.life > 0 && Math.hypot(s.x - match.x, s.y - match.y) < 95){      // espejismo: se deshace sin hacer daño
      s.life = 0; match.effects.push({ x: s.x, y: s.y, fixed: true, maxR: 26, life: 0.25, dur: 0.25, color: '#cfe8ff' }); continue;
    }
    if (s.life > 0 && Math.hypot(s.x - match.x, s.y - match.y) < s.r + 12 + playerHitOff()){
      s.life = 0;
      if (Math.random() * 100 < effDodge()){
        addFloatText(match.x, match.y - 26, '¡Regate!', '#5ec8f2');
      } else {
        hurtPlayer(s.dmg * ENEMY_SHOT_MULT * (1 - Math.min(75, match.def) / 100) * elementMult(s.affEl || s.element, match.element) * weatherMult(s.affEl || s.element), null);
      }
    }
  }
  match.enemyShots = match.enemyShots.filter(s => s.life > 0);
}

function onBossDefeated(b){
  SFX.play('whistle_end');                             // pitido final del duelo
  if (match.obstacles && match.saved) match.obstacles = addFieldObstacles(match.obstacles, match.saved.x, match.saved.y);
  match.boss = null;
  match.bossGroup = [];
  match.bossMarks = [];
  match.bossesBeaten++;
  match.bossIdx++;
  if (BOSSES[b.idx] && BOSSES[b.idx].final){                // Aphrodite vencida: vuelves al campo y aparece Mark Evans
    for (const t of (match.towers || [])){                      // las torres se derrumban
      t.destroyAt = match.elapsed; t.active = false;
      match.effects.push({ x: t.x, y: t.y - 40, fixed: true, maxR: 150, life: 0.6, dur: 0.6, color: '#ffd84a', fill: true });
      isFireFx('celestial'); for (let k = 0; k < 16; k++) emitEmber(t.x + (Math.random() - 0.5) * 40, t.y - Math.random() * 80, { spread: 200, r: 3 + Math.random() * 3 });
    }
    match.enemyShots = []; match.bossMarks = [];
    bossTickets(b.x - 30, b.y);                               // también su ticket amarillo
    showBanner('¡Has vencido a Aphrodite!', '¡Cuidado… llega Mark Evans!', '#f4e9b8', true);
    document.getElementById('boss-bar').classList.add('hidden');
    pullAllPickups();
    match.markAt = match.elapsed + 2.6;                       // Mark sale en esta misma arena
    match.miniBossQueue = [];
    SFX.play('thunder');
    return;
  }
  scheduleHillman();
  const talentBoss = TALENT_BOSSES.includes(match.bossesBeaten) && match.talents.length < TALENT_SLOTS;
  if (!talentBoss && match.bossesBeaten >= RELIC_FROM_BOSS && !TALENT_BOSSES.includes(match.bossesBeaten)) match.pendingRelic = randomRelic();   // objeto al volver al campo
  match.enemyShots = [];
  // recompensa: gema grande (casi un nivel), monedas y un objeto seguro
  match.gems.push({ x:b.x, y:b.y, xp: Math.round(match.xpNext * 0.6), coin: 15 + 6 * b.idx, big:true });
  maybeDropItem({ x:b.x + 30, y:b.y }, true);
  bossTickets(b.x - 30, b.y);                            // cada boss: 1 ticket amarillo seguro (+ a veces otro amarillo o uno morado)
  showBanner(`¡Has vencido a ${b.name}!`, talentBoss ? 'Elige un talento' : match.pendingRelic ? 'Ha soltado un objeto' : null, '#f2b705');
  document.getElementById('boss-bar').classList.add('hidden');
  // las gemas vuelan hacia ti; el cuaderno también, y al cogerlo eliges talento.
  // Después de eso vuelves al campo grande.
  pullAllPickups();
  if (talentBoss) match.notebook = { x:b.x, y:b.y, t:0 };
  else match.arenaExitAt = match.elapsed + 1.6;
  if (match.bossIdx < BOSSES.length){
    match.nextRefAt = Math.max(BOSSES[match.bossIdx].minute * 60, matchClock() + 20 + Math.random() * 40);
    // a partir del tercer boss, entre boss y boss vuelve uno de los ya vencidos como mini boss
  }
  scheduleMiniBosses();
}

/* ======================================================================
   MARK EVANS — el final: sale al campo tras vencer a Aphrodite. Es INMORTAL (no se le puede dañar):
   le rodean balones celestiales, lleva una esfera-escudo celestial, se teletransporta cerca de ti,
   dispara, e invoca mini bosses. Cada 30 s sube de fase: más daño, más ritmo, más balones… sin límite.
   La partida acaba cuando te elimina (el tiempo que aguantas es tu récord).
   ====================================================================== */
const MARK = { growEvery: 1.875, orbitR: 115 };   // sin fases: mejora sin parar (16 veces más rápido que cuando subía cada 30 s)
function markPhase(){ return match.mark ? (match.elapsed - match.mark.start) / MARK.growEvery : 0; }   // nivel continuo (con decimales)
function markStats(){
  const ph = markPhase();
  return { ph, dmg: 1 + 0.2 * ph + 0.02 * ph * ph,              // daño: crece sin límite
    shotEvery: Math.max(0.1, 1.1 * Math.pow(0.88, ph)),         // ritmo de disparo
    orbs: Math.min(16, 6 + Math.floor(ph)), spin: 1.8 + 0.25 * ph,
    tpEvery: Math.max(1.4, 5 - 0.35 * ph),
    minionEvery: Math.max(6, 25 - 2.5 * ph), minions: ph >= 3 ? 2 : 1, full: ph >= 2 };
}
function spawnMark(){
  const c = CHARACTERS.find(ch => ch.id === 'ie01');
  const a = Math.random() * Math.PI * 2;
  const x = Math.max(80, Math.min(fieldW() - 80, match.x + Math.cos(a) * 380)), y = Math.max(80, Math.min(fieldH() - 80, match.y + Math.sin(a) * 380));
  const PB = psBossStats(psTime());
  match.mark = { x, y, start: match.elapsed, sprite: c ? c.sprite : null, face: c, ang: 0, shotCd: 2, tpCd: 4, minionCd: 8, hitCd: 0,
    baseShot: PB.shot, baseHit: PB.dmg };
  match.effects.push({ x, y, fixed: true, maxR: 160, life: 0.6, dur: 0.6, color: '#ffd84a', fill: true });
  showVsIntro({ name: 'Mark Evans', team: 'Raimon', color: '#ffd84a', faceChar: c });
  showBanner('¡Mark Evans!', 'Es inmortal: aguanta todo lo que puedas', '#ffd84a', true);
  SFX.play('thunder');
  const bar = document.getElementById('boss-bar');
  document.getElementById('boss-emoji').innerHTML = c ? charFace(c, 26) : '⚽';
  document.getElementById('boss-name').textContent = 'Mark Evans';
  { const tm = TEAM_BY_ID.raimon, ci = document.getElementById('boss-crest'); if (ci && tm && tm.crest){ ci.src = encodeURI(tm.crest); ci.style.display = ''; } }
  bar.style.setProperty('--c', '#ffd84a'); bar.classList.remove('hidden');
}
function markPos(){                                              // posición de cada balón que le rodea
  const m = match.mark, S = markStats(), out = [];
  for (let k = 0; k < S.orbs; k++){ const a = m.ang + k * Math.PI * 2 / S.orbs, r = MARK.orbitR + 18 * Math.sin(m.ang * 1.3 + k);
    out.push({ x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r }); }
  return out;
}
function spawnMiniBossAt(x, y, full){
  const pool = BOSSES.filter(d => !d.final), def = pool[Math.floor(Math.random() * pool.length)];
  const p = def.group ? def.group[Math.floor(Math.random() * def.group.length)] : def, i = Math.min(match.bossIdx, BOSSES.length - 1);
  const PB = psBossStats(psTime()), k = full ? 1 : MINI_BOSS.hp, kd = full ? 1 : MINI_BOSS.dmg;
  const hp = PB.hp * k;
  match.enemies.push({
    miniBoss: true, idx: i, name: p.name, team: def.team, emoji: '', element: sheetElement(BOSS_SHEETS[p.name]) || p.element, kit: def.team, build: 'big',
    x, y, size: 14, hp, maxHp: hp, speed: 0.85 * BOSS_BOOST,
    dmg: PB.dmg * kd, shotDmg: PB.shot * kd,
    attacks: p.attacks, attackIdx: 0, special: null, attackCd: 3, attackEvery: Math.max(1.8, 3 - 0.12 * i) * (full ? 1 : MINI_BOSS.attackSlow),
    pending: [], specialCd: 99, basicCd: 2.5, xp: Math.round(match.xpNext * 0.25), coin: 10 + 3 * i,
  });
  match.effects.push({ x, y, fixed: true, maxR: 90, life: 0.5, dur: 0.5, color: '#ffd84a' });
}
function updateMark(dt){
  if (!match.mark){
    if (match.markAt && match.elapsed >= match.markAt){ match.markAt = 0; spawnMark(); }
    return;
  }
  const m = match.mark, S = markStats();
  m.ang += S.spin * dt;
  // se acerca despacio si estás lejos
  const dx = match.x - m.x, dy = match.y - m.y, d = Math.hypot(dx, dy) || 1;
  if (!m.tpAt && d > 260){ m.x += dx / d * 70 * dt; m.y += dy / d * 70 * dt; }
  // balones que le rodean: te golpean si los tocas
  m.hitCd -= dt;
  if (m.hitCd <= 0 && !m.tpAt){
    for (const o of markPos()) if (Math.hypot(o.x - match.x, o.y - match.y) < 26){ m.hitCd = 0.45; hurtPlayer(m.baseShot * 1.6 * S.dmg * ENEMY_PROJ_X3 * (1 - Math.min(75, match.def) / 100), null); break; }
  }
  if (m.hitCd <= 0 && d < 34){ m.hitCd = 0.45; hurtPlayer(m.baseHit * S.dmg * (1 - Math.min(75, match.def) / 100), null); }   // contacto
  // teletransporte: destello de aviso y aparece cerca de ti
  if (m.tpAt){
    if (match.elapsed >= m.tpAt){
      match.effects.push({ x: m.x, y: m.y, fixed: true, maxR: 70, life: 0.3, dur: 0.3, color: '#ffd84a', fill: true });
      m.x = m.tpX; m.y = m.tpY; m.tpAt = 0;
      match.effects.push({ x: m.x, y: m.y, fixed: true, maxR: 90, life: 0.4, dur: 0.4, color: '#ffffff', fill: true });
      const n = 8 + Math.min(16, Math.floor(S.ph * 2)), off = Math.random() * 6.28;     // al aparecer, anillo de balones celestiales
      for (let k = 0; k < n; k++){ const a = off + k * 6.283 / n; match.enemyShots.push({ x: m.x, y: m.y, vx: Math.cos(a) * 3.6, vy: Math.sin(a) * 3.6, r: 10, dmg: m.baseShot * 0.55 * S.dmg, element: 'celestial', life: 3.5 }); }
    }
  } else {
    m.tpCd -= dt;
    if (m.tpCd <= 0){
      m.tpCd = S.tpEvery;
      let tx, ty, tries = 0;
      do { const a = Math.random() * 6.28, r = 200 + Math.random() * 120; tx = Math.max(60, Math.min(fieldW() - 60, match.x + Math.cos(a) * r)); ty = Math.max(60, Math.min(fieldH() - 60, match.y + Math.sin(a) * r)); }
      while (!match.inArena && obstacleAt(tx, ty, 40) && ++tries < 20);
      m.tpX = tx; m.tpY = ty; m.tpAt = match.elapsed + 0.6;
      match.effects.push({ x: tx, y: ty, fixed: true, maxR: 70, life: 0.6, dur: 0.6, color: '#fff3a0' });
    }
  }
  // disparo: balón celestial hacia ti (cada vez más seguido)
  m.shotCd -= dt;
  if (m.shotCd <= 0 && !m.tpAt){
    m.shotCd = S.shotEvery;
    const a = Math.atan2(match.y - m.y, match.x - m.x) + (Math.random() - 0.5) * 0.12;
    match.enemyShots.push({ x: m.x, y: m.y - 10, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 11, dmg: m.baseShot * 0.6 * S.dmg, element: 'celestial', life: 3.5 });
  }
  // invoca mini bosses
  m.minionCd -= dt;
  if (m.minionCd <= 0){
    m.minionCd = S.minionEvery;
    for (let k = 0; k < S.minions; k++){ const a = Math.random() * 6.28; spawnMiniBossAt(Math.max(60, Math.min(fieldW() - 60, m.x + Math.cos(a) * 140)), Math.max(60, Math.min(fieldH() - 60, m.y + Math.sin(a) * 140)), S.full); }
    addFloatText(m.x, m.y - 70, '¡Invoca un boss!', '#ffd84a');
  }
  // barra de arriba: inmortal y su fase
  document.getElementById('boss-team').textContent = `Inmortal · Poder ×${S.dmg.toFixed(1)}`;
  document.getElementById('boss-hp-fill').style.width = '100%';
}
/* dibujo de Mark: sprite, esfera-escudo celestial y balones que le rodean */
function drawMark(camX, camY){
  const m = match.mark; if (!m) return;
  const ex = m.x + camX, ey = m.y + camY, fading = m.tpAt ? Math.max(0.15, (m.tpAt - match.elapsed) / 0.6) : 1;
  pxBegin();
  isFireFx('celestial');
  drawTimeCircle(ex, ey, MARK.orbitR + 30, fading);              // su círculo de balones también es un círculo del tiempo que ralentiza
  isFireFx('celestial');
  const orbs = markPos();
  for (const o of orbs) if (o.y < m.y){ drawFireBall(o.x + camX, o.y + camY, 12, -(o.y - m.y), o.x - m.x, 0.4, o.x); }
  pxEnd();
  ctx.save(); ctx.globalAlpha = fading;
  ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(ex, ey + 13, 30, 10, 0, 0, 6.28); ctx.fill(); ctx.globalAlpha = fading;
  ctx.imageSmoothingEnabled = false;
  if (m.sprite){ const mv = Math.hypot(match.x - m.x, match.y - m.y) > 260; drawSheetAt(m.sprite, ex, ey + 14, BOSS_SHEET_SCALE, face8Of(match.x - m.x, match.y - m.y), mv, 0); }
  ctx.restore();
  pxBegin();
  // esfera-escudo celestial
  const R = 50 + 2 * Math.sin(match.elapsed * 6), cy = ey - 22;
  const g = ctx.createRadialGradient(ex - R * 0.3, cy - R * 0.35, R * 0.1, ex, cy, R);
  g.addColorStop(0, 'rgba(255,250,220,0.10)'); g.addColorStop(0.7, 'rgba(255,224,74,0.16)'); g.addColorStop(1, 'rgba(255,210,60,0.45)');
  ctx.globalAlpha = fading; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, cy, R, 0, 6.28); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#7a5208'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffe680'; ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff6c8'; ctx.globalAlpha = 0.45 * fading;
  for (let k = 0; k < 6; k++){ const a = match.elapsed * 1.6 + k * Math.PI / 3, z = Math.cos(a); if (z < 0) continue;
    const hx = ex + Math.sin(a) * R * 0.62, hy = cy + (k % 2 ? -1 : 1) * R * 0.28, hr = 6 * (0.5 + 0.5 * z);
    ctx.beginPath(); for (let j = 0; j <= 6; j++){ const b = j * Math.PI / 3; ctx.lineTo(hx + Math.cos(b) * hr, hy + Math.sin(b) * hr); } ctx.stroke(); }
  ctx.globalAlpha = 0.8 * fading; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(ex, cy, R * 0.78, Math.PI * 1.08, Math.PI * 1.38); ctx.stroke();
  // balones de delante
  ctx.globalAlpha = 1; isFireFx('celestial');
  for (const o of orbs) if (o.y >= m.y){ drawFireBall(o.x + camX, o.y + camY, 12, -(o.y - m.y), o.x - m.x, 0.4, o.x); }
  if (Math.random() < 0.3){ const o = orbs[Math.floor(Math.random() * orbs.length)]; emitEmber(o.x, o.y, { spread: 20 }); }
  pxEnd();
}

/* ---- mini bosses: un boss ya vencido vuelve al campo (uno entre boss y boss) ---- */
const MINI_BOSS = { fromBeaten: 3, minDelay: 20, hp: 0.3, dmg: 0.7, attackSlow: 1.5 };
/* cuántos mini bosses salen antes del siguiente boss (índice del siguiente; BOSSES.length = recta final hacia Zeus) */
function miniBossCount(nextIdx){
  if (nextIdx >= BOSSES.length) return 3;                         // recta final (Zeus)
  const team = BOSSES[nextIdx].team;
  if (team === 'Farm') return 2;
  if (team === 'Kirkwood') return 2 + (Math.random() < 0.5 ? 1 : 0);
  return 1;
}
/* reparte los mini bosses entre ahora y la llegada del siguiente árbitro (o el final del partido) */
function scheduleMiniBosses(){
  match.miniBossQueue = [];
  if (match.bossesBeaten < MINI_BOSS.fromBeaten) return;
  const now = matchClock(), end = match.bossIdx < BOSSES.length ? match.nextRefAt : MATCH_LENGTH - 30;
  const n = miniBossCount(match.bossIdx), span = Math.max(MINI_BOSS.minDelay * n, end - now - MINI_BOSS.minDelay);
  for (let k = 0; k < n; k++) match.miniBossQueue.push(now + MINI_BOSS.minDelay + span * (k + 0.25 + Math.random() * 0.5) / n);
}
function updateMiniBoss(dt){
  const Q = match.miniBossQueue;
  if (!Q || !Q.length) return;
  if (match.inArena || match.boss || match.bossSpawn || match.referee || matchClock() < Q[0]) return;
  Q.shift();
  // uno de los bosses que ya has vencido (de los hermanos Murdock, uno de los tres)
  const def = BOSSES[Math.floor(Math.random() * Math.min(match.bossesBeaten, BOSSES.length))];
  const p = def.group ? def.group[Math.floor(Math.random() * def.group.length)] : def;
  const i = match.bossIdx;
  const PB = psBossStats(psTime());
  const hp = PB.hp * MINI_BOSS.hp;
  const a = Math.random() * Math.PI * 2, r = 460;
  const x = Math.max(FIELD_MARGIN, Math.min(fieldW() - FIELD_MARGIN, match.x + Math.cos(a) * r));
  const y = Math.max(FIELD_MARGIN, Math.min(fieldH() - FIELD_MARGIN, match.y + Math.sin(a) * r));
  match.enemies.push({
    miniBoss:true, idx:i, name:p.name, team:def.team, emoji:'', element:p.element, kit:def.team, build:'big',
    x, y, size:14, hp, maxHp:hp, speed:0.85,
    dmg: PB.dmg * MINI_BOSS.dmg, shotDmg: PB.shot * MINI_BOSS.dmg,
    attacks:p.attacks, attackIdx:0, special:null, attackCd: 3, attackEvery: Math.max(1.8, 3 - 0.12 * i) * MINI_BOSS.attackSlow,
    pending: [], specialCd: 99, basicCd: 2.5, xp: Math.round(match.xpNext * 0.35), coin: 10 + 3 * i,
  });
  { const mb = match.enemies[match.enemies.length - 1]; mb.hp *= BOSS_BOOST; mb.maxHp *= BOSS_BOOST; mb.dmg *= BOSS_BOOST; mb.shotDmg *= BOSS_BOOST; mb.speed *= BOSS_BOOST; }
}

/* ======================================================================
   HILLMAN — fusiona supertécnicas: cada tecla (Q y E) puede acabar lanzando
   2 habilidades a la vez. Solo él fusiona y como mucho una vez por tecla.
   Aparece en un borde del campo tras vencer al 3º, al 5º y al 7º boss (deja de
   venir cuando Q y E ya están fusionadas). Al tocarlo:
   - Con 1 supertécnica sin fusionar: eliges entre 3 al azar de TODOS los
     atributos para fusionarla con ella.
   - Con 2 sin fusionar: fusionas esas dos entre sí (queda libre un hueco), o
     una de ellas con una nueva de otro atributo y la otra se queda en su tecla.
   - Con la Q fusionada y la E libre: te enseña una nueva para la E.
   - Sin ninguna: te enseña 1 de 3 al azar de cualquier atributo.
   La parte nueva entra en Nv. 1 y a partir de ahí salen sus mejoras al subir
   de nivel (cada parte sube por separado). La R es la de la primera parte.
   ====================================================================== */
const HILLMAN = {
  firstAt: 300,            // la 1ª visita: en el minuto 5 exacto del reloj
  afterBosses: [4, 6],     // las siguientes: tras vencer a estos bosses
  delay: [15, 35],         // segundos después de volver al campo
  stay: 60,                // segundos que espera antes de irse
  newLvl: 1,               // nivel con el que entra la parte nueva de una fusión
  maxVisits: 3,
};
/* ya están las dos teclas con 2 habilidades: Hillman no tiene nada más que hacer */
function hillmanDone(){ return !!match.mixed; }
/* las dos teclas ya tienen 2 habilidades: la próxima visita de Hillman es la MEZCLA de las 4 */
function readyToMix(){ return !match.mixed && match.techs.length >= 2 && match.techs.every(t => t.fused); }

function scheduleHillman(){
  if (hillmanDone()) return;
  if (readyToMix() && !match.nextHillmanAt && !match.hillman){          // visita extra para la mezcla (tras cualquier boss)
    match.nextHillmanAt = match.elapsed + HILLMAN.delay[0] + Math.random() * (HILLMAN.delay[1] - HILLMAN.delay[0]); return; }
  if ((match.hillmanVisits || 0) >= HILLMAN.maxVisits) return;
  if (HILLMAN.afterBosses.includes(match.bossesBeaten))
    match.nextHillmanAt = match.elapsed + HILLMAN.delay[0] + Math.random() * (HILLMAN.delay[1] - HILLMAN.delay[0]);
}

function updateHillman(){
  if (match.hillman){
    const h = match.hillman;
    if (!match.inArena && match.elapsed > h.until){
      match.hillman = null;
      showBanner('👴 Hillman se ha ido', match.hillmanVisits < HILLMAN.maxVisits ? 'Volverá tras otro boss' : 'Ya no volverá', '#d29a5a');
      return;
    }
    if (!match.inArena && Math.hypot(h.x - match.x, h.y - match.y) < 42){ match.hillman = null; openHillman(); }
    return;
  }
  // 1ª visita: en cuanto el reloj marca 5:00 (el reloj está parado en los duelos y con el árbitro fuera)
  if (!match.hillmanFirst && !match.inArena && !match.boss && !match.bossSpawn && matchClock() >= HILLMAN.firstAt && !hillmanDone()){
    match.hillmanFirst = true;
    if ((match.hillmanVisits || 0) < HILLMAN.maxVisits) match.nextHillmanAt = match.elapsed;
  }
  if (match.inArena || match.boss || !match.nextHillmanAt || match.elapsed < match.nextHillmanAt) return;
  match.nextHillmanAt = 0;
  match.hillmanVisits = (match.hillmanVisits || 0) + 1;
  // en un borde al azar del campo
  const side = Math.floor(Math.random() * 4), m = 90;
  let x = m + Math.random() * (FIELD_W - 2 * m), y = m + Math.random() * (FIELD_H - 2 * m);
  if (side === 0) y = m; else if (side === 1) y = FIELD_H - m; else if (side === 2) x = m; else x = FIELD_W - m;
  const p = { x, y }; pushOutOfObstacles(p, 40);
  match.hillman = { x: p.x, y: p.y, until: match.elapsed + HILLMAN.stay };
  showBanner('👴 ¡Ha llegado Hillman!', 'Búscalo en el borde del campo: fusiona tus supertécnicas', '#d29a5a');
}

/* supertécnicas al azar de cualquier atributo que no tengas ya */
function randomTechOffers(n, otherElement = false){
  const owned = match.techs.flatMap(t => techParts(t).map(q => q.kind));
  const pool = [];
  for (const k of TECH_ORDER){
    if (owned.includes(k) || (match.veto || []).includes(k)) continue;
    if (isBuffKind(k)){ pool.push({ kind:k, element:null }); continue; }      // los cuadernos no tienen afinidad
    for (const el of ELEMENT_ORDER) if (!otherElement || el !== match.element) pool.push({ kind:k, element:el });
  }
  pool.sort(() => Math.random() - 0.5);
  // primero tipos distintos; si no llegan a n, se completa con el mismo tipo de otros atributos
  const out = [], kinds = new Set();
  for (const o of pool){ if (out.length < n && !kinds.has(o.kind)){ kinds.add(o.kind); out.push(o); } }
  for (const o of pool){ if (out.length < n && !out.includes(o)) out.push(o); }
  // siempre al menos un cuaderno entre las opciones (si queda alguno), para poder combinarlo
  const nb = pool.filter(o => isBuffKind(o.kind));
  if (n >= 2 && nb.length && !out.some(o => isBuffKind(o.kind))) out[out.length - 1] = nb[Math.floor(Math.random() * nb.length)];
  return out;
}

function openHillman(){
  match.paused = true;
  match.keys = {};
  const box = document.getElementById('hillman-options'), sub = document.getElementById('hillman-sub');
  box.innerHTML = '';
  match.levelupChoices = [];
  const opts = [];
  const elTag = el => el ? elLabel(el, 16) : '📓 Sin afinidad';
  const nm = t => techNameOf(t.kind, t.element, isEvolved(t));
  const L = HILLMAN.newLvl;
  const rText = (p, q) => {                       // de quién será la R (los cuadernos no tienen)
    const src = !isBuffKind(p.kind) ? p : !isBuffKind(q.kind) ? q : null;
    return src ? `La R será la de ${techNameOf(src.kind, src.element, true)}` : 'Sin R (las dos son cuadernos)';
  };
  const fuseNew = (t, o) => () => { t.fused = { kind: o.kind, lvl: L, element: o.element }; match.activeTech = match.techs.indexOf(t); };
  const teach = o => () => { match.techs.push({ kind: o.kind, lvl: 1, charge: 0, element: o.element }); if (match.techs.length === 1) match.activeTech = 0; };
  const offerCard = (o, extra) => ({ title: `${techLogo(o.kind, o.element)} ${techNameOf(o.kind, o.element, false)} · ${elTag(o.element)}`, desc: (extra ? extra + ' ' : '') + TECH_KINDS[o.kind].desc(1) });
  const free = match.techs.filter(t => !t.fused);
  if (readyToMix()){                               // MEZCLA DE 4: todo a la Q; la E queda bloqueada
    const all = match.techs.flatMap(t => techParts(t).map(q => ({ kind: q.kind, lvl: q.lvl, element: q.element || (isBuffKind(q.kind) ? null : match.element) })));
    const bases = all.filter(q => !isBuffKind(q.kind));
    const els = [...new Set(all.filter(q => q.element).map(q => q.element))];
    sub.textContent = `Junto tus 4 habilidades en la ${SLOT_KEYS[0]}. La ${SLOT_KEYS[1]} se queda bloqueada: ya solo subirás estas 4. Elige la base: su técnica definitiva será tu R, y pegará con la mejor afinidad de las que mezcles (${els.map(e => getElement(e).name).join(', ')}).`;
    bases.forEach(b => opts.push({
      title: `${all.map(q => techLogo(q.kind, q.element || match.element, 16)).join('')} Base: ${techNameOf(b.kind, b.element, b.lvl >= EVOLVE_AT)} · ${elTag(b.element)}`,
      desc: `La R será ${techNameOf(b.kind, b.element, true)}. Las otras 3 siguen funcionando a la vez.`,
      apply: () => {
        const rest = all.filter(q => q !== b);
        match.techs = [{ kind: b.kind, lvl: b.lvl, element: b.element, charge: 0, fused: rest[0], extra: rest.slice(1) }];
        match.activeTech = 0; match.mixed = true;
      },
    }));
  }
  // pinta una lista de opciones; elegir una ejecuta su acción (puede abrir un segundo paso)
  const show = (list, text) => {
    sub.textContent = text;
    box.innerHTML = '';
    match.levelupChoices = [];
    list.forEach((o, i) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-option upgrade-special';
      btn.innerHTML = `<b><kbd class="upgrade-key">${i + 1}</kbd> ${o.title}</b><span>${o.desc}</span>`;
      const choose = () => {
        if (!match.levelupChoices) return;
        if (o.next){ o.next(); return; }
        o.apply();
        showBanner('👴 ¡Fusión de Hillman!', match.techs.length ? techName(match.techs[match.activeTech] || match.techs[0]) : null, '#d29a5a');
        closeHillman();
      };
      btn.onclick = choose;
      match.levelupChoices.push(choose);
      box.appendChild(btn);
    });
  };
  if (opts.length){ /* mezcla de 4: se pinta abajo */ }
  else if (free.length >= 2){
    // paso 1: la primera supertécnica (la que mantiene su R)
    const step2 = p => {
      const q = free.find(t => t !== p), i = match.techs.indexOf(p);
      const list = [{
        title: `${techIcon(p)}${techIcon(q)} ${nm(p)} + ${nm(q)}`,
        desc: `Tu otra supertécnica. ${rText(p, q)}. Queda libre un hueco de supertécnica.`,
        apply: () => {
          p.fused = { kind: q.kind, lvl: q.lvl, element: q.element || match.element };
          match.techs = match.techs.filter(t => t !== q);
          match.activeTech = match.techs.indexOf(p);
        },
      }];
      for (const o of randomTechOffers(2, true)) list.push({
        ...offerCard(o, `Nueva (entra en Nv. ${L}). ${nm(q)} se queda en la ${SLOT_KEYS[match.techs.indexOf(q)]}.`),
        apply: fuseNew(p, o),
      });
      show(list, `¿Con qué combino ${nm(p)} (${SLOT_KEYS[i]})? Con tu otra supertécnica o con una de estas dos nuevas.`);
    };
    show(free.map(p => ({
      title: `${techIcon(p)} ${nm(p)} · ${SLOT_KEYS[match.techs.indexOf(p)]}`,
      desc: isBuffKind(p.kind) ? 'Será la base de la fusión. Los cuadernos no tienen R: la R será la de la otra.' : 'Será la base de la fusión y mantiene su técnica definitiva (R).',
      next: () => step2(p),
    })), 'Elige qué supertécnica quieres combinar.');
    document.getElementById('btn-hillman-reject').onclick = () => { SFX.closeAs = 'reject'; closeHillman(); };
    document.getElementById('hillman-overlay').classList.remove('hidden');
    return;
  } else if (free.length === 1){
    const a = free[0], key = SLOT_KEYS[match.techs.indexOf(a)];
    sub.textContent = `Elige una supertécnica de cualquier atributo para fusionarla con ${nm(a)} (${key}). Entra en Nv. ${L}. ${isBuffKind(a.kind) ? 'Tu cuaderno no tiene R: la R será la de la nueva cuando evolucione.' : 'La R seguirá siendo la tuya.'}`;
    for (const o of randomTechOffers(3)) opts.push({ ...offerCard(o), apply: fuseNew(a, o) });
  } else if (match.techs.length === 1){
    sub.textContent = `Tu ${SLOT_KEYS[0]} ya lanza dos habilidades. Te enseño una nueva para la ${SLOT_KEYS[1]}; la próxima vez podré fusionarla.`;
    for (const o of randomTechOffers(3)) opts.push({ ...offerCard(o, `Nueva en la ${SLOT_KEYS[1]}.`), apply: teach(o) });
  } else {
    sub.textContent = 'Aún no tienes supertécnicas: te enseño una de cualquier atributo. Cuando tengas alguna, volveré para fusionar.';
    for (const o of randomTechOffers(3)) opts.push({ ...offerCard(o), apply: teach(o) });
  }
  opts.forEach((o, i) => {
    const btn = document.createElement('button');
    btn.className = 'upgrade-option upgrade-special';
    btn.innerHTML = `<b><kbd class="upgrade-key">${i + 1}</kbd> ${o.title}</b><span>${o.desc}</span>`;
    const choose = () => {
      if (!match.levelupChoices) return;
      o.apply();
      showBanner('👴 ¡Fusión de Hillman!', match.techs.length ? techName(match.techs[match.activeTech] || match.techs[0]) : null, '#d29a5a');
      closeHillman();
    };
    btn.onclick = choose;
    match.levelupChoices.push(choose);
    box.appendChild(btn);
  });
  document.getElementById('btn-hillman-reject').onclick = () => { SFX.closeAs = 'reject'; closeHillman(); };
  document.getElementById('hillman-overlay').classList.remove('hidden');
}
function closeHillman(){
  document.getElementById('hillman-overlay').classList.add('hidden');
  match.levelupChoices = null;
  match.paused = false;
  renderTechBar();
  renderInventory();
}

/* ======================================================================
   OBJETOS (como en PokéSurvivor): solo puedes llevar UNO por partido.
   - Cofres que aparecen muy de vez en cuando en el campo: quédate a su lado
     unos segundos para abrirlo. Dan experiencia, monedas o (20%) un objeto.
   - A partir del 3º boss (ya con las 2 pasivas de los 2 primeros), cada boss
     suelta un objeto al vencerlo. Si ya llevas uno, eliges si cambiarlo.
   ====================================================================== */
const RELICS = {
  botasInazuma: { emoji:'🥾', name:'Botas Inazuma',        desc:'Te curas un 5% del daño que haces (como mucho un 4% de tu vida por segundo)' },
  amuleto:      { emoji:'📿', name:'Amuleto de oro',       desc:'+50% de monedas al acabar el partido' },
  pulsera:      { emoji:'🔗', name:'Pulsera exitosa',      desc:'−20% de recarga en todo: disparo, supertécnicas y cuadernos' },
  chapa:        { emoji:'🎖️', name:'Chapa vieja',          desc:'Quien te golpea cuerpo a cuerpo recibe el doble de tu daño' },
  gafas:        { emoji:'🥽', name:'Gafas de Willy',       desc:'+30% de experiencia' },
  pinchito:     { emoji:'🍢', name:'Pinchito supremo',     desc:'Un golpe que te dejaría KO te deja con 1 de vida (cada 60 s)' },
  nectarDioses: { emoji:'🧪', name:'Néctar de los dioses', desc:'+30% de daño, pero cada disparo te quita un 0,5% de vida (nunca te deja KO)' },
  artefacto:    { emoji:'🏺', name:'Artefacto raro',       desc:'+40% de daño, pero no puedes cambiar de supertécnica (Q/E)' },
  tecnica:      { emoji:'📜', name:'Técnica secreta',      desc:'Tus golpes ralentizan un 40% a los rivales durante 1,5 s' },
  botasHalcon:  { emoji:'🦅', name:'Botas de halcón',      desc:'+30% de velocidad de movimiento' },
  cintaMark:    { emoji:'🎗️', name:'Cinta de Mark',        desc:'Escudo del 15% de tu vida máxima; se recarga si no te dañan durante 8 s' },
  balonAlius:   { emoji:'🧿', name:'Balón Alius',          desc:'Tus golpes envenenan: durante 3 s, un 30% del golpe cada segundo' },
  guantes:      { emoji:'🧤', name:'Guantes de portero',   desc:'15% de bloquear del todo un golpe (como mucho una vez cada 2 s)' },
  camiseta:     { emoji:'👕', name:'Camiseta del Raimon',  desc:`Con poca vida (menos del ${LOW_HP * 100}%): +25% de probabilidad de crítico` },
  manto:        { emoji:'🧥', name:'Manto del Zeus',       desc:'Con menos del 20% de vida: +40% de probabilidad de crítico. Lo que pase del 100% se convierte en daño crítico' },
};
const CHESTS = {
  checkEvery: 10,      // cada cuántos segundos se tira el dado
  chance: 0.06,        // probabilidad de que salga un cofre en cada tirada (~1 cada 3 min)
  maxOnField: 1,
  life: 75,            // segundos antes de desaparecer
  openTime: 3,         // segundos que tienes que quedarte al lado
  openRange: 60,
  relicChance: 0.20, xpChance: 0.40,   // el resto, monedas
  coins:[15, 40],
};
const RELIC_FROM_BOSS = 2;           // a partir del 2º boss los bosses sueltan un objeto (menos el 3º, que da talento)
const TALENT_BOSSES = [1, 3];        // el 1º y el 3º boss dan a elegir un talento (1 de 3)
const TALENT_CHOICES = 3;

function hasRelic(k){ return !!match && match.relic === k; }
function cdMult(){ return hasRelic('pulsera') ? 0.8 : 1; }
function relicDmgMult(){ return (hasRelic('nectarDioses') ? 1.3 : 1) * (hasRelic('artefacto') ? 1.4 : 1); }
function randomRelic(){
  const keys = Object.keys(RELICS).filter(k => k !== match.relic && !(match.relicVeto || []).includes(k));   // sin los vetados
  return keys[Math.floor(Math.random() * keys.length)];
}

/* todo el daño que recibe el jugador pasa por aquí (escudo, bloqueo, pinchito, chapa) */
const IFRAMES = 0.45;
/* ¿está en marcha una técnica definitiva (R)? Mientras dura, no recibes daño (escudo invisible) */
function ultRunning(){
  if ((match.ultInvUntil || 0) > match.elapsed) return true;
  if (match.elapsed - (match.ultStartAt ?? -99) > 8) return false;             // (por seguridad: nunca más de 8 s)
  const r = match.rainUlt;
  return !!((match.ultAnim && match.elapsed - match.ultAnim.start < 4) || (match.breath && match.elapsed < match.breath.until) || orbitBoosted()
    || (r && match.elapsed - r.start <= r.dur) || (match.flurry && match.elapsed < match.flurry.until));
}
function hurtPlayer(amount, attacker){
  if (ultRunning()) return;
  if (pbActive('green')){ if (!(match.pbTxtAt > match.elapsed)){ match.pbTxtAt = match.elapsed + 0.6; addFloatText(match.x, match.y - 30, '¡Escudo!', '#4fd05a'); } return; }   // balón verde: nada te hace daño
  if (hasRelic('guantes') && match.elapsed >= (match.blockCdUntil || 0) && Math.random() < 0.15){
    match.blockCdUntil = match.elapsed + 2;
    addFloatText(match.x, match.y - 26, '🧤 ¡Bloqueado!', '#f2b705');
    return;
  }
  if (match.elapsed < (match.iframeUntil || 0)) return;           // PokéSurvivor: 0,45 s invulnerable tras cada golpe
  match.lastHurtAt = match.elapsed;
  match.iframeUntil = match.elapsed + IFRAMES;
  amount /= allK();                                              // ¡Vamos todos!: un poco más de defensa
  if (match.shield > 0){ const s = Math.min(match.shield, amount); match.shield -= s; amount -= s; }
  if (amount > 0){
    if (hasRelic('pinchito') && match.hp - amount <= 0 && match.elapsed >= (match.pinchitoCdUntil || 0)){
      match.hp = 1;
      match.pinchitoCdUntil = match.elapsed + 60;
      addFloatText(match.x, match.y - 40, '🍢 ¡Aguanta!', '#ff6b5e');
    } else match.hp -= amount;
    match.hurtUntil = match.elapsed + HURT_FLASH;                 // parpadeo rojo + borde rojo de la pantalla
    match.hurtFx = Math.min(1, (match.hurtFx || 0) * 0.5 + 0.35 + amount / Math.max(1, match.maxHp) * 4);
  }
  if (attacker && !attacker.dead && hasRelic('chapa')) damageEnemy(attacker, match.dmg * 2, { noProc:true });
}

/* ======================================================================
   PASIVAS DE AFINIDAD (fijas: no suben de nivel ni evolucionan)
   Usan tu daño INICIAL, así que pesan mucho al principio y poco al final.
   ====================================================================== */
const AFFINITY_PASSIVES = {
  fire:      { name:'Quemadura',   desc:'Tus golpes queman: el rival pierde vida cada medio segundo durante 3 s' },
  air:       { name:'Viento en contra', desc:'Tus golpes ralentizan a los rivales: se mueven un 25% más lentos durante 1,5 s' },
  forest:    { name:'Veneno',      desc:'Tus golpes envenenan: el veneno hace daño y va bajando de uno en uno' },
  mountain:  { name:'Empujón',     desc:'Tus golpes empujan un poco hacia atrás a los rivales' },
  dragon:    { name:'Remate',      desc:'Los rivales normales con menos del 10% de vida caen al instante' },
  celestial: { name:'Luz certera', desc:'+8% de probabilidad de crítico' },
};
const AFF = { burnDps: 0.3, burnTime: 3, poisonAdd: 3, poisonMax: 10, poisonPer: 0.08, poisonTick: 0.4, push: 9, execute: 0.10, crit: 8, airSlow: 0.75, airTime: 1.5 };
function affinityOnHit(e, hit, opts){
  const el = match.element, base = match.base ? match.base.dmg : match.dmg;
  if (el === 'fire'){ e.burn = { dps: base * AFF.burnDps, until: match.elapsed + AFF.burnTime }; }
  else if (el === 'air' && !e.boss){ e.airSlowUntil = match.elapsed + AFF.airTime; }   // Aire: el rival golpeado va más lento
  else if (el === 'forest'){ e.aPoison = Math.min(AFF.poisonMax, (e.aPoison || 0) + AFF.poisonAdd); }
  else if (el === 'mountain' && !e.boss && !e.miniBoss){
    const dx = e.x - match.x, dy = e.y - match.y, d = Math.hypot(dx, dy) || 1;
    e.x += dx / d * AFF.push; e.y += dy / d * AFF.push;
  }
}
/* daño de quemadura y veneno de las pasivas (cada fotograma) */
function updateAffinityDots(dt){
  const base = match.base ? match.base.dmg : match.dmg;
  for (const e of match.enemies){
    if (e.dead) continue;
    if (e.burn){
      if (match.elapsed > e.burn.until) e.burn = null;
      else { e.burnTick = (e.burnTick || 0) + dt; if (e.burnTick >= 0.5){ e.burnTick -= 0.5; damageEnemy(e, e.burn.dps * 0.5, { noProc:true }); } }
    }
    if (e.aPoison > 0){
      e.aPoisTick = (e.aPoisTick || 0) + dt;
      if (e.aPoisTick >= AFF.poisonTick){ e.aPoisTick -= AFF.poisonTick; damageEnemy(e, e.aPoison * Math.max(1, base * AFF.poisonPer), { noProc:true }); e.aPoison--; }
    }
  }
}

/* efectos de los objetos al golpear (no se aplican a sí mismos: noProc) */
function relicOnHit(e, hit){
  if (hasRelic('botasInazuma')){
    const heal = Math.min(hit * 0.05, match.lsBudget || 0);
    if (heal > 0){ match.hp = Math.min(match.maxHp, match.hp + heal); match.lsBudget -= heal; }
  }
  if (hasRelic('tecnica') && !e.boss) e.slowUntil = match.elapsed + 1.5;
  if (hasRelic('balonAlius')){
    const dps = hit * 0.3;
    if (!e.poison || e.poison.until < match.elapsed || e.poison.dps < dps) e.poison = { dps, until: match.elapsed + 3 };
    else e.poison.until = match.elapsed + 3;
  }
}

/* cada fotograma: escudo, robo de vida, veneno y cofres */
function updateRelics(dt){
  const capLs = match.maxHp * 0.04;
  match.lsBudget = Math.min(capLs, (match.lsBudget || 0) + capLs * dt);
  if (hasRelic('cintaMark')){
    const max = match.maxHp * 0.15;
    if (match.elapsed - (match.lastHurtAt || -99) >= 8) match.shield = Math.min(max, (match.shield || 0) + max * 0.5 * dt);
  } else match.shield = 0;
  for (const e of match.enemies){
    if (!e.poison || e.dead) continue;
    if (match.elapsed > e.poison.until){ e.poison = null; continue; }
    e.poisonTick = (e.poisonTick || 0) + dt;
    if (e.poisonTick >= 0.5){ e.poisonTick -= 0.5; damageEnemy(e, e.poison.dps * 0.5, { noProc:true }); }
  }
  updateChests(dt);
  updateInazumaTower(dt);
  updateAffinityDots(dt);
}

/* ---- TORRE INAZUMA ----
   Una por tramo entre bosses (desde el 1º). Sale sin avisar. Si te quedas a su lado (como al abrir
   un cofre) la activas: cae un trueno y a partir de ahí salen más rivales (+15% por cada torre
   activada, se acumula). En el tramo siguiente vuelve a salir otra. */
const ITOWER = { from: 1, range: 70, time: 2.5, perLvl: 0.15 };
function updateInazumaTower(dt){
  if (match.inArena || (match.bossesBeaten || 0) < ITOWER.from) return;
  if (match.itowerPhase !== match.bossesBeaten){            // tramo nuevo: sale una torre (sin avisar)
    match.itowerPhase = match.bossesBeaten;
    let x, y, tries = 0;
    do { x = 200 + Math.random() * (FIELD_W - 400); y = 200 + Math.random() * (FIELD_H - 400); }
    while ((Math.hypot(x - match.x, y - match.y) < 500 || obstacleAt(x, y, 70)) && ++tries < 50);
    match.itower = { x, y, prog: 0, active: false, bolt: 0, nextBolt: 2 + Math.random() * 3 };
  }
  const t = match.itower; if (!t) return;
  t.bolt = Math.max(0, t.bolt - dt);
  t.nextBolt -= dt;
  if (t.nextBolt <= 0){ t.bolt = 0.35; t.seed = Math.random() * 1000; t.nextBolt = t.active ? 1.2 + Math.random() * 1.5 : 4 + Math.random() * 4; }   // el trueno de la torre
  if (t.active) return;
  const near = Math.hypot(t.x - match.x, t.y - match.y) < ITOWER.range;
  t.prog = near ? t.prog + dt : Math.max(0, t.prog - dt * 0.5);
  if (t.prog >= ITOWER.time){
    t.active = true; t.prog = 0; t.bolt = 0.6; t.seed = Math.random() * 1000; t.nextBolt = 1;
    match.itowerLvl = (match.itowerLvl || 0) + 1;
    SFX.play('thunder');
    match.effects.push({ x:t.x, y:t.y, fixed:true, maxR:160, life:0.6, dur:0.6, color:'#ffe14a', fill:true });
    showBanner('¡Torre Inazuma activada!', `Más rivales en el campo · +${Math.round(ITOWER.perLvl * 100 * match.itowerLvl)}%`, '#ffe14a');
  }
}

/* sprite de la torre Inazuma (24x58): torre de comunicaciones gris de celosía (huecos como la
   torre Eiffel), plataforma con antenas y un rayo amarillo arriba. lit = activada (rayo y luces encendidos) */
const _itowerSpr = {};
function itowerSprite(lit){
  if (_itowerSpr[lit]) return _itowerSpr[lit];
  const Wd = 24, Ht = 58, c = document.createElement('canvas'); c.width = Wd; c.height = Ht; const g = c.getContext('2d');
  const O = '#1b1d26', L = '#c3cbd6', M = '#8f99a6', D = '#5f6773';
  const grid = Array.from({ length: Ht }, () => Array(Wd).fill(null));
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < Wd && y < Ht) grid[y][x] = col; };
  const line = (x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, col); };
  const top = 20, bot = Ht - 2;                                  // patas: de abajo (ancho) a la plataforma (estrecho)
  const legL = y => 1 + (bot - y) / (bot - top) * 8, legR = y => 22 - (bot - y) / (bot - top) * 8;
  // tramos con travesaño y aspas en X (lo de dentro queda hueco)
  const rows = [bot - 1, 47, 39, 32, 26, top];
  for (let i = 0; i < rows.length; i++){
    const y = rows[i]; line(legL(y), y, legR(y), y, i % 2 ? M : D);
    if (i){ const y0 = rows[i - 1]; line(legL(y0), y0, legR(y), y, D); line(legR(y0), y0, legL(y), y, D); }
  }
  // arco de abajo (como la Eiffel)
  for (let x = 4; x <= 19; x++){ const q = (x - 11.5) / 7.5; put(x, bot - 6 + Math.round(q * q * 5), M); }
  // patas (2 px, con luz a la izquierda)
  for (let y = top; y <= bot; y++){ put(legL(y), y, L); put(legL(y) + 1, y, M); put(legR(y), y, D); put(legR(y) - 1, y, M); }
  // plataforma y mástil con antenas
  for (let x = 6; x <= 17; x++){ put(x, top - 1, L); put(x, top - 2, M); }
  for (let y = 2; y < top - 2; y++){ put(11, y, L); put(12, y, D); }
  put(11, 1, lit ? '#ff5a4a' : '#a03a32'); put(12, 1, lit ? '#ff5a4a' : '#a03a32');                // luz de la punta
  for (let y = 12; y < top - 2; y++){ put(7, y, M); put(16, y, M); }                       // antenitas laterales
  put(7, 11, lit ? '#ff5a4a' : '#a03a32'); put(16, 11, lit ? '#ff5a4a' : '#a03a32');           // luces rojas
  put(8, 15, D); put(9, 15, D); put(14, 15, D); put(15, 15, D);                               // platos
  // el rayo, en la parte de arriba de la celosía (a 3/4 de la torre), con su contorno
  const Y = lit ? '#fff6a8' : '#f2c21b', Yd = lit ? '#ffd84a' : '#c79a12';
  const by = 19, bolt = [[13,0,2],[12,1,2],[11,2,2],[10,3,2],[9,4,5],[11,5,2],[10,6,2],[9,7,2]];
  for (const [x, y, w] of bolt) for (let k = -1; k <= w; k++) put(x + k, by + y, O);
  for (let k = 0; k < 3; k++){ put(13 + k - 1, by - 1, O); put(9 + k - 1, by + 8, O); }
  for (const [x, y, w] of bolt) for (let k = 0; k < w; k++) put(x + k, by + y, k === w - 1 ? Yd : Y);
  // contorno oscuro alrededor de todo lo dibujado
  const out = grid.map(r => r.slice());
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) if (!grid[y][x] && ((grid[y][x-1]) || (grid[y][x+1]) || (grid[y-1] && grid[y-1][x]) || (grid[y+1] && grid[y+1][x]))) out[y][x] = O;
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) if (out[y][x]) px(g, out[y][x], x, y, 1, 1);
  return (_itowerSpr[lit] = c);
}
function drawInazumaTower(camX, camY){
  const t = match.itower; if (!t || match.inArena) return;
  const cx = Math.round(t.x + camX), cy = Math.round(t.y + camY), S = 2.5;
  if (cx < -120 || cx > W + 120 || cy < -200 || cy > H + 120) return;
  const spr = itowerSprite(t.active), top = cy + 18 - spr.height * S;
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy + 18, 30, 8, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  if (t.active){ ctx.globalAlpha = 0.18 + 0.1 * Math.sin(match.elapsed * 6); ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fillStyle = '#ffe14a'; ctx.fill(); ctx.globalAlpha = 1; }
  const shake = t.prog > 0 ? Math.sin(match.elapsed * 40) * 1.2 : 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spr, Math.round(cx - spr.width / 2 * S + shake), Math.round(top), spr.width * S, spr.height * S);
  // el trueno: rayo en zigzag que baja del cielo hasta la antena
  if (t.bolt > 0){
    const ax = cx + shake + 1 * S, ay = top + 1 * S, k = Math.min(1, t.bolt / 0.35);
    let rnd = t.seed || 1; const R = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    const pts = []; let x = ax + (R() - 0.5) * 60, y = ay - 260;
    for (let i = 0; i <= 9; i++){ const q = i / 9; pts.push([Math.round((x * (1 - q) + ax * q + (i < 9 ? (R() - 0.5) * 26 : 0)) / 3) * 3, Math.round((y * (1 - q) + ay * q) / 3) * 3]); }
    ctx.globalAlpha = k; ctx.lineJoin = 'miter';
    for (const [w, col] of [[9, 'rgba(255,225,74,0.35)'], [5, '#ffe14a'], [2, '#ffffff']]){
      ctx.beginPath(); pts.forEach(([px2, py2], i) => i ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2)); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.globalAlpha = 0.5 * k; ctx.beginPath(); ctx.arc(ax, ay, 16, 0, Math.PI * 2); ctx.fillStyle = '#fff6a8'; ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (!t.active && t.prog > 0){
    ctx.beginPath(); ctx.arc(cx, cy - 10, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, t.prog / ITOWER.time));
    ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 5; ctx.stroke();
  }
  ctx.font = '700 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  const lbl = t.active ? 'Torre Inazuma · activada' : t.prog > 0 ? 'Activando…' : 'Torre Inazuma';
  ctx.strokeText(lbl, cx, top - 8); ctx.fillStyle = '#ffe14a'; ctx.fillText(lbl, cx, top - 8);
  ctx.restore();
}

/* cabeza de un personaje de hoja (fotograma de frente, 16x16) para las flechas del árbitro y de Hillman */
const _headCache = {};
function sheetHead(path){
  if (_headCache[path]) return _headCache[path];
  const h = sheetImage(path); if (!h || !h.ok) return null;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  c.getContext('2d').drawImage(h.img, 16, 15, 16, 16, 0, 0, 16, 16);
  return (_headCache[path] = c);
}
/* encima de un personaje: recuadro con su cabeza y una flechita que le señala */
function drawHeadMarker(x, yTop, path, color){
  const head = sheetHead(path); if (!head) return;
  const bob = Math.floor(match.elapsed * 3) % 2 ? 2 : 0, S = 2;
  const bx = Math.round(x), by = Math.round(yTop - 50 - bob);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1b1d26'; ctx.fillRect(bx - 19, by - 19, 38, 38);
  ctx.fillStyle = color; ctx.fillRect(bx - 17, by - 17, 34, 34);
  ctx.fillStyle = '#0c2052'; ctx.fillRect(bx - 15, by - 15, 30, 30);
  ctx.drawImage(head, bx - 16, by - 16, 32, 32);
  // flechita hacia abajo (píxeles)
  const ay = by + 21;
  ctx.fillStyle = '#1b1d26'; for (let r = 0; r < 5; r++) ctx.fillRect(bx - (6 - r) * S - S, ay + r * S - S, (12 - 2 * r) * S + 2 * S, S + 2 * S);
  ctx.fillStyle = color; for (let r = 0; r < 5; r++) ctx.fillRect(bx - (6 - r) * S, ay + r * S, (12 - 2 * r) * S, S);
  ctx.restore();
}

function updateChests(dt){
  if (match.inArena) return;
  match.chests = match.chests || [];
  const frozen = !clockRunning();                          // en el minuto del árbitro no salen cofres y no caducan
  if (frozen) for (const c of match.chests) c.until += dt;
  match.chestTimer = (match.chestTimer ?? CHESTS.checkEvery) - (frozen ? 0 : dt);
  if (match.chestTimer <= 0){
    match.chestTimer = CHESTS.checkEvery;
    if (match.chests.length < CHESTS.maxOnField && Math.random() < CHESTS.chance){
      let x, y, tries = 0;
      do { x = 150 + Math.random() * (FIELD_W - 300); y = 150 + Math.random() * (FIELD_H - 300); }
      while ((Math.hypot(x - match.x, y - match.y) < 400 || obstacleAt(x, y, 60)) && ++tries < 40);
      match.chests.push({ x, y, until: match.elapsed + CHESTS.life, prog: 0 });
      SFX.play('chest');                                  // aparece un cofre
    }
  }
  for (const c of match.chests){
    const near = Math.hypot(c.x - match.x, c.y - match.y) < CHESTS.openRange;
    c.prog = near ? c.prog + dt : Math.max(0, c.prog - dt * 0.5);
    if (c.prog >= CHESTS.openTime){ c.done = true; openChest(c); }
    else if (match.elapsed > c.until) c.done = true;
  }
  match.chests = match.chests.filter(c => !c.done);
}
function openChest(c){
  const r = Math.random();
  match.effects.push({ x:c.x, y:c.y, fixed:true, maxR:90, life:0.5, dur:0.5, color:'#f2b705', fill:true });
  if (r < CHESTS.relicChance){
    offerRelic(randomRelic(), 'cofre');
  } else if (r < CHESTS.relicChance + CHESTS.xpChance){
    match.gems.push({ x:c.x, y:c.y, xp: Math.round(match.xpNext * 0.35), coin:0, big:true, pull:true, fast:true });
  } else {
    const coins = CHESTS.coins[0] + Math.floor(Math.random() * (CHESTS.coins[1] - CHESTS.coins[0] + 1)) + 2 * match.wave;
    match.gems.push({ x:c.x, y:c.y, xp:0, coin: coins, kind:'bag', pull:true, fast:true });
  }
}

/* te ofrecen un objeto: si no llevas ninguno te lo pones; si llevas uno, eliges */
function equipRelic(k){
  match.relic = k;
  match.shield = k === 'cintaMark' ? match.maxHp * 0.15 : 0;
  showBanner(`¡${RELICS[k].name}!`, RELICS[k].desc, '#f2b705');
  renderInventory();
}
function offerRelic(k, from){
  if (!k) return;
  match.paused = true;
  match.keys = {};
  const nu = RELICS[k], where = from === 'boss' ? 'El boss ha soltado' : 'Dentro del cofre hay';
  const box = document.getElementById('relic-options');
  box.innerHTML = '';
  match.levelupChoices = [];
  let opts;
  if (!match.relic){                                   // el primer objeto también se puede aceptar o rechazar
    document.getElementById('relic-sub').textContent = `${where} ${nu.name}. ¿Te lo quedas? Solo puedes llevar un objeto.`;
    opts = [[`${relicIcon(k, 40)} Equipar ${nu.name}`, nu.desc, () => equipRelic(k)],
            ['Rechazarlo', 'Sigues sin objeto: podrás coger el siguiente que te salga', () => { SFX.closeAs = 'reject'; }]];
  } else {
    const cur = RELICS[match.relic];
    document.getElementById('relic-sub').textContent = `${where} ${nu.name}. Solo puedes llevar un objeto.`;
    opts = [[`${relicIcon(match.relic, 40)} Quedarme con ${cur.name}`, cur.desc, () => { SFX.closeAs = 'reject'; }],
            [`${relicIcon(k, 40)} Cambiar por ${nu.name}`, nu.desc, () => equipRelic(k)]];
  }
  opts.forEach(([title, desc, fn], i) => {
    const btn = document.createElement('button');
    btn.className = 'upgrade-option' + ((match.relic ? i : !i) ? ' upgrade-special' : '');
    btn.innerHTML = `<b><kbd class="upgrade-key">${i + 1}</kbd> ${title}</b><span>${desc}</span>`;
    const choose = () => { if (!match.levelupChoices) return; fn(); closeRelic(); };
    btn.onclick = choose;
    match.levelupChoices.push(choose);
    box.appendChild(btn);
  });
  document.getElementById('relic-overlay').classList.remove('hidden');
}
function closeRelic(){
  document.getElementById('relic-overlay').classList.add('hidden');
  match.levelupChoices = null;
  match.paused = false;
  renderInventory();
}

/* ======================================================================
   LÓGICA DE SUPERTÉCNICAS
   ====================================================================== */
function techNames(kind){
  if (isBuffKind(kind)) return TECH_KINDS[kind].names;
  const own = match.char.techNames && match.char.techNames[kind];
  return own || (TECH_NAMES[match.element] || NEUTRAL_TECH_NAMES)[kind];
}
function isEvolved(t){ return !isBuffKind(t.kind) && t.lvl >= EVOLVE_AT; }
/* la parte que da la R: la primera que no sea un cuaderno */
function ultElement(t){ if (!t) return match.element; if (!isBuffKind(t.kind)) return t.element || match.element; return (t.fused && t.fused.element) || match.element; }
function ultPart(t){
  if (!t) return null;
  if (!isBuffKind(t.kind)) return { kind: t.kind, lvl: t.lvl };
  if (t.fused && !isBuffKind(t.fused.kind)) return { kind: t.fused.kind, lvl: t.fused.lvl };
  return null;
}
function canUlt(t){ const p = ultPart(t); return !!p && p.lvl >= EVOLVE_AT; }
/* nombre de una supertécnica de cualquier atributo (las del propio atributo usan los nombres del personaje) */
function techNameOf(kind, element, evolved){
  if (isBuffKind(kind)) return TECH_KINDS[kind].names[0];
  const names = (!element || element === match.element) ? techNames(kind) : (TECH_NAMES[element] || NEUTRAL_TECH_NAMES)[kind];
  return names[evolved ? 1 : 0];
}
function techName(t){
  const a = techNameOf(t.kind, t.element, isEvolved(t));
  if (t.extra) return `${a} (mezcla de 4)`;
  return t.fused ? `${a} + ${techNameOf(t.fused.kind, t.fused.element, t.fused.lvl >= EVOLVE_AT)}` : a;
}
function techIcon(t, size = 18){ const ps = techParts(t), s2 = ps.length > 2 ? Math.round(size * 0.62) : size; return ps.map(q => techLogo(q.kind, q.element || match.element, s2)).join(''); }
function activeTech(){ return match.techs[match.activeTech] || null; }
/* todas las partes de una tecla: la base, la fusionada y (mezcla de 4) las dos de la otra tecla */
function techParts(t){ return t ? [t, t.fused, ...(t.extra || [])].filter(Boolean) : []; }
/* nivel de una supertécnica SOLO si es la que está en uso (0 si no); cuenta también la mitad fusionada */
function techLvl(kind){
  const t = activeTech();
  if (!t) return 0;
  const p = techParts(t).find(q => q.kind === kind);
  return p ? p.lvl : 0;
}
/* atributo con el que golpea una supertécnica (la fusionada puede ser de otro atributo) */
function techElement(kind){
  const t = activeTech();
  if (t && kind){
    if (t.kind === kind && t.element) return t.element;
    const p = techParts(t).find(q => q !== t && q.kind === kind);
    if (p) return p.element || match.element;
  }
  return match.element;
}
function orbitUltDur(extra){ return 3.5 + 0.5 * extra; }   // duración de la definitiva de órbita (antes 7 s + 1 por nivel extra)
const ORBIT_ULT_SPEED = 1.2;   // la definitiva de órbita te da +20% de velocidad mientras dura
function orbitBoosted(){ return match.orbitBoostUntil > match.elapsed; }
function addCharge(kind){
  const t = match.techs.find(tt => techParts(tt).some(q => q.kind === kind));
  if (!t || !canUlt(t) || !CHARGE_PER_HIT[kind]) return;
  if (match.elapsed < (match.ultCdUntil || 0)) return;             // recién usada la R: 5 s sin cargar
  const v = CHARGE_PER_HIT[kind] * (1 + 0.2 * (ultPart(t).lvl - EVOLVE_AT));
  const was = t.charge;
  t.charge = Math.min(chargeNeeded(), t.charge + v);
  if (was < chargeNeeded() && t.charge >= chargeNeeded()) SFX.play('ult_ready');   // la R ya está lista
}

/* Q / E: cambia la supertécnica que estás usando */
function selectTech(i){
  if (!match || match.paused || match.over) return;
  if (match.activeTech === i) return;
  if (hasRelic('artefacto') && !loneNotebook()){ addFloatText(match.x, match.y - 40, '🏺 No puedes cambiar', '#f2b705'); return; }
  // a un hueco vacío se puede cambiar para usar el disparo básico (salvo tras la mezcla de 4, que bloquea la otra tecla)
  if (!match.techs[i] && (match.mixed || !match.techs.length)) return;
  const prev = activeTech();
  if (prev && isBuffKind(prev.kind) && !prev.fused && (prev.nbCharge || 0) > 0.02){
    // cuaderno (cargado del todo o a medias): su mejora pasa a la otra supertécnica.
    // Dura lo mismo que tarda en cargarse entero × lo que hayas cargado; el círculo sigue bajando.
    match.nbUntil = match.nbUntil || {}; match.nbLvl = match.nbLvl || {}; match.nbDurs = match.nbDurs || {};
    const full = nbCd(prev.lvl) * cdMult(), secs = full * Math.min(1, prev.nbCharge);
    match.nbUntil[prev.kind] = match.elapsed + secs;
    match.nbLvl[prev.kind] = prev.lvl;
    match.nbDurs[prev.kind] = full;               // el círculo empieza donde lo dejaste y se vacía
    prev.nbCharge = 0;
    const K = TECH_KINDS[prev.kind];
    addFloatText(match.x, match.y - 56, `${K.icon} +${nbPow(prev.kind, prev.lvl)}% ${K.label} · ${secs.toFixed(1)} s`, K.color);
  }
  match.activeTech = i;
  SFX.play('switch');
  addFloatText(match.x, match.y - 40, match.techs[i] ? techName(match.techs[i]) : 'Disparo normal', getElement(match.element).color);
  renderTechBar();
}

/* los balones de órbita crecen al subir de nivel (Nv.1 ×1 … Nv.10 ×1,6) */
function orbScale(){ const l = techLvl('orbit'); return l ? 1 + 0.065 * (l - 1) : 1; }
function orbPositions(){
  const l = techLvl('orbit');
  if (!l) return [];
  const boost = orbitBoosted();
  let count = 3 + Math.floor((l - 1) / 2);   // 3,3,4,4,5,5,6,6
  if (boost) count *= 2;
  const R = (70 + 7 * l) * (boost ? 1.15 : 1);
  const out = [];
  for (let i = 0; i < count; i++){
    const a = match.orbAngle + i * Math.PI * 2 / count;
    out.push({ x: match.x + Math.cos(a) * R, y: match.y + Math.sin(a) * R });
  }
  if (boost){
    // anillo exterior que gira en sentido contrario
    const n2 = 10 + 2 * match.orbitBoostExtra;
    const R2 = R * 1.9;
    for (let i = 0; i < n2; i++){
      const a = -match.orbAngle2 + i * Math.PI * 2 / n2;
      out.push({ x: match.x + Math.cos(a) * R2, y: match.y + Math.sin(a) * R2, outer:true });
    }
  }
  return out;
}

function dropBomb(x, y, o){
  match.bombs.push({
    x, y, t:0, dur:o.dur, r:o.r, dmg:o.dmg, big:!!o.ult, ult:!!o.ult, element: o.element || match.element, fx: o.fx, pal: o.pal,
    emoji: getElement(o.element || match.element).drop,
  });
}

/* ---- golpe cercano: ráfagas de golpes alrededor del jugador ----
   Nv.1-2 delante · Nv.3-5 delante y detrás · Nv.6+ también a los lados.
   Evolucionado (Nv.5+): golpes más amplios y la ráfaga se repite dos veces. */
function meleeStats(l){
  const evo = l >= EVOLVE_AT;
  return {
    cd: Math.max(0.85, 1.5 - 0.08 * (l - 1)),          // segundos entre ráfagas
    range: 150 + 6.5 * (l - 1) + (evo ? 25 : 0),        // alcance del golpe (más al principio; al máximo, casi igual que antes)
    arc: (evo ? 130 : 100) * Math.PI / 180,             // anchura del golpe
    dmg: match.dmg * (1.8 + 0.15 * (l - 1)) * (evo ? 1.15 : 1),
    dirs: l >= 6 ? [0, Math.PI, -Math.PI / 2, Math.PI / 2] : l >= 3 ? [0, Math.PI] : [0],
    passes: evo ? 2 : 1,
  };
}
/* un golpe: daña a los rivales dentro del abanico y los empuja un poco */
function meleeSlash(ang, range, arc, dmg, opts = {}){
  const hits = [];
  if (!match.ultAnim && !opts.ult){ match.kickT = KICK_TIME; match.kickFace = face8Of(Math.cos(ang), Math.sin(ang)); }   // pose de golpe hacia donde pega
  for (const e of match.enemies){
    if (e.dead) continue;
    const dx = e.x - match.x, dy = e.y - match.y, d = Math.hypot(dx, dy);
    if (d > range + (e.size || 0) + 10) continue;
    let da = Math.atan2(dy, dx) - ang;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > arc / 2 && d > 22) continue;
    const crit = !opts.ult && Math.random() * 100 < effCrit();
    damageEnemy(e, dmg * (crit ? effCritMult() : 1), { crit, chargeKind: opts.ult ? null : 'melee', ult: opts.ult, ultKind:'melee', element: techElement('melee') });
    if (!e.boss && d > 0){ const push = opts.ult ? 22 : 10; e.x += dx / d * push; e.y += dy / d * push; }
    if (hits.length < 6) hits.push([e.x - match.x, e.y - match.y]);
  }
  match.slashes.push({ ang, range, arc, life: opts.ult ? 0.18 : 0.24, dur: opts.ult ? 0.18 : 0.24, big: !!opts.ult, flurry: !!opts.ult, hits,
                       color: getElement(techElement('melee')).color, fx: techElement('melee') });
}
function updateMelee(dt){
  const ml = techLvl('melee');
  if (ml){
    match.meleeCd -= dt;
    if (match.meleeCd <= 0){
      const st = meleeStats(ml);
      const near = match.enemies.some(e => !e.dead && Math.hypot(e.x - match.x, e.y - match.y) < st.range * 1.6);
      if (!near) match.meleeCd = 0.2;                  // nadie cerca: espera un poco
      else {
        match.meleeCd = st.cd * cdMult();
        match.meleeShieldT = match.elapsed;            // escudo esfera mientras dura la ráfaga
        match.meleeShieldDur = 0.25 + st.passes * st.dirs.length * 0.09;
        let t = 0;
        for (let p = 0; p < st.passes; p++) for (const off of st.dirs){
          match.meleeQueue.push({ t, off, range: st.range, arc: st.arc, dmg: st.dmg });
          t += 0.09;                                   // ráfaga: un golpe detrás de otro
        }
      }
    }
  }
  for (const q of match.meleeQueue){
    q.t -= dt;
    if (q.t <= 0){ q.done = true; meleeSlash(Math.atan2(match.aim.y, match.aim.x) + q.off, q.range, q.arc, q.dmg); }
  }
  match.meleeQueue = match.meleeQueue.filter(q => !q.done);
  // definitiva: torbellino de golpes en todas direcciones
  if (match.flurry){
    const f = match.flurry;
    if (match.elapsed >= f.until) match.flurry = null;
    else {
      f.acc += dt;
      while (f.acc >= 0.07){ f.acc -= 0.07; f.ang += 2.4; meleeSlash(f.ang, f.range, 120 * Math.PI / 180, f.dmg, { ult:true }); }
      if (!match.ultAnim){ const sa = match.elapsed * 16; match.kickT = KICK_TIME; match.kickFace = face8Of(Math.cos(sa), Math.sin(sa)); }   // gira sobre sí mismo
    }
  }
  for (const sl of match.slashes) sl.life -= dt;
  match.slashes = match.slashes.filter(sl => sl.life > 0);
}

/* cuadernos: mientras usas uno, cada pocos segundos se activa su mejora temporal */
function updateNotebookTechs(dt){
  // cuaderno SOLO (sin fusionar) en uso: no atacas y se va cargando
  const t = activeTech();
  if (t && isBuffKind(t.kind) && !t.fused){
    const was = (t.nbCharge || 0) >= 1;
    t.nbCharge = Math.min(1, (t.nbCharge || 0) + dt / (nbCd(t.lvl) * cdMult()));
    if (!was && t.nbCharge >= 1){
      const K = TECH_KINDS[t.kind];
      addFloatText(match.x, match.y - 44, `${K.icon} ¡Cargado! Cambia de supertécnica`, K.color);
    }
  }
}

function updateTechs(dt){
  updateNotebookTechs(dt);
  updateMelee(dt);
  // Órbita: balones girando alrededor del jugador
  const ol = techLvl('orbit');
  if (ol){
    const boost = orbitBoosted();
    // la velocidad de ataque hace girar los balones más rápido (y golpean más a menudo)
    const spin = Math.max(0.7, Math.min(3.5, match.atkSpeed * allK() * (buffActive('nectar') ? NECTAR_ATK : 1) * (pbActive('yellow') ? PBALL.yellow.mult : 1) / cdMult()));
    match.orbAngle += dt * (3 + 0.3 * ol) * spin * (boost ? 2.2 : 1);
    if (boost) match.orbAngle2 += dt * (3 + 0.3 * ol) * spin * 2.6;
    const dmg = match.dmg * (1.0 + 0.18 * (ol - 1)) * (boost ? 2.5 + 0.4 * match.orbitBoostExtra : 1);
    const hitR = (boost ? 34 : 26) * orbScale();
    for (const o of orbPositions()){
      for (const e of match.enemies){
        if (e.dead || (e.orbCd || 0) > match.elapsed) continue;
        if (Math.hypot(e.x - o.x, e.y - o.y) < hitR + (e.size || 0)){
          e.orbCd = match.elapsed + (boost ? 0.25 : 0.4) / spin;
          damageEnemy(e, dmg, { chargeKind: boost ? null : 'orbit', ult:boost, ultKind:'orbit', element: techElement('orbit') });   // la definitiva no recarga la R
        }
      }
    }
  }

  // Bocanada (definitiva penetrante): balones en cono hacia el rival más cercano
  if (match.breath){
    const br = match.breath;
    if (match.elapsed >= br.until) match.breath = null;
    else {
      br.acc += dt * br.rate;
      const target = nearestEnemy();
      const ang = target ? Math.atan2(target.y-match.y, target.x-match.x) : Math.atan2(match.aim.y, match.aim.x);
      br.ang = ang;
      while (br.acc >= 1){
        br.acc -= 1;
        const a = ang + (Math.random() - 0.5) * 0.9;
        const sp = 9 + Math.random() * 3;
        match.projectiles.push({
          x:match.x, y:match.y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
          r:7, dmg: br.dmg, crit:false, pierce:true, hit:[], life:1.1, style:'breath', techKind:null, ultDmg:true,
          fx: techElement('pierce'), ultKind:'pierce', element: techElement('pierce'),
        });
      }
    }
  }

  // Suelo ardiendo (definitiva de rebote): daña a quien lo pisa
  for (const pa of match.patches){
    pa.life -= dt;
    for (const e of match.enemies){
      if (e.dead || (e.patchCd || 0) > match.elapsed) continue;
      if (Math.hypot(e.x - pa.x, e.y - pa.y) < pa.r + (e.size || 0)){
        e.patchCd = match.elapsed + 0.4;
        damageEnemy(e, pa.dmg, { ult:true, ultKind:'bounce', element: pa.el });
      }
    }
  }
  match.patches = match.patches.filter(pa => pa.life > 0);
  for (const tr of match.triangles) tr.life -= dt;
  match.triangles = match.triangles.filter(tr => tr.life > 0);

  // Lluvia: cada cierto tiempo caen proyectiles sobre rivales cercanos
  const rl = techLvl('rain');
  if (rl){
    match.rainCd -= dt;
    if (match.rainCd <= 0){
      const near = match.enemies.filter(e => !e.dead && Math.hypot(e.x-match.x, e.y-match.y) < 480);
      if (!near.length){
        match.rainCd = 0.5;                       // sin rivales cerca: reintenta pronto
      } else {
        match.rainCd = Math.max(1.6, 2.8 - 0.17 * (rl - 1)) * cdMult();
        near.sort(() => Math.random() - 0.5);
        const count = 2 + Math.floor((rl - 1) / 2);   // 2,2,3,3,4,4,5,5
        for (let i = 0; i < count; i++){
          const target = near[i % near.length];
          const jitter = i < near.length ? 0 : 60;   // si sobran, caen junto a otro rival
          dropBomb(target.x + (Math.random()-0.5) * jitter, target.y + (Math.random()-0.5) * jitter, {
            dur: 0.7,
            r: 75 * (1 + 0.08 * (rl - 1)),
            dmg: match.dmg * (3 + 0.21 * (rl - 1)), element: techElement('rain'),
          });
        }
      }
    }
  }
  // las bombas que ya caen explotan aunque cambies de supertécnica
  for (const b of match.bombs){
    b.t += dt;
    if (b.t >= b.dur){
      b.done = true;
      for (const e of match.enemies){
        if (!e.dead && Math.hypot(e.x-b.x, e.y-b.y) <= b.r + (e.size || 0)) damageEnemy(e, b.dmg, { chargeKind: b.ult ? null : 'rain', ult:b.ult, ultKind:'rain', element:b.element });
      }
      match.effects.push({ x:b.x, y:b.y, fixed:true, maxR:b.r, life:0.4, dur:0.4,
                           color: getElement(b.element).color, fill:true });
    }
  }
  match.bombs = match.bombs.filter(b => !b.done);
}

/* R: técnica definitiva de la supertécnica en uso (si está evolucionada y cargada) */
/* definitivas penetrantes con salto: el aura de cada afinidad
   fire = tornado de fuego · air = truenos · forest = tornado oscuro · mountain = tornado de tierra con rocas · dragon = aura de dragón · celestial = mano gigante de luz */
const JUMP_ULT = {
  fire:     { spiral: 'fire' },
  forest:   { spiral: 'dark' },
  mountain: { spiral: 'mountain', rocks: true },
  air:      { thunder: true },
  dragon:   { dragon: true },
  celestial:{ spiral: 'gold', hand: true },
};
const GOLD_PAL = { core:'#fffbd6', mid:'#ffe680', hot:'#ffd21e', deep:'#c98a10', tint:'#fffbe6', ink:'#7a5208', ground:'#c9921a', blend:'source-over', kind:'holy', accent:'#ffffff', kind2:'ray' };
function spiralPal(k){ if (k === 'dark') FIRE = DARK_PAL; else if (k === 'gold') FIRE = GOLD_PAL; else isFireFx(k); }
const DARK_PAL = { core:'#e6d4ff', mid:'#9a5ae0', hot:'#5a1f9a', deep:'#12051f', tint:'#e6d4ff', ink:'#12051f', ground:'#12051f', blend:'source-over', kind:'scale', accent:'#b56ae6', kind2:'spark' };
/* animación de la definitiva penetrante con salto (Tornado de fuego → Fénix y las demás) */
const FENIX = { rise: 0.8, height: 78, fall: 0.35, spin: 22 };
function fenixState(){
  const u = match && match.ultAnim; if (!u || u.kind !== 'fenix') return null;
  const t = match.elapsed - u.start;
  if (t < u.rise){ const k = t / u.rise; return { phase:'rise', k, h: FENIX.height * (1 - Math.pow(1 - k, 2.2)), t }; }
  const td = t - u.rise, hold = 0.45;
  if (td < hold) return { phase:'shoot', k: td / hold, h: FENIX.height, t };
  const kf = Math.min(1, (td - hold) / FENIX.fall);
  return { phase:'fall', k: kf, h: FENIX.height * (1 - kf * kf), t };
}
function updateFenix(){
  const u = match.ultAnim; if (!u) return;
  const f = fenixState();
  if (!u.fired && f && f.phase !== 'rise'){
    u.fired = true;
    if (u.breath){
      u.breath.until = match.elapsed + (u.breath.until - u.start);     // la bocanada dura lo mismo, desde el disparo
      match.breath = u.breath;
    }
    const tg = nearestEnemy(), a = tg ? Math.atan2(tg.y - match.y, tg.x - match.x) : Math.atan2(match.aim.y, match.aim.x);
    match.kickT = 0.45; match.kickFace = face8Of(Math.cos(a), Math.sin(a));
    const fc = { fire:'#ffb43a', air:'#bfe8ff', forest:'#7a2fb8', mountain:'#c9894a', dragon:'#6f7fe8', celestial:'#fff3a0' }[u.el] || '#ffffff';
    match.effects.push({ x:match.x, y:match.y - FENIX.height, fixed:true, maxR:170, life:0.45, dur:0.45, color:fc, fill:true });
    if (u.el === 'air') lightningFlash && match.effects.push({ x:match.x, y:match.y, fixed:true, maxR:260, life:0.3, dur:0.3, color:'#ffffff' });
    if (u.el === 'mountain') for (let k = 0; k < 18; k++){ isFireFx('mountain'); emitEmber(match.x + (Math.random() - 0.5) * 40, match.y, { spread: 260, r: 3 + Math.random() * 4 }); }
    SFX.play && SFX.play('thunder');
  }
  if (f && f.phase === 'fall' && f.k >= 1) match.ultAnim = null;
}
/* aura del salto alrededor del jugador mientras sube (front = la parte que queda delante del jugador) */
/* definitiva de órbita (Potenciación, Entrada tormenta, Pingüino emperador Nº2, Muralla infinita, Torbellino dragón, Hora celestial):
   aura en el suelo alrededor del jugador mientras dura, sin saltar */
const ORBIT_AURA = {
  fire:     { spiral: 'fire' },
  air:      { spiral: 'air', thunder: true },
  mountain: { spiral: 'mountain', rocks: true },
  dragon:   { dragon: true },
};
const PURPLE_PAL = { core:'#f6ecff', mid:'#d3a6ff', hot:'#a24de0', deep:'#4a1680', tint:'#f1e6ff', ink:'#2a0a4a', ground:'#2a0a40', blend:'source-over', kind:'spark', accent:'#d9a8ff', accent2:'#6a24b0', kind2:'spark' };
/* definitiva de lluvia: auras alrededor del jugador mientras caen los impactos */
const RAIN_AURA = { air: { spiral: 'air', thunder: true }, dragon: { spiral: 'dragon', dragon: true } };
const ALAS = { img: new Image(), ok: false }; ALAS.img.onload = () => { ALAS.ok = true; }; ALAS.img.src = 'assets/ult/alas.png';
const PIE = { img: new Image(), ok: false };  PIE.img.onload = () => { PIE.ok = true; };   PIE.img.src = 'assets/ult/pie.png';
function rainAuraState(){
  const r = match.rainUlt; if (!r) return null;
  const t = match.elapsed - r.start; if (t > r.dur){ match.rainUlt = null; return null; }
  const left = r.dur - t;
  if (left < 0.4) return { phase: 'shoot', k: 1 - left / 0.4, h: 0, t };
  return { phase: 'rise', k: Math.min(1, t / 0.4), h: 0, t };
}
function drawRainAura(front){
  const f = rainAuraState(); if (!f) return;
  const r = match.rainUlt, J = RAIN_AURA[r.el], jh = (fenixState() || {}).h || 0;
  if (J){ if (!match.ultAnim) drawFenixTornado(front, { f, u: r, J, tall: 96 }); return; }
  if (r.el === 'celestial' && ALAS.ok && !front){                    // Sabiduría divina: alas de ángel a la espalda
    if (f.t > 1.2) return;                                           // las alas duran poco: se abren, baten y se desvanecen
    const fade = f.t > 0.85 ? 1 - (f.t - 0.85) / 0.35 : 1, open = 1 - Math.pow(1 - Math.min(1, f.t / 0.3), 3);
    const fr = Math.sin(match.elapsed * 9) > 0.2 ? 1 : 0, sc = FX_PIXEL * 0.45;
    const w = 90 * sc * (0.2 + 0.8 * open), h = 36 * sc * (0.6 + 0.4 * open), x = W / 2 - w / 2, y = H / 2 + 14 - 22 - jh - h * 0.62 + (fr ? -1 : 0);   // salen de la espalda, a la altura de los hombros
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, y + h / 2, 4, W / 2, y + h / 2, w * 0.6);
    g.addColorStop(0, `rgba(255,246,200,${0.45 * fade})`); g.addColorStop(1, 'rgba(255,246,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(W / 2, y + h / 2, w * 0.6, 0, 6.28); ctx.fill();
    ctx.imageSmoothingEnabled = false; ctx.globalAlpha = fade;
    ctx.drawImage(ALAS.img, fr * 90, 0, 90, 36, Math.round(x), Math.round(y), w, h);
    ctx.restore();
    if (Math.random() < 0.5){ isFireFx('celestial'); emitEmber(match.x + (Math.random() - 0.5) * w, match.y - 34 - jh + Math.random() * 16, { spread: 30 }); }
  }
}
/* Pisotón de sumo: una pierna de sumo baja de golpe y pisa el centro del triángulo, agrietando el suelo */
function drawSumoFoot(camX, camY, rr){
  const r = rr || match.rainUlt; if (!r || r.el !== 'mountain' || !PIE.ok) return;
  const t = match.elapsed - r.start, t0 = r.hit - 0.4;
  if (t < t0 || t > r.hit + 0.9) return;
  const down = Math.min(1, (t - t0) / 0.4), fall = down * down * down;           // acelera al caer
  const after = t - r.hit, gone = after > 0.3 ? Math.min(1, (after - 0.3) / 0.3) : 0;   // tras pisar, se levanta y se va
  const gx = r.cx + camX, gy = r.cy + camY, lift = (1 - fall) * 200 + gone * gone * 220;
  const sc = FX_PIXEL * 0.75, w = 34 * sc, h = 46 * sc, alpha = 1 - gone;
  ctx.save();
  // grietas en el suelo
  if (after > 0 && r.cracks){
    const ca = Math.max(0, 1 - after / 0.9);
    ctx.lineCap = 'square';
    for (const c of r.cracks){
      ctx.globalAlpha = 0.85 * ca; ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 4;
      ctx.beginPath(); c.forEach(([x, y], i) => i ? ctx.lineTo(gx + x, gy + y) : ctx.moveTo(gx + x, gy + y)); ctx.stroke();
      ctx.globalAlpha = 0.5 * ca; ctx.strokeStyle = '#c9894a'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.4 * alpha * (0.25 + 0.75 * fall); ctx.fillStyle = '#2a1608';  // sombra que crece al acercarse
  ctx.beginPath(); ctx.ellipse(gx, gy + 4, w * (0.25 + 0.3 * fall), w * (0.1 + 0.1 * fall), 0, 0, 6.28); ctx.fill();
  if (alpha > 0){
    const x = Math.round(gx - w * 0.55), y = Math.round(gy - h + 6 - lift);
    if (down < 1){                                                                  // líneas de velocidad
      ctx.globalAlpha = 0.6 * (1 - fall); ctx.fillStyle = '#fff3d8';
      for (const dx of [0.15, 0.45, 0.75]) ctx.fillRect(x + w * dx, y - 50, 3, 44);
    }
    ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
    ctx.drawImage(PIE.img, x, y, w, h);
  }
  ctx.restore();
  if (!r.stomped && t >= r.hit){                                                    // ¡PUM!
    r.stomped = true;
    r.cracks = [];
    for (let k = 0; k < 7; k++){
      let a = k / 7 * 6.28 + Math.random() * 0.5, x = 0, y = 0; const c = [[0, 0]], L = 40 + Math.random() * 50;
      for (let d = 0; d < L; d += 12){ a += (Math.random() - 0.5) * 0.7; x += Math.cos(a) * 12; y += Math.sin(a) * 6; c.push([Math.round(x), Math.round(y)]); }
      r.cracks.push(c);
    }
    match.effects.push({ x: r.cx, y: r.cy, fixed: true, maxR: 150, life: 0.35, dur: 0.35, color: '#e0b27a', fill: true });
    match.effects.push({ x: r.cx, y: r.cy, fixed: true, maxR: 210, life: 0.5, dur: 0.5, color: '#7a4c22' });
    isFireFx('mountain');
    for (let k = 0; k < 18; k++){ const a = Math.random() * 6.28; emitEmber(r.cx + Math.cos(a) * 30, r.cy + Math.sin(a) * 14, { spread: 220, r: 2 + Math.random() * 3 }); }
    SFX.play && SFX.play('thunder');
  }
}
const ROCA = { img: new Image(), ok: false }; ROCA.img.onload = () => { ROCA.ok = true; }; ROCA.img.src = 'assets/ult/roca.png';
const COHETE = { img: new Image(), ok: false }; COHETE.img.onload = () => { COHETE.ok = true; }; COHETE.img.src = 'assets/ult/cohete.png';
const PINGUINO = { img: new Image(), ok: false };
PINGUINO.img.onload = () => { PINGUINO.ok = true; }; PINGUINO.img.src = 'assets/ult/pinguino.png';
function orbitAuraState(){
  if (!orbitBoosted()) return null;
  const left = match.orbitBoostUntil - match.elapsed, dur = orbitUltDur(match.orbitBoostExtra || 0), t = dur - left;
  if (left < 0.5) return { phase: 'shoot', k: 1 - left / 0.5, h: 0, t };
  return { phase: 'rise', k: Math.min(1, t / 0.5), h: 0, t };
}
function drawOrbitAura(front){
  const f = orbitAuraState(); if (!f) return;
  const el = match.orbitBoostEl || techElement('orbit');
  if (!match.orbAura || match.orbAura.el !== el) match.orbAura = { el, bolts: [], nextBolt: 0 };
  const J = ORBIT_AURA[el];
  if (J){ drawFenixTornado(front, { f, u: match.orbAura, J, tall: 96 }); return; }
  const fade = f.phase === 'shoot' ? 1 - f.k : 1, grow = f.phase === 'rise' ? Math.min(1, f.k * 2) : 1;
  const cx = W / 2, feet = H / 2 + 14;
  const pop = (t) => t < 0.25 ? (t / 0.25) * 1.15 : t < 0.4 ? 1.15 - (t - 0.25) / 0.15 * 0.15 : 1;   // aparece con un pequeño rebote
  const ud = orbitUltDur(match.orbitBoostExtra || 0);                   // duran justo lo que dura la definitiva
  const life = ud, out = f.t > life - 0.3 ? Math.max(0, (life - f.t) / 0.3) : 1;
  const slideAt = ud - 0.9, spinDur = Math.max(0.6, slideAt - 0.3), turns = Math.max(1, Math.round(spinDur / 1.2));
  if (el === 'forest' && PINGUINO.ok && f.t < ud){                  // Pingüino emperador Nº2: 3 pingüinos salen del suelo, giran saltando y se lanzan en plancha
    const t = f.t;
    for (let i = 0; i < 3; i++){
      const base = i * Math.PI * 2 / 3 - Math.PI / 2;
      let x, y, rot = 0, sc = FX_PIXEL * 0.75, alpha = 1, dir = 1, z;
      if (t < slideAt){
        const em = Math.min(1, t / 0.3), spin = t < 0.3 ? 0 : (t - 0.3) * Math.PI * 2 * turns / spinDur;  // salen y dan vueltas completas saltando
        const a = base + spin, R = 52;
        z = Math.sin(a);
        x = cx + Math.cos(a) * R; y = feet - 10 + z * R * 0.5 - Math.abs(Math.sin(t * 10 + i * 2)) * 10 * em;
        sc *= em; dir = Math.cos(a + Math.PI / 2) > 0 ? 1 : -1;
        if (t < 0.3 && !front && i === 0) { ctx.save(); ctx.globalAlpha = 0.4 * (1 - em); ctx.fillStyle = '#e6d4ff'; ctx.beginPath(); ctx.ellipse(cx, feet, 70 * em, 30 * em, 0, 0, 6.28); ctx.fill(); ctx.restore(); }
      } else {
        const k = Math.min(1, (t - slideAt) / 0.9), a0 = base;                 // cada uno se tira de barriga hacia fuera: forman un triángulo
        const sx = cx + Math.cos(a0) * 52, sy = feet - 10 + Math.sin(a0) * 26;
        const ang = a0;
        x = sx + Math.cos(ang) * 320 * k; y = sy + Math.sin(ang) * 320 * k;
        z = 1; dir = Math.cos(ang) >= 0 ? 1 : -1; rot = ang + Math.PI / 2; alpha = 1 - k * k;   // cabeza por delante, en la dirección en que se desliza
        if (front && Math.random() < 0.5){ FIRE = DARK_PAL; emitEmber(match.x + (x - cx), match.y + (y - feet) + 6, { spread: 20 }); }
      }
      if ((z > 0) !== front) continue;
      const w = 16 * sc, h = 18 * sc, fr = t >= slideAt ? 0 : Math.floor(t * 10 + i) % 2;
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, feet + (y - feet + 10) + 8, w * 0.35, w * 0.12, 0, 0, 6.28); ctx.fill();   // sombra
      ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(dir, 1);
      ctx.drawImage(PINGUINO.img, fr * 16, 0, 16, 18, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
  if (front && f.t < life && el === 'celestial'){              // Hora celestial: reloj de arena que gira y deja caer la arena
    const t = f.t, flip = Math.min(1, t / 0.45), rot = (1 - Math.pow(1 - flip, 3)) * Math.PI;
    const rise = 1 - Math.pow(1 - Math.min(1, t / 0.35), 3);
    const sc = 0.85 * pop(t), px0 = cx, py0 = feet - 70 - 38 * rise + Math.sin(t * 5) * 1.5;
    if (Math.random() < 0.4){ isFireFx('celestial'); emitEmber(match.x + (Math.random() - 0.5) * 30, match.y + (py0 - feet) + 18, { spread: 25 }); }
    const sand = Math.min(1, Math.max(0, (t - 0.45) / (life - 0.75)));   // la arena acaba de caer justo antes de que termine      // 0 = arriba llena, 1 = abajo llena
    ctx.save(); ctx.globalAlpha = 0.9 * out; ctx.translate(px0, py0); ctx.rotate(rot); ctx.scale(sc, sc);
    if (rot >= Math.PI) ctx.rotate(-Math.PI);                              // ya girado: dibuja con la arena hacia abajo
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    // halo
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46); g.addColorStop(0, 'rgba(255,246,190,.6)'); g.addColorStop(0.6, 'rgba(220,224,235,.25)'); g.addColorStop(1, 'rgba(200,205,220,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 46, 0, 6.28); ctx.fill();
    // cristal (dos bulbos)
    const bulb = (dir, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-14, dir * 22); ctx.lineTo(14, dir * 22); ctx.lineTo(13, dir * 14); ctx.lineTo(3, dir * 3); ctx.lineTo(-3, dir * 3); ctx.lineTo(-13, dir * 14); ctx.closePath(); ctx.fill(); };
    bulb(-1, '#3a3f4e'); bulb(1, '#3a3f4e');
    ctx.save(); ctx.scale(0.82, 0.86); bulb(-1, 'rgba(210,226,255,.55)'); bulb(1, 'rgba(210,226,255,.55)'); ctx.restore();
    // arena: arriba se vacía, abajo se llena, y un hilo cae por el centro
    const top = rot < Math.PI ? 0 : 1 - sand, bot = rot < Math.PI ? 1 : sand;   // al darle la vuelta, la arena de abajo pasa arriba
    if (top > 0.02){ const hh = 15 * top; ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(-11 * top - 1, -3 - hh); ctx.lineTo(11 * top + 1, -3 - hh); ctx.lineTo(2, -3); ctx.lineTo(-2, -3); ctx.closePath(); ctx.fill(); }
    if (bot > 0.02){ const hh = 16 * bot; ctx.fillStyle = '#ffc21e'; ctx.beginPath(); ctx.moveTo(-12, 19); ctx.lineTo(12, 19); ctx.lineTo(4 + 6 * (1 - bot), 19 - hh); ctx.lineTo(-4 - 6 * (1 - bot), 19 - hh); ctx.closePath(); ctx.fill(); }
    if (rot >= Math.PI && sand < 1){ R(-1, -3, 2, 22 - 16 * bot, '#ffe680'); }
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-10, -19, 2, 8); ctx.fillRect(-10, 11, 2, 6);   // reflejos
    // marco dorado
    R(-18, -27, 36, 6, '#7a5208'); R(-17, -26, 34, 4, '#ffcf3a'); R(-17, -26, 34, 1.5, '#fff0a0');
    R(-18, 21, 36, 6, '#7a5208'); R(-17, 22, 34, 4, '#ffcf3a'); R(-17, 22, 34, 1.5, '#fff0a0');
    for (const x of [-16, 13]){ R(x, -22, 3, 44, '#7a5208'); R(x + 0.5, -22, 2, 44, '#e0a010'); }
    ctx.restore();
  }
}
const ESPIRITU = { img: new Image(), ok: false };
ESPIRITU.img.onload = () => { ESPIRITU.ok = true; }; ESPIRITU.img.src = 'assets/ult/espiritu.png';
function drawFenixTornado(front, ov){
  const f = ov ? ov.f : fenixState(); if (!f || f.phase === 'fall') return;
  const u = ov ? ov.u : match.ultAnim, J = ov ? ov.J : (u.J || JUMP_ULT[u.el] || JUMP_ULT.fire);
  const cx = ov && ov.cx != null ? ov.cx : W / 2, feet = ov && ov.feet != null ? ov.feet : H / 2 + 14, top = feet - f.h - (ov ? ov.tall : 70);
  const OX = ov && ov.wx != null ? ov.wx : match.x, OY = ov && ov.wy != null ? ov.wy : match.y;   // posición en el mundo (para partículas)
  const fade = f.phase === 'shoot' ? 1 - f.k : 1, grow = f.phase === 'rise' ? Math.min(1, f.k * 2.5) : 1;
  if (J.spiral){
    spiralPal(J.spiral);
    ctx.save(); ctx.globalCompositeOperation = FIRE.blend || 'source-over';
    const N = 26;
    for (let i = 0; i < N; i++){
      const t = i / (N - 1), ang = match.elapsed * 9 + t * Math.PI * 5;
      const z = Math.sin(ang); if ((z > 0) !== front) continue;
      const r = (14 + t * 30) * grow, y = feet - t * (feet - top), x = cx + Math.cos(ang) * r;
      const tang = Math.atan2(-(feet - top) / N * 6, -Math.sin(ang) * r * 0.6);
      ctx.globalAlpha = (0.55 + 0.4 * (1 - t)) * fade * (front && J.hand ? 0.55 : 1);
      flameTongue(x, y, tang + Math.PI, 26 + 18 * t, 7 + 6 * (1 - t), FIRE.deep);
      flameTongue(x, y, tang + Math.PI, 20 + 12 * t, 4 + 3 * (1 - t), FIRE.hot);
      flameTongue(x, y, tang + Math.PI, 12 + 6 * t, 2, FIRE.core);
      if (J.rocks && i % 4 === 0){                                    // tierra: rocas que giran con el tornado
        ctx.globalAlpha = fade; ctx.fillStyle = i % 8 ? '#7a4c22' : '#5e3612';
        const rs = 4 + (i % 3) * 2; ctx.fillRect(Math.round(x - rs / 2), Math.round(y - rs / 2), rs, rs);
        ctx.fillStyle = '#c9894a'; ctx.fillRect(Math.round(x - rs / 2), Math.round(y - rs / 2), rs / 2, rs / 2);
      }
    }
    if (front){
      const py = feet - f.h - 34, gr = ctx.createRadialGradient(cx, py, 4, cx, py, 52);
      gr.addColorStop(0, hexA(FIRE.core, 0.5 * fade)); gr.addColorStop(0.5, hexA(FIRE.hot, 0.32 * fade)); gr.addColorStop(1, hexA(FIRE.deep, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, py, 52, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (front && Math.random() < (J.rocks ? 0.9 : 0.8)){
      spiralPal(J.spiral);
      emitEmber(OX + (Math.random() - 0.5) * 60, OY - f.h * Math.random(), { spread: J.rocks ? 160 : 90, r: 2 + Math.random() * (J.rocks ? 4 : 3) });
    }
  }
  if (J.thunder){                                                     // Super relámpago: truenos que caen sobre él mientras sube
    if (!front){
      ctx.save(); ctx.globalAlpha = 0.35 * fade;
      const py = feet - f.h - 34, gr = ctx.createRadialGradient(cx, py, 4, cx, py, 60);
      gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.45, 'rgba(120,200,255,.6)'); gr.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, py, 60, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return;
    }
    if (match.elapsed >= u.nextBolt){
      u.nextBolt = match.elapsed + (ov ? 0.11 : 0.07);
      for (let n = 0; n < (ov ? 1 : 2); n++){
        if (ov){                                                     // en el suelo: truenos que caen alrededor del jugador
          const a = Math.random() * 6.28, rr = 40 + Math.random() * 110, ex = cx + Math.cos(a) * rr, ey = feet + Math.sin(a) * rr * 0.6;
          const pts = [[ex + (Math.random() - 0.5) * 120, 0]];
          for (let k = 1; k <= 9; k++) pts.push([ex + (Math.random() - 0.5) * (50 - k * 5) + (pts[0][0] - ex) * (1 - k / 9), ey * k / 9]);
          u.bolts.push({ pts, life: 0.18 });
          match.effects.push({ x: OX + (ex - cx), y: OY + (ey - feet), fixed: true, maxR: 40, life: 0.25, dur: 0.25, color: '#9fdcff' });
          continue;
        }
        const pts = [[cx + (Math.random() - 0.5) * 200, 0]], ty = feet - f.h - 30;
        for (let k = 1; k <= 9; k++) pts.push([cx + (Math.random() - 0.5) * (64 - k * 6) + (pts[0][0] - cx) * (1 - k / 9), ty * k / 9]);
        u.bolts.push({ pts, life: 0.16 });
      }
      if (Math.random() < 0.4) SFX.play && SFX.play('step');
    }
    ctx.save(); ctx.lineJoin = 'miter';
    for (const bo of u.bolts){
      for (const [w, c] of [[16, 'rgba(80,150,255,.35)'], [8, '#9fdcff'], [3, '#ffffff']]){
        ctx.globalAlpha = Math.min(1, bo.life / 0.16) * fade; ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); bo.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      }
      bo.life -= 1 / 60;
    }
    u.bolts = u.bolts.filter(bo => bo.life > 0);
    // chispas eléctricas pegadas al cuerpo
    ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 6; k++){ const a = Math.random() * 6.28, r = 16 + Math.random() * 22; ctx.fillRect(cx + Math.cos(a) * r, feet - f.h - 34 + Math.sin(a) * r * 1.3, 2, 6); }
    ctx.restore();
  }
  if (J.hand){                                                        // Mano mágica: rayos de luz y un león celestial dorado rugiendo a su espalda
    const P = FX_PAL.celestial, py = feet - f.h - 34, show = f.phase === 'rise' ? Math.min(1, f.k * 1.8) : 1;
    ctx.save();
    if (!front){
      // rayos de luz que salen de detrás del jugador
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 12; k++){
        const a = match.elapsed * 0.8 + k * Math.PI / 6, len = (120 + 30 * Math.sin(match.elapsed * 6 + k)) * show;
        ctx.globalAlpha = 0.28 * fade; ctx.fillStyle = k % 2 ? P.hot : P.core;
        ctx.beginPath(); ctx.moveTo(cx, py); ctx.lineTo(cx + Math.cos(a - 0.07) * len, py + Math.sin(a - 0.07) * len); ctx.lineTo(cx + Math.cos(a + 0.07) * len, py + Math.sin(a + 0.07) * len); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // espíritu guardián (sprite pixel): rey dorado musculoso con corona que saca bíceps a su espalda
      if (ESPIRITU.ok){
        const FW = 76, FH = 82, K = FX_PIXEL * 0.55, fr = Math.sin(match.elapsed * 6) > 0 ? 1 : 0;   // más pequeño que el sprite original
        const dw = FW * K, dh = FH * K, waist = py + 14, x = Math.round(cx - dw / 2), y = Math.round(waist - 75 * K + (1 - show) * 20);
        ctx.imageSmoothingEnabled = true;                          // la capa pixel ya lo pixela
        ctx.globalAlpha = 0.2 * fade * show;                       // espíritu muy translúcido
        ctx.drawImage(ESPIRITU.img, fr * FW, 0, FW, FH, x, y, dw, dh);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.42 * fade * show;   // brillo para aclararlo
        ctx.drawImage(ESPIRITU.img, fr * FW, 0, FW, FH, x, y, dw, dh);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // aura dorada pegada al cuerpo y destellos
      const gr = ctx.createRadialGradient(cx, py, 4, cx, py, 54);
      gr.addColorStop(0, hexA(P.core, 0.55 * fade)); gr.addColorStop(0.5, hexA(P.hot, 0.3 * fade)); gr.addColorStop(1, hexA(P.deep, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, py, 54, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 5; k++){ const a = match.elapsed * 3 + k * 1.26, r = 30 + 8 * Math.sin(match.elapsed * 7 + k); const sx = cx + Math.cos(a) * r, sy = py + Math.sin(a) * r * 1.2;
        ctx.globalAlpha = 0.9 * fade; ctx.fillRect(sx - 4, sy - 1, 8, 2); ctx.fillRect(sx - 1, sy - 4, 2, 8); }
    }
    ctx.restore();
    if (front && Math.random() < 0.6){ isFireFx('celestial'); emitEmber(OX + (Math.random() - 0.5) * 60, OY - f.h * Math.random(), { spread: 80 }); }
  }
  if (J.dragon){                                                      // Remate combinado: un dragón de energía sube enroscado a su alrededor
    const P = FX_PAL.dragon, N = 22, headT = Math.min(1, (f.phase === 'rise' ? f.k : 1) * 1.15);
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    let head = null;
    for (let i = N - 1; i >= 0; i--){
      const t = (i / (N - 1)) * headT, ang = match.elapsed * 5 + t * Math.PI * 4;
      const z = Math.sin(ang); const r = 20 + t * 26, x = cx + Math.cos(ang) * r, y = feet - 6 - t * (feet - top + 10);
      if (i === N - 1) head = { x, y, ang, z };
      if ((z > 0) !== front) continue;
      const rad = (5 + 7 * Math.sin(Math.PI * (i / (N - 1))) ) * grow;
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = P.deep; ctx.beginPath(); ctx.arc(x, y, rad + 3, 0, 6.28); ctx.fill();
      ctx.fillStyle = i % 2 ? P.hot : P.mid; ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.28); ctx.fill();
      ctx.fillStyle = P.core; ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.35, 0, 6.28); ctx.fill();
      if (i % 3 === 0){ ctx.fillStyle = P.accent; ctx.beginPath(); ctx.moveTo(x, y - rad - 6); ctx.lineTo(x - 4, y - rad + 1); ctx.lineTo(x + 4, y - rad + 1); ctx.fill(); }   // púas
    }
    if (head && ((head.z > 0) === front)){                          // cabeza: hocico, cuernos y ojos
      const { x, y } = head, dir = -Math.sin(head.ang) >= 0 ? 1 : -1;
      ctx.globalAlpha = fade;
      ctx.fillStyle = P.deep; ctx.beginPath(); ctx.ellipse(x + dir * 6, y, 17, 12, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = P.hot; ctx.beginPath(); ctx.ellipse(x + dir * 6, y, 14, 9, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = P.mid; ctx.beginPath(); ctx.moveTo(x + dir * 14, y - 3); ctx.lineTo(x + dir * 30, y + 1); ctx.lineTo(x + dir * 14, y + 7); ctx.fill();   // hocico
      ctx.fillStyle = P.accent; ctx.beginPath(); ctx.moveTo(x - dir * 2, y - 8); ctx.lineTo(x - dir * 14, y - 22); ctx.lineTo(x + dir * 4, y - 10); ctx.fill();   // cuerno
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + dir * 9 - 2, y - 5, 4, 3); ctx.fillStyle = '#ff3a6a'; ctx.fillRect(x + dir * 10 - 1, y - 5, 2, 2);
    }
    if (front){
      const py = feet - f.h - 34, gr = ctx.createRadialGradient(cx, py, 4, cx, py, 56);
      gr.addColorStop(0, hexA(P.core, 0.45 * fade)); gr.addColorStop(1, hexA(P.deep, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, py, 56, 0, 6.28); ctx.fill();
    }
    ctx.restore();
    if (front && Math.random() < 0.6){ isFireFx('dragon'); emitEmber(OX + (Math.random() - 0.5) * 50, OY - f.h * Math.random(), { spread: 80 }); }
  }
}
const ULT_RECHARGE_DELAY = 5;   // segundos tras usar la R antes de que empiece a cargarse otra vez
function triggerUltimate(){
  if (!match || match.paused || match.over) return;
  const t = activeTech();
  if (!t || !canUlt(t) || t.charge < chargeNeeded()) return;
  if (match.ultAnim) return;                          // aún está saltando
  t.charge = 0;
  match.ultCdUntil = match.elapsed + ULT_RECHARGE_DELAY;   // durante 5 s no se vuelve a cargar
  match.ultInvUntil = match.elapsed + 1.5; match.ultStartAt = match.elapsed;                  // escudo invisible: al menos 1,5 s (y mientras dure la R)
  SFX.play('ult');                                    // ¡definitiva!
  const U = ultPart(t);
  const extra = U.lvl - EVOLVE_AT;           // 0..2 niveles por encima de la evolución
  const color = getElement(match.element).color;
  showBanner(`¡${techNameOf(t.kind, t.element, isEvolved(t))}!`, null, color, true, true);   // abajo, encima del HUD de supertécnicas   // solo la primera supertécnica (aunque esté fusionada)
  match.effects.push({ x:match.x, y:match.y, fixed:true, maxR:140, life:0.4, dur:0.4, color });

  if (U.kind === 'pierce'){
    // Fénix / Sabiduría divina / Tornado oscuro / Mega terremoto:
    // bocanada de muchos balones en cono hacia los rivales
    const br = { until: match.elapsed + 1.6 + 0.2 * extra, acc: 0, rate: 40, dmg: match.dmg * (1.5 + 0.4 * extra) };
    const pel = techElement('pierce');
    if (JUMP_ULT[pel]){
      // salta girando con el aura de su afinidad y, arriba del todo, dispara (Fénix, Super relámpago, Tornado oscuro…)
      match.ultAnim = { kind:'fenix', el: pel, start: match.elapsed, rise: FENIX.rise, breath: br, fired: false, bolts: [], nextBolt: 0 };
    } else match.breath = br;
  } else if (U.kind === 'orbit'){
    // Potenciación / Entrada tormenta / Pingüino emperador Nº2 / Muralla infinita
    match.orbitBoostUntil = match.elapsed + orbitUltDur(extra);
    match.orbitBoostEl = techElement('orbit');          // afinidad de ESTA definitiva (no la de la técnica que esté seleccionada después)
    match.orbitBoostExtra = extra;
  } else if (U.kind === 'bounce'){
    // Pájaro de fuego / Ruptura relámpago / Remate múltiple / Disparo con rebotes:
    // balón gigante que rebota entre rivales y deja el suelo ardiendo
    const target = nearestEnemy();
    const ang = target ? Math.atan2(target.y-match.y, target.x-match.x) : Math.atan2(match.aim.y, match.aim.x);
    match.projectiles.push({
      x:match.x, y:match.y, vx:Math.cos(ang)*10, vy:Math.sin(ang)*10,
      r:16, dmg: match.dmg * (6 + 1.5 * extra), crit:false, hit:[],
      bounces: 10 + 3 * extra, bounceRange: 380, life:2, ultBounce:true, techKind:null, ultDmg:true, ultKind:'bounce', element: techElement('bounce'), fx: techElement('bounce'),
      patch: { r: 60 + 5 * extra, dur: 4, dmg: match.dmg * (1.2 + 0.3 * extra) },
    });
  } else if (U.kind === 'melee'){
    // Puño vengativo / Muralla tsunami / Vendimia / Trama: torbellino de golpes
    match.flurry = { start: match.elapsed, until: match.elapsed + 2 + 0.3 * extra, acc: 0, ang: Math.atan2(match.aim.y, match.aim.x),
                     range: 150 + 15 * extra, dmg: match.dmg * (2.2 + 0.5 * extra) };
  } else if (U.kind === 'rain'){
    // Triángulo Z / Flecha divina / Triángulo letal / Pisotón de sumo:
    // los impactos caen siguiendo un triángulo y rematan en el centro
    const target = nearestEnemy();
    const cx = target ? target.x : match.x + match.aim.x * 200;
    const cy = target ? target.y : match.y + match.aim.y * 200;
    const R = 210 + 20 * extra;
    const rot = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const verts = [0, 1, 2].map(k => [cx + Math.cos(rot + k * Math.PI * 2 / 3) * R,
                                      cy + Math.sin(rot + k * Math.PI * 2 / 3) * R]);
    const perSide = 4 + extra, rel = techElement('rain'), rpal = rel === 'forest' ? PURPLE_PAL : null;   // Triángulo letal: morado
    let delay = 0.35;
    for (let k = 0; k < 3; k++){
      const [ax, ay] = verts[k], [bx, by] = verts[(k + 1) % 3];
      for (let j = 0; j < perSide; j++){
        const f = j / perSide;
        dropBomb(ax + (bx - ax) * f, ay + (by - ay) * f,
                 { dur: delay, r: 80, dmg: match.dmg * (3.5 + 1 * extra), ult:true, fx: rel, pal: rpal });
        delay += 0.07;
      }
    }
    dropBomb(cx, cy, { dur: delay + 0.3, r: 150 + 10 * extra, dmg: match.dmg * (9 + 2.5 * extra), ult:true, fx: rel, pal: rpal, stomp: rel === 'mountain' });
    match.triangles.push({ pts: verts, life: delay + 0.8, dur: delay + 0.8, color, fx: rel, pal: rpal, c: [cx, cy] });
    match.rainUlt = { el: rel, start: match.elapsed, dur: delay + 0.9, hit: delay + 0.3, cx, cy, bolts: [], nextBolt: 0 };
    // salta como en las definitivas de tornado, con el aura de su afinidad (sin el espíritu de la Mano mágica)
    match.ultAnim = { kind:'fenix', el: rel, start: match.elapsed, rise: FENIX.rise, breath: null, fired: false, bolts: [], nextBolt: 0,
                      J: Object.assign({}, JUMP_ULT[rel] || JUMP_ULT.fire, { hand: false }) };
  }
  renderTechBar();
}

function nearestEnemy(){
  let best = null, bestD = Infinity;
  for (const e of match.enemies){
    if (e.dead || bossInvisible(e)) continue;
    const d = Math.hypot(e.x-match.x, e.y-match.y);
    if (d < bestD){ bestD = d; best = e; }
  }
  return best;
}

/* ---- subida de nivel ----
   Mejoras básicas. max: Infinity = se pueden subir sin límite (estilo roguelike);
   las que romperían el juego (velocidad, regate, imán) tienen tope. */
/* ---- subida de nivel: cartas de mejora como las de PokéSurvivor (levelup.js), pero SIN TOPE:
   las que romperían el juego (velocidad, defensa, regate) rinden cada vez un poco menos ---- */
const DIM = (m, id, k = 0.9) => Math.pow(k, (m.upgrades && m.upgrades[id]) || 0);   // cuánto rinde la siguiente (baja poco a poco)
const UPGRADES = [
  { id:'power',     emoji:'🔥', name:'Potencia',  max:Infinity, desc:'+10% de daño con todo',
    apply:m => { m.dmg *= 1.10; } },
  { id:'health',    emoji:'❤️', name:'Vigor',     max:Infinity, desc:'+20 de vida máxima (y la recupera)',
    apply:m => { m.maxHp += 20; m.hp = Math.min(m.maxHp, m.hp + 20); } },
  { id:'speed',     emoji:'👟', name:'Carrera',   max:Infinity, desc:'+7% de velocidad de movimiento (cada vez algo menos)',
    apply:m => { m.speed *= 1 + 0.07 * DIM(m, 'speed'); } },
  { id:'atkspeed',  emoji:'⏱️', name:'Reflejos',  max:Infinity, desc:'+9% de velocidad de disparo y de giro de los balones',
    apply:m => { m.atkSpeed *= 1.09; } },
  { id:'defense',   emoji:'🛡️', name:'Coraza',    max:Infinity, desc:'+6% de defensa (cada vez algo menos; hasta 75%)',
    apply:m => { m.def = Math.min(75, m.def + 6 * (1 - Math.min(75, m.def) / 75)); } },
  { id:'regen',     emoji:'🌱', name:'Síntesis',  max:Infinity, desc:'+0,9 de vida por segundo',
    apply:m => { m.regen = (m.regen || 0) + 0.9; } },
  { id:'magnet',    emoji:'🧲', name:'Imán',      max:Infinity, desc:'+30% de radio de recogida',
    apply:m => { m.pickup *= 1.30; } },
  { id:'xp',        emoji:'📘', name:'Aprendizaje', max:Infinity, desc:'+12% de experiencia ganada',
    apply:m => { m.xpMult += 0.12; } },
  { id:'dodge',     emoji:'💨', name:'Regate',    max:Infinity, desc:'+6% de evadir ataques (cada vez algo menos)',
    apply:m => { m.dodge += 6 * DIM(m, 'dodge', 0.85); } },
  { id:'heal',      emoji:'🍙', name:'Bola de arroz', max:Infinity, desc:'Recupera el 45% de tu vida ahora mismo',
    apply:m => { m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.45); } },
];
const LEVELUP_STATS_SHOWN = 5;   // como en PokéSurvivor: en cada subida entran 5 mejoras al azar en el sorteo
function advantageText(){
  const beats = getElement(match.element).beats;
  return beats && beats.length ? ` (x${ELEMENT_ADV} contra ${beats.map(b => getElement(b).name).join(' y ')})` : '';
}

/* Opciones de supertécnica para el menú de subida de nivel */
function buildTechOptions(){
  const opts = [];
  // subir de nivel las que ya tienes
  match.techs.forEach((t, i) => {
    if (t.fused){                                   // fusionada por Hillman: cada parte sube por separado
      const f = t.fused;
      if (t.lvl < TECH_MAX){
        const K = TECH_KINDS[t.kind], lvl = t.lvl + 1, evolving = !K.buff && lvl === EVOLVE_AT;
        opts.push({
          tech:true, evolve:evolving, slot:SLOT_KEYS[i], nextLvl:lvl,
          emoji: techLogo(t.kind, t.element || match.element), el: isBuffKind(t.kind) ? 'book' : (t.element || match.element),
          name: evolving ? `${techNameOf(t.kind, t.element, false)} ➜ ${techNameOf(t.kind, t.element, true)}` : techNameOf(t.kind, t.element, isEvolved(t)),
          desc: (evolving ? `¡Evoluciona! ${K.ultDesc}${ultDualText(t.element || match.element, t.kind) ? '. ' + ultDualText(t.element || match.element, t.kind) : ''}` : (lvl > EVOLVE_AT && !K.buff) ? `${K.desc(lvl)}; cada golpe carga más la R` : K.desc(lvl)) + ` (fusión ${SLOT_KEYS[i]})`,
          apply: () => { t.lvl = lvl; if (evolving){ t.charge = 0; showBanner(`¡${techName(t)}!`, 'Evolución · golpea con ella para cargar la R', getElement(match.element).color, true); } },
        });
      }
      if (f.lvl < TECH_MAX){
        const K = TECH_KINDS[f.kind], lvl = f.lvl + 1, evolving = !K.buff && lvl === EVOLVE_AT;
        opts.push({
          tech:true, evolve:evolving, slot:SLOT_KEYS[i], nextLvl:lvl,
          emoji: techLogo(f.kind, f.element || match.element), el: isBuffKind(f.kind) ? 'book' : (f.element || match.element),
          name: evolving ? `${techNameOf(f.kind, f.element, false)} ➜ ${techNameOf(f.kind, f.element, true)}` : techNameOf(f.kind, f.element, f.lvl >= EVOLVE_AT),
          desc: (evolving ? 'Evoluciona: más fuerte (la R sigue siendo la de la otra parte)' : K.desc(lvl)) + ` (fusión ${SLOT_KEYS[i]})`,
          apply: () => { f.lvl = lvl; },
        });
      }
      for (const x of (t.extra || [])){                 // mezcla de 4: las otras dos partes también suben
        if (x.lvl >= TECH_MAX) continue;
        const K = TECH_KINDS[x.kind], lvl = x.lvl + 1;
        opts.push({
          tech:true, slot:SLOT_KEYS[i], nextLvl:lvl,
          emoji: techLogo(x.kind, x.element || match.element), el: isBuffKind(x.kind) ? 'book' : (x.element || match.element),
          name: techNameOf(x.kind, x.element, x.lvl >= EVOLVE_AT),
          desc: K.desc(lvl) + ` (mezcla ${SLOT_KEYS[i]})`,
          apply: () => { x.lvl = lvl; },
        });
      }
      return;
    }
    if (t.lvl >= TECH_MAX) return;
    const lvl = t.lvl + 1;
    const names = t.element ? [techNameOf(t.kind, t.element, false), techNameOf(t.kind, t.element, true)] : techNames(t.kind);
    const K = TECH_KINDS[t.kind];
    const evolving = !K.buff && lvl === EVOLVE_AT;
    opts.push({
      tech:true, evolve:evolving, slot:SLOT_KEYS[i], nextLvl:lvl,
      emoji: techLogo(t.kind, t.element || match.element), el: isBuffKind(t.kind) ? 'book' : (t.element || match.element),
      name: evolving ? `${names[0]} ➜ ${names[1]}` : techName(t),
      desc: evolving ? `¡Evoluciona! ${K.ultDesc}${ultDualText(t.element || match.element, t.kind) ? '. ' + ultDualText(t.element || match.element, t.kind) : ''}`
          : (lvl > EVOLVE_AT && !K.buff) ? `${K.desc(lvl)}; cada golpe carga más la R`
          : K.desc(lvl),
      apply: () => {
        t.lvl = lvl;
        if (evolving){ t.charge = 0; showBanner(`¡${names[1]}!`, 'Evolución · golpea con ella para cargar la R', getElement(match.element).color, true); }
      },
    });
  });
  // conseguir una nueva (máximo 2): la 1ª a partir de cierto nivel; la 2ª, solo cuando ya
  // llevas un rato de partido y has subido bastante la 1ª
  const W = levelupW();
  const canFirst = !match.mixed && match.techs.length === 0 && match.level >= W.firstTechFromLevel;
  const canSecond = !match.mixed && match.techs.length === 1 && match.level >= W.secondTechFromLevel && match.techs[0].lvl >= W.secondTechNeedsLvl;
  if (canFirst || canSecond){
    const owned = match.techs.flatMap(t => techParts(t).map(q => q.kind));
    const slot = SLOT_KEYS[match.techs.length];
    TECH_ORDER.filter(k => !owned.includes(k) && !(match.veto || []).includes(k)).forEach(k => {
      const name = techNames(k)[0];
      opts.push({
        tech:true, isNew:true, slot, nextLvl:1,
        emoji: techLogo(k), el: isBuffKind(k) ? 'book' : match.element, name,
        desc: TECH_KINDS[k].desc(1) + advantageText(),
        apply: () => {
          match.techs.push({ kind:k, lvl:1, charge:0 });
          if (match.techs.length === 1) match.activeTech = 0;
          showBanner(name, `Supertécnica en la tecla ${slot}`, getElement(match.element).color, true);
        },
      });
    });
  }
  return opts;
}

/* ---- qué sale al subir de nivel (pesos: una mejora básica pesa 1) ----
   La idea: al principio casi todo son mejoras básicas; como mucho consigues
   UNA supertécnica y la vas subiendo poco a poco. La segunda llega pronto
   (y si tarda en salir, cada subida es más probable que aparezca).
   Con las dos al máximo solo salen mejoras básicas (sin fin) y, rarísima vez,
   un talento. En cada subida sale como mucho UNA opción de supertécnica. */
const LEVELUP_WEIGHTS = {
  basic: 1,
  techUp: 0.7,                 // subir de nivel una supertécnica que ya tienes
  firstTech: 0.5,              // conseguir la primera supertécnica (entre todas)…
  firstTechFromLevel: 3,       // …desde el nivel 3
  secondTech: 0.9,             // conseguir la segunda (entre todas)…
  secondTechFromLevel: 4,      // …desde el nivel 4
  secondTechNeedsLvl: 1,       // …teniendo ya la primera
  newTechPity: 0.6,            // cada subida sin que te salga una nueva, su peso sube un 60% más
  talent: 0.7,                 // subir un talento que ya tienes (como subir una supertécnica)
  maxTechPerMenu: 1,
};

/* sin la mejora "Técnica inicial" salen bastantes más supertécnicas al subir de nivel */
const LEVELUP_WEIGHTS_NOSTART = { ...LEVELUP_WEIGHTS,
  techUp: 1, firstTech: 1.6, firstTechFromLevel: 2, secondTech: 1.4, secondTechFromLevel: 3, maxTechPerMenu: 1 };   // más probable, no garantizada
function levelupW(){ return match.hadStartTech ? LEVELUP_WEIGHTS : LEVELUP_WEIGHTS_NOSTART; }

/* Elige n opciones sin repetir según los pesos de LEVELUP_WEIGHTS */
function pickOptions(base, techs, n, talents = []){
  const W = levelupW();
  const nNew = techs.filter(o => o.isNew).length || 1;          // el peso de "nueva" se reparte entre todas
  const pity = 1 + W.newTechPity * (match.newTechMisses || 0);  // si tarda en salir, cada vez es más probable
  const techW = o => !o.isNew ? W.techUp : (match.techs.length === 0 ? W.firstTech : W.secondTech) * pity / nNew;
  // PokéSurvivor: una mejora pesa la mitad que subir un movimiento mientras te quedan huecos, y 7/8 con los huecos llenos
  const basicW = (match.techs.length < 2 ? 0.5 : 0.875) * W.techUp;
  const evo = techs.find(o => o.evolve);                        // la evolución lista sale siempre (carta dorada)
  const pool = [...base.map(o => ({ o, w:basicW })), ...techs.filter(o => o !== evo).map(o => ({ o, w:techW(o) })),
                ...talents.map(o => ({ o, w:W.talent }))];
  const out = [];
  let techCount = 0;
  if (evo){ out.push(evo); techCount++; if (techCount >= W.maxTechPerMenu) for (let k = pool.length - 1; k >= 0; k--) if (pool[k].o.tech) pool.splice(k, 1); }
  while (out.length < n && pool.length){
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total, idx = 0;
    for (; idx < pool.length - 1; idx++){
      if (r < pool[idx].w) break;
      r -= pool[idx].w;
    }
    const picked = pool.splice(idx, 1)[0].o;
    out.push(picked);
    if (picked.tech && ++techCount >= W.maxTechPerMenu){        // no más supertécnicas en este menú
      for (let k = pool.length - 1; k >= 0; k--) if (pool[k].o.tech) pool.splice(k, 1);
    }
  }
  // contador de "mala suerte": subidas seguidas en las que podía salir una nueva y no salió
  if (techs.some(o => o.isNew)) match.newTechMisses = out.some(o => o.isNew) ? 0 : (match.newTechMisses || 0) + 1;
  return out;
}

/* ======================================================================
   CUADERNO DE TALENTOS: recogida y elección
   ====================================================================== */
function updateNotebook(dt){
  const nb = match.notebook;
  if (!nb || match.levelupChoices) return;
  nb.t += dt;
  if (nb.t > 0.8){                                 // se suma solo, sin tener que ir a cogerlo
    match.notebook = null;
    openNotebook();
  }
}

/* sube un nivel un talento (y aplica lo que es permanente, como la vida) */
function gainTalentLevel(key){
  let t = match.talents.find(tt => tt.key === key);
  if (!t){ t = { key, lvl:0 }; match.talents.push(t); }
  if (t.lvl >= TALENT_MAX) return;
  t.lvl++;
  if (key === 'defensa' || key === 'vamosTodos'){
    const bonus = match.base.maxHp * TALENT_VAL[key] / 100;
    match.maxHp += bonus;
    match.hp = Math.min(match.maxHp, match.hp + bonus);
  }
}

function closeNotebook(){
  match.levelupChoices = null;
  document.getElementById('talent-overlay').classList.add('hidden');
  match.paused = false;
  renderInventory();
  renderTechBar();
  if (match.inArena) match.arenaExitAt = match.elapsed + 1.2;
}

function openNotebook(){
  const ups = match.talents.filter(t => t.lvl < TALENT_MAX);
  if (match.talents.length >= TALENT_SLOTS && !ups.length){       // los dos al máximo: nada que elegir
    if (match.inArena) match.arenaExitAt = match.elapsed + 1.6;
    return;
  }
  match.paused = true;
  match.keys = {};
  const box = document.getElementById('talent-options');
  const sub = document.getElementById('talent-sub');
  const reject = document.getElementById('btn-talent-reject');
  box.innerHTML = '';
  match.levelupChoices = [];

  if (match.talents.length >= TALENT_SLOTS){
    // ya tienes los 2: eliges cuál de los dos mejora
    sub.textContent = 'Elige qué talento quieres mejorar';
    reject.classList.add('hidden');
    ups.forEach((t, i) => {
      const T = TALENTS[t.key], nl = t.lvl + 1;
      const btn = document.createElement('button');
      btn.className = 'upgrade-option upgrade-talent';
      btn.innerHTML = `<b><kbd class="upgrade-key">${i + 1}</kbd> ${talentLogo(28)}${TALENT_PX[t.key] ? pxImg(TALENT_PX[t.key], 28) : T.emoji} ${T.name} · Nv. ${t.lvl} → ${nl}</b><span>${talentDesc(t.key, nl)}</span>`;
      const choose = () => { if (!match.levelupChoices) return; gainTalentLevel(t.key); closeNotebook(); };
      btn.onclick = choose;
      match.levelupChoices.push(choose);
      box.appendChild(btn);
    });
  } else {
    reject.classList.remove('hidden');
    // eliges 1 de 3 talentos que aún no tienes (con "Cambios" se sacan 3 nuevos), o lo rechazas
    const owned = match.talents.map(t => t.key);
    const pool = Object.keys(TALENTS).filter(k => !owned.includes(k)).sort(() => Math.random() - 0.5).slice(0, TALENT_CHOICES);
    sub.textContent = `Elige un talento (${match.talents.length}/${TALENT_SLOTS})`;
    pool.forEach((k, i) => {
      const T = TALENTS[k];
      const btn = document.createElement('button');
      btn.className = 'upgrade-option upgrade-talent';
      btn.innerHTML = `<b><kbd class="upgrade-key">${i + 1}</kbd> ${talentLogo(28)}${TALENT_PX[k] ? pxImg(TALENT_PX[k], 28) : T.emoji} ${T.name} · Nv. 1</b><span>${talentDesc(k, 1)}</span>`;
      const choose = () => {
        if (!match.levelupChoices) return;
        gainTalentLevel(k);
        closeNotebook();
      };
      btn.onclick = choose;
      match.levelupChoices.push(choose);
      box.appendChild(btn);
    });
    if (match.rerolls > 0){
      const rb = document.createElement('button');
      rb.className = 'reroll-btn';
      rb.innerHTML = `${pxImg('cambio', 26)}<span class="rr-txt">Cambiar cartas</span><span class="rr-left">quedan ${match.rerolls}</span><span class="rr-key">R</span>`;
      rb.title = 'Atajo: tecla R (o C)';
      rb.onclick = rerollTalents;
      box.appendChild(rb);
    }
    reject.onclick = () => { SFX.closeAs = 'reject'; closeNotebook(); };
  }
  document.getElementById('talent-overlay').classList.remove('hidden');
}

/* "Cambios" en la elección de talento: saca 5 nuevos (gasta de la misma reserva que al subir de nivel) */
function rerollTalents(){
  if (!(match.rerolls > 0) || match.talents.length >= TALENT_SLOTS) return;
  match.rerolls--;
  SFX.play('reroll');
  openNotebook();
}
/* talentos que ya tienes, como opción de mejora al subir de nivel */
function buildTalentOptions(){
  return match.talents.filter(t => t.lvl < TALENT_MAX).map(t => {
    const T = TALENTS[t.key];
    return {
      talent:true, id:'talent-' + t.key, emoji:T.emoji, name:T.name, nextLvl:t.lvl + 1,
      desc: talentDesc(t.key, t.lvl + 1) + ' (talento)',
      apply: () => gainTalentLevel(t.key),
    };
  });
}

/* free = subida extra del talento Suerte (no gasta experiencia ni puede repetirse) */
function levelUp(free = false){
  if (!free) match.xp -= match.xpNext;
  const lucky = !free && Math.random() < Math.min(0.6, tval('suerte'));
  match.level++;
  match.xpNext = xpForLevel(match.xpNext, match.level);
  match.paused = true;
  fillLevelup(free, lucky);
  document.getElementById('levelup-overlay').classList.remove('hidden');
}

function rerollLevelup(){
  if (!match.levelupChoices || !(match.rerolls > 0) || !match.levelupCtx) return;
  if (!document.getElementById('talent-overlay').classList.contains('hidden')) return;
  match.rerolls--;
  SFX.play('reroll');
  fillLevelup(match.levelupCtx.free, match.levelupCtx.lucky);
}

/* rellena las cartas de la subida de nivel (también al usar un cambio de cartas) */
function fillLevelup(free, lucky){
  const base = UPGRADES
    .filter(u => (match.upgrades[u.id] || 0) < u.max && !(match.veto || []).includes(u.id))
    .sort(() => Math.random() - 0.5).slice(0, LEVELUP_STATS_SHOWN)
    .map(u => ({ ...u, nextLvl: (match.upgrades[u.id] || 0) + 1 }));
  let options = pickOptions(base, buildTechOptions(), 3, buildTalentOptions());
  if (!options.length){
    // todo al máximo: al menos te curas
    options = [{ id:'heal', emoji:'🍙', name:'Bola de arroz', nextLvl:1, desc:'Recupera 40 de vida',
                 apply:m => { m.hp = Math.min(m.maxHp, m.hp + 40); } }];
  }
  const box = document.getElementById('levelup-options');
  box.innerHTML = '';
  document.querySelector('#levelup-overlay h3').textContent = free ? '¡Suerte! Otra subida de nivel' : '¡Subida de nivel!';
  match.levelupChoices = [];
  match.levelupOpts = options;
  options.forEach((u, i) => {
    const btn = document.createElement('button');
    btn.className = 'upgrade-option' + (u.tech ? ' upgrade-special' : '') + (u.evolve ? ' upgrade-evolve' : '') + (u.talent ? ' upgrade-talent' : '');
    if (u.tech) btn.dataset.el = u.el || 'neutral';                 // color de la carta según la afinidad
    const slotTag = u.slot ? ` <kbd class="slot-key">${u.slot}</kbd>` : '';
    const newTag = u.isNew ? ' <em class="tag-new">Nueva</em>' : '';
    btn.innerHTML = `<b><kbd class="upgrade-key">${i + 1}</kbd> ${optionIcon(u)} ${u.name} · Nv. ${u.nextLvl}${slotTag}${newTag}</b><span>${u.desc}</span>`;
    const choose = () => {
      if (!match.levelupChoices) return;       // ya se eligió una
      match.levelupChoices = null;
      u.apply(match);
      if (!u.tech && !u.talent && u.id !== 'heal') match.upgrades[u.id] = u.nextLvl;
      renderInventory();
      renderTechBar();
      document.getElementById('levelup-overlay').classList.add('hidden');
      match.paused = false;
      if (lucky){                                // Suerte: subes otro nivel gratis
        levelUp(true);
      } else if (match.xp >= match.xpNext) levelUp();   // varias subidas seguidas
    };
    btn.onclick = choose;
    match.levelupChoices.push(choose);
    box.appendChild(btn);
  });
  // cambio de cartas (mejora permanente)
  if (match.rerolls > 0){
    const rb = document.createElement('button');
    rb.className = 'reroll-btn';
    rb.innerHTML = `${pxImg('cambio', 26)}<span class="rr-txt">Cambiar cartas</span><span class="rr-left">quedan ${match.rerolls}</span><span class="rr-key">R</span>`;
    rb.title = 'Atajo: tecla R (o C)';
    rb.onclick = rerollLevelup;
    box.appendChild(rb);
  }
  match.levelupCtx = { free, lucky };
}

/* ======================================================================
   BARRA DE SUPERTÉCNICAS (Q / E / R)
   ====================================================================== */
function renderTechBar(){
  if (!match) return;
  document.getElementById('tech-bar').classList.remove('hidden');   // siempre visible durante el partido
  // talentos a la derecha de la R
  const slots = [];
  for (let i = 0; i < TALENT_SLOTS; i++){
    const t = match.talents[i];
    if (!t){
      slots.push(`<div class="talent-slot empty" title="Eliges talento al vencer al 1.º y al 3.º boss"><span class="talent-ico">${talentLogo(26)}</span><span class="talent-info"><span class="talent-name">Talento libre</span><span class="talent-lvl">${slots.length ? 'Vence al 3.º boss' : 'Vence al 1.º boss'}</span></span></div>`);
      continue;
    }
    const T = TALENTS[t.key], max = t.lvl >= TALENT_MAX;
    slots.push(`<div class="talent-slot${max ? ' max' : ''}" title="${talentDesc(t.key, t.lvl)}"><span class="talent-ico">${TALENT_PX[t.key] ? pxImg(TALENT_PX[t.key], 26) : T.emoji}</span><span class="talent-info"><span class="talent-name">${T.name}</span><span class="talent-lvl">${max ? 'Nivel máximo' : 'Nv. ' + t.lvl}</span></span></div>`);
  }
  document.getElementById('talent-slots').innerHTML = slots.join('');
  SLOT_KEYS.forEach((key, i) => {
    const btn = document.getElementById(`btn-tech-${i}`);
    const t = match.techs[i];
    btn.classList.toggle('empty', !t);
    btn.classList.toggle('active', i === match.activeTech && (!!t || (match.techs.length > 0 && !match.mixed)));
    btn.classList.toggle('evolved', !!t && canUlt(t));
    btn.querySelector('.tech-ico').innerHTML = t ? techIcon(t, 28) : '·';
    btn.querySelector('.tech-name').textContent = t ? techName(t) : match.mixed ? 'Bloqueada' : match.techs.length ? 'Disparo básico' : 'Libre';
    btn.querySelector('.tech-lvl').textContent = t
      ? (t.lvl >= TECH_MAX ? 'Nivel máximo' : `Nv. ${t.lvl}` + (!ultPart(t) ? ' · sin R' : canUlt(t) ? '' : ` · R en Nv. ${EVOLVE_AT}`))
      : match.mixed ? 'Bloqueada: todo está en la mezcla' : (match.techs.length ? 'Disparo básico (cambia aquí)' : 'Consíguela al subir de nivel');
  });
  updateUltButton();
}
function updateUltButton(){
  const btn = document.getElementById('btn-ult');
  const t = activeTech();
  const ok = !!t && canUlt(t);
  const pct = ok ? Math.min(1, t.charge / chargeNeeded()) : 0;
  btn.classList.toggle('locked', !ok);
  btn.classList.toggle('ready', ok && pct >= 1);
  btn.style.setProperty('--fill', `${(pct * 100).toFixed(1)}%`);
  btn.querySelector('.ult-state').textContent = !ok ? (t && !ultPart(t) ? 'Sin R' : 'Sin evolución') : pct >= 1 ? '¡Lista!' : match.elapsed < (match.ultCdUntil || 0) ? `Recarga en ${Math.ceil(match.ultCdUntil - match.elapsed)} s` : `Faltan ${Math.ceil(chargeNeeded() - t.charge)} PT`;
  btn.title = ok ? `Técnica definitiva (R) · gana PT (puntos técnicos) golpeando con esta supertécnica${ultDualText(ultElement(t), (ultPart(t) || {}).kind) ? ' · ' + ultDualText(ultElement(t), (ultPart(t) || {}).kind) : ''}` : 'Técnica definitiva (R)';
}


/* ======================================================================
   HUD COMPACTO + ESTADÍSTICAS EN LA PAUSA
   ====================================================================== */
function initStatsPanel(charDef){
  const el = getElement(charDef.element);
  document.getElementById('sp-portrait').innerHTML = charFace(charDef, 66);
  document.getElementById('sp-name').textContent = charDef.name;
  document.getElementById('sp-role').innerHTML = `${charDef.role} · ${elLabel(charDef.element, 16)}`;
  document.getElementById('sp-portrait').style.setProperty('--elc', el.color);
  document.getElementById('hud-portrait').style.setProperty('--elc', el.color);
  renderElementBox();
}

/* iconos de las mejoras conseguidas (arriba a la izquierda) */
function renderInventory(){
  const inv = document.getElementById('hud-inventory');
  const ups = UPGRADES.filter(u => match.upgrades[u.id] > 0).map(u => {
    const l = match.upgrades[u.id], max = l >= u.max;
    return `<div class="inv-slot${max ? ' max' : ''}" title="${u.name} · Nv. ${l}"><span>${optionIcon(u, 18)}</span><i>${max ? 'M' : l}</i></div>`;
  }).join('');
  inv.innerHTML = ups;
  // casilla del objeto equipado, debajo de la vida (vacía si no llevas ninguno)
  const rs = document.getElementById('hud-relic');
  if (rs){
    const R = match.relic && RELICS[match.relic];
    rs.classList.toggle('empty', !R);
    rs.innerHTML = R ? relicIcon(match.relic, 48) : '';
    rs.title = R ? `${R.name}: ${R.desc}` : 'Objeto: ninguno';
  }
}

/* efectos activos de objetos con su tiempo restante */
let lastBuffHtml = null;
function updateBuffs(){
  if (match.pb && (Math.floor(match.elapsed * 4) !== match.pbHudT)){ match.pbHudT = Math.floor(match.elapsed * 4); renderPBallBar(); }
  const html = ['water', 'nectar'].filter(buffActive).map(k => {
    const it = ITEMS[k];
    return `<div class="buff" style="--c:${it.color}" title="${it.name}"><span>${ITEM_SPRITE_URL[k] ? `<img class="buff-ico" src="${ITEM_SPRITE_URL[k]}" alt="">` : it.emoji}</span><b>${Math.ceil(match.buffs[k] - match.elapsed)}s</b></div>`;
  }).join('') + Object.keys(NOTEBOOK_TECHS).filter(k => nbBonus(k)).map(k => {
    const K = TECH_KINDS[k], timed = match.nbUntil && match.nbUntil[k] > match.elapsed && !nbFusedActive(k);
    return `<div class="buff" style="--c:${K.color}" title="${K.names[0]}"><span>${K.icon}</span><b>${timed ? Math.ceil(match.nbUntil[k] - match.elapsed) + 's' : '∞'}</b></div>`;
  }).join('');
  if (html !== lastBuffHtml){ document.getElementById('hud-buffs').innerHTML = html; lastBuffHtml = html; }
}

/* Filas de "Estadísticas base": [icono, nombre, valor actual, valor base, formato] */
function statRows(){
  const m = match, b = match.base;
  const pct = v => `${Math.round(v)}%`;
  return [
    [pxImg('vitalidad'), 'Vida máx.',        m.maxHp,     b.maxHp,     v => Math.round(v)],
    [pxImg('fuerza'), 'Potencia de tiro', m.dmg,       b.dmg,       v => v.toFixed(1)],
    [pxImg('bolt'), 'Vel. de tiro',     m.atkSpeed,  b.atkSpeed,  v => `${v.toFixed(2)}/s`],
    [pxImg('zancada'), 'Velocidad',        m.speed,     b.speed,     v => v.toFixed(1)],
    [pxImg('coraza'), 'Defensa',          Math.min(75, m.def), Math.min(75, b.def), pct],
    [pxImg('sabiduria'), 'Experiencia',      effXpMult(), b.xpMult,    v => `x${v.toFixed(2)}`],
    [pxImg('critico'), 'Prob. crítico',    effCrit(),   b.crit,      pct],
    [pxImg('boom'), 'Daño crítico',     effCritMult(), b.critMult, v => `x${v.toFixed(2)}`],
    [pxImg('dash'), 'Regate',           effDodge(),  b.dodge,     pct],
    [pxImg('range'), 'Alcance',          m.range,     b.range,     v => Math.round(v)],
    [pxImg('iman'), 'Recogida',         m.pickup,    b.pickup,    v => Math.round(v)],
  ];
}

function renderElementBox(){
  const tl = document.getElementById('sp-talent-logo'); if (tl) tl.innerHTML = talentLogo(20);
  const el = getElement(match.element);
  document.getElementById('sp-element').innerHTML =
    `<h4 class="sp-title">Afinidad</h4>` +
    `<div class="sp-arch sp-arch-tip" style="--c:${el.color}">${elIcon(match.element, 34)}<b>${el.name}</b>` +
    (AFFINITY_PASSIVES[match.element] ? `<span class="sp-passive-tip"><b>Pasiva de afinidad:</b> ${AFFINITY_PASSIVES[match.element].desc}</span>` : '') +
    `</div>`;
}

function renderStatsPanel(){
  if (!match) return;
  // estadísticas
  const stats = document.getElementById('sp-stats');
  stats.innerHTML = '';
  statRows().forEach(([ico, label, cur, base, fmt]) => {
    const li = document.createElement('li');
    const up = cur > base + 1e-9;
    li.innerHTML = `<span class="sp-ico">${ico}</span><span class="sp-lbl">${label}</span>` +
                   `<span class="sp-val${up ? ' up' : ''}">${fmt(cur)}</span>`;
    stats.appendChild(li);
  });

  // supertécnicas
  const tl = document.getElementById('sp-techs');
  tl.innerHTML = '';
  if (!match.techs.length){
    tl.innerHTML = '<li class="sp-empty">Puedes llevar 2. Aparecen al subir de nivel.</li>';
  }
  match.techs.forEach((t, i) => {
    const li = document.createElement('li');
    const isMax = t.lvl >= TECH_MAX;
    if (i === match.activeTech) li.className = 'sp-active';
    li.innerHTML = `<kbd class="slot-key">${SLOT_KEYS[i]}</kbd><span class="sp-ico">${techIcon(t)}</span>` +
                   `<span class="sp-lbl">${techName(t)}</span>` +
                   `<span class="sp-lvl${isMax ? ' max' : ''}">${isMax ? 'MAX' : 'Nv. ' + t.lvl}</span>`;
    tl.appendChild(li);
  });

  // talentos
  const tal = document.getElementById('sp-talents');
  tal.innerHTML = '';
  if (!match.talents.length){
    tal.innerHTML = `<li class="sp-empty">Vence al 1.º y al 3.º boss para elegir talentos (máx. ${TALENT_SLOTS}).</li>`;
  }
  match.talents.forEach(t => {
    const T = TALENTS[t.key], isMax = t.lvl >= TALENT_MAX;
    const li = document.createElement('li');
    li.title = talentDesc(t.key, t.lvl);
    li.innerHTML = `<span class="sp-ico">${TALENT_PX[t.key] ? pxImg(TALENT_PX[t.key]) : T.emoji}</span><span class="sp-lbl">${T.name}</span>` +
                   `<span class="sp-lvl${isMax ? ' max' : ''}">${isMax ? 'MAX' : 'Nv. ' + t.lvl}</span>`;
    tal.appendChild(li);
  });
  if (match.relic){
    const R = RELICS[match.relic], li = document.createElement('li');
    li.title = R.desc;
    li.innerHTML = `<span class="sp-ico">${relicIcon(match.relic, 26)}</span><span class="sp-lbl">${R.name}</span><span class="sp-lvl">Objeto</span>`;
    tal.appendChild(li);
  }

  // mejoras activas (solo las que ya tienen nivel)
  const list = document.getElementById('sp-upgrades');
  list.innerHTML = '';
  const active = UPGRADES.filter(u => match.upgrades[u.id] > 0);
  if (!active.length){
    list.innerHTML = '<li class="sp-empty">Sube de nivel para conseguir mejoras.</li>';
  }
  active.forEach(u => {
    const lvl = match.upgrades[u.id];
    const isMax = lvl >= u.max;
    const li = document.createElement('li');
    li.innerHTML = `<span class="sp-ico">${UPGRADE_PX[u.id] ? pxImg(UPGRADE_PX[u.id]) : u.emoji}</span><span class="sp-lbl">${u.name}</span>` +
                   `<span class="sp-lvl${isMax ? ' max' : ''}">${isMax ? 'MAX' : 'Nv. ' + lvl}</span>`;
    list.appendChild(li);
  });
  document.getElementById('sp-level').textContent = `Nv. ${match.level}`;
}

/* ---- HUD ---- */
function updateHud(){
  { const sh = Math.max(0, match.shield || 0), tot = Math.max(match.maxHp, match.hp + sh), hpP = Math.max(0, match.hp / tot * 100);   // escudo de la Cinta de Mark: tramo azul en la vida
    document.getElementById('hp-fill').style.width = `${hpP}%`;
    const se = document.getElementById('hp-shield'); se.style.left = `${hpP}%`; se.style.width = `${sh > 0.5 ? sh / tot * 100 : 0}%`; }
  document.getElementById('xp-fill').style.width = `${Math.min(100,(match.xp/match.xpNext)*100)}%`;
  document.getElementById('hud-level').textContent = `Nv. ${match.level}`;
  document.getElementById('hud-coins').innerHTML = `${match.coinsEarned} ${COIN_HTML}` + (match.ticketsEarned ? ` · ${pxImg('ticketY', 18)}${match.ticketsEarned}` : '') + (match.ticketsEpicEarned ? ` · ${pxImg('ticketP', 18)}${match.ticketsEpicEarned}` : '');
  const clk = matchClock();
  const m = String(Math.floor(clk/60)).padStart(2,'0');
  const s = String(Math.floor(clk%60)).padStart(2,'0');
  const timerEl = document.getElementById('hud-timer');
  if (match.inArena && bossAlive() && !match.over){                // tiempo que llevas en el duelo (rojo cuando el boss se enfurece)
    const t = Math.floor(duelTime());
    timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    timerEl.classList.add('boss-clock'); timerEl.classList.toggle('boss-clock-low', bossFury() > 1);
  } else {
    timerEl.textContent = `${m}:${s}`;
    timerEl.classList.remove('boss-clock', 'boss-clock-low');
  }
  document.getElementById('hud-hp-text').textContent = `${Math.ceil(Math.max(0, match.hp))} / ${Math.round(match.maxHp)}` + (match.shield > 0.5 ? ` +${Math.round(match.shield)}` : '');
  updateBuffs();
  updateUltButton();
  if (match.boss){
    const grp = (match.bossGroup && match.bossGroup.length) ? match.bossGroup : [match.boss];
    const hpSum = grp.reduce((a, o) => a + Math.max(0, o.hp), 0), maxSum = grp.reduce((a, o) => a + o.maxHp, 0);
    document.getElementById('boss-hp-fill').style.width = `${Math.max(0, hpSum / maxSum) * 100}%`;
  }
}

/* ======================================================================
   DIBUJO DEL CAMPO DE TIERRA
   Se pinta UNA vez en un lienzo aparte a la resolución de la hoja
   (1 px del lienzo = 3 px de mundo) y en cada fotograma se copia la parte
   visible ampliada ×3 sin suavizar. Si la hoja no carga, se pinta lo
   mismo con formas de canvas.
   ====================================================================== */
// En el paquete los nombres están cambiados: el PNG "magenta" es el que trae transparencia.
const CITY_SHEET_SRC = 'assets/city/Spritesheet/roguelikeCity_magenta.png';
/* logo del juego pintado en el centro del campo (se integra con la tierra) */
const fieldLogo = new Image();
let fieldLogoReady = false;
fieldLogo.onload = () => { fieldLogoReady = fieldLogo.naturalWidth > 0; pitchCanvas = null; };
fieldLogo.src = 'assets/logo.png';
function drawFieldLogo(g, O){
  if (!fieldLogoReady) return;
  const p = CAMPUS.pitch;
  const x = O + Math.round(p.x / PX), y = O + Math.round(p.y / PX), w = Math.round(p.w / PX), h = Math.round(p.h / PX);
  const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  const lw = Math.round(h * 0.26), lh = Math.round(lw * fieldLogo.naturalHeight / fieldLogo.naturalWidth);
  // versión pixelada: se dibuja a la mitad de tamaño sin suavizado y luego se amplía x2 (píxeles gordos)
  const sw = Math.max(8, Math.round(lw / 2)), sh = Math.max(8, Math.round(lh / 2));
  const t = document.createElement('canvas'); t.width = sw; t.height = sh;
  const tg = t.getContext('2d');
  tg.imageSmoothingEnabled = false;
  tg.drawImage(fieldLogo, 0, 0, sw, sh);
  // silueta en marrón oscuro (como tierra marcada) y el dibujo en tonos marrones por encima
  const sil = document.createElement('canvas'); sil.width = sw; sil.height = sh;
  const sg = sil.getContext('2d');
  sg.drawImage(t, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#5a3a1e'; sg.fillRect(0, 0, sw, sh);
  const tone = document.createElement('canvas'); tone.width = sw; tone.height = sh;
  const tng = tone.getContext('2d');
  tng.imageSmoothingEnabled = false;
  tng.filter = 'grayscale(1) sepia(1) saturate(1.3) brightness(0.75) contrast(1.4)';   // colores pasados a marrones
  tng.drawImage(t, 0, 0);
  const X = Math.round(cx - sw), Y = Math.round(cy - sh);
  g.save();
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 0.28; g.drawImage(sil, X + 2, Y + 2, sw * 2, sh * 2);    // sombra marcada en la tierra
  g.globalAlpha = 0.30; g.drawImage(tone, X, Y, sw * 2, sh * 2);          // el logo en marrones, sutil
  g.restore();
}
const citySheet = new Image();
let citySheetReady = false;
let pitchCanvas = null;           // lienzo con el campo ya pintado
citySheet.onload = () => { citySheetReady = citySheet.naturalWidth > 0; pitchCanvas = null; };
citySheet.onerror = () => {
  citySheetReady = false; pitchCanvas = null;
  console.warn('[campo] No se pudo cargar ' + CITY_SHEET_SRC + '; se dibuja con formas de canvas.');
};
citySheet.src = CITY_SHEET_SRC;   // se carga al abrir la página, antes de empezar la partida

/* paleta (de la hoja de Kenney) para lo que se dibuja con código */
const PAL = {
  grass:'#409c62', grassDark:'#358552', dirt:'#b48355', line:'#f4f1e8',
  sandTint:'rgba(255,214,150,0.24)',            // aclara la tierra de Kenney hacia el tono del Raimon
  blockTop:'#e6dcc2', blockFront:'#c7b997', blockEdge:'#9f9174', shadow:'rgba(0,0,0,0.22)',
  net:'rgba(235,240,244,0.55)', netDark:'rgba(60,70,80,0.25)', post:'#ffffff', postShade:'#c9d0d6',
  leaf:['#5fb35f', '#7bad2c'], trunk:'#7a5235',
};
/* casillas de la hoja [columna, fila] */
const CT = {
  dirt:[[4,24],[5,24]], grass:[[0,24],[1,24]],
  treeCols:[34,31],               // copa en la fila 10, tronco en la 11
  bush:[34,13],
};

function tileVar(x, y){ return ((x * 7349) ^ (y * 3163) ^ (x * y * 31)) & 1023; }
function putTile(g, c, r, x, y){
  g.drawImage(citySheet, c * (TILE_SRC + TILE_GAP), r * (TILE_SRC + TILE_GAP), TILE_SRC, TILE_SRC, x, y, TILE_SRC, TILE_SRC);
}
function px(g, color, x, y, w, h){ g.fillStyle = color; g.fillRect(x, y, w, h); }
function pixelFrame(g, color, x, y, w, h){
  px(g, color, x, y, w, 1); px(g, color, x, y + h - 1, w, 1); px(g, color, x, y, 1, h); px(g, color, x + w - 1, y, 1, h);
}
/* circunferencia de 1 px; keep(x, y) decide qué píxeles se pintan (para arcos) */
function pixelArc(g, color, cx, cy, r, keep){
  g.fillStyle = color;
  const n = Math.ceil(r * 8), done = new Set();
  for (let k = 0; k < n; k++){
    const t = k / n * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * r), y = Math.round(cy + Math.sin(t) * r);
    const key = x * 100000 + y;
    if (done.has(key) || (keep && !keep(x, y))) continue;
    done.add(key); g.fillRect(x, y, 1, 1);
  }
}

/* ======================================================================
   ESTÉTICA DEL CAMPO SEGÚN EL ÚLTIMO RIVAL VENCIDO (solo decorado:
   no cambia nada del juego — obstáculos, barro y límites siguen igual)
   ====================================================================== */
const FIELD_THEMES = {
  // ground: color del campo (null = tierra marrón de siempre) · stripes: franjas de corte
  // outside: suelo de fuera · floor: textura sencilla · items: [sprite, cuántos, semilla] · aura: tinte en pantalla
  Raimon:   { ground:null },
  Occult:   { ground:null, outside:'#26332b', decor:'simple', floor:'grass', tuft:'#1d2a22', grass:{ flowers:['#9a55e0', '#c48af0'] }, sway:['#16301e', '#8a6ac0'], items:[['purpleTree', 14, 11], ['darkTree', 4, 12]], aura:{ col:'rgba(90,20,140,', a:0.20, parts:'#c48af0' } },
  Wild:     { ground:'#6cbf5a', stripes:'#62b352', outside:'#2f8a3a', decor:'simple', floor:'grass', tuft:'#257a30', grass:{ flowers:['#ff6b5e', '#ffd21f', '#ff7ac0'] }, sway:['#1a6a24', '#8ae86a'], items:[['jungleTree', 12, 21], ['palm', 9, 22]] },
  Brain:    { ground:'#7ccc66', stripes:'#70c05a', outside:'#8a9098', decor:'simple', floor:'tiles', tile:32, extra:'tech', blink:true, tileLine:'#7a8088', tileHi:'rgba(255,255,255,0.10)', items:[['dish', 6, 31]] },
  Otaku:    { ground:'#e9d6a8', stripes:'#e0cb98', outside:'#a6a9ae', decor:'simple', floor:'tiles', tile:16, extra:'cracks', drift:['#e8a0c8', '#ffffff'], tileLine:'#93969c', tileHi:'rgba(255,255,255,0.12)', items:[['lamp', 12, 41], ['tree', 8, 42]] },
  Royal:    { ground:'#2f6a3a', stripes:'#285e33', outside:'#101318', decor:'royal', stands:{ base:'#1f232c', step:'#2a2f3a', seat:['#1f3a2a', '#3a2024'] } },
  Shuriken: { ground:null, outside:'#1b241e', decor:'simple', floor:'grass', tuft:'#141b16', sway:['#0f2014', '#4a7a52'], items:[['darkTree', 16, 61]], aura:{ col:'rgba(5,5,15,', a:0.38 } },
  Farm:     { ground:'#6cbf5a', stripes:'#62b352', outside:'#3a8f3a', decor:'simple', floor:'grass', tuft:'#2a7a30', grass:{ flowers:['#ffffff', '#ffd21f'] }, sway:['#226a28', '#d8e080'], items:[['hay', 12, 71], ['tree', 9, 72]] },
  Kirkwood: { ground:'#7fc96a', stripes:'#72bd5e', outside:'#5a6068', decor:'simple', drift:['#d8321e', '#ffffff'], stands:{ base:'#8d939c', step:'#a9afb8', seat:['#9aa0a8', '#b4bac2'] }, items:[['tree', 12, 81]] },
  Zeus:     { ground:'#a9e08c', stripes:'#9bd47e', outside:'#e4e6ea', decor:'simple', floor:'tiles', tile:24, offset:true, extra:'veins', drift:['#ffffff', '#d8dce4'], tileLine:'#c9ccd2', tileHi:'#f7f8fa', items:[['column', 9, 91]], aura:{ col:'rgba(235,240,250,', a:0.08, parts:'#ffffff' } },
};
const ZEUS_THEME_AT = 22.5 * 60;
/* tema actual: el del último boss vencido (al empezar, la tierra del Raimon) */
function fieldThemeKey(){
  return 'Raimon';                                  // siempre la tierra del inicio (con sus arbolitos); se va poniendo verde con fieldGreen()
  if (!match || !match.bossesBeaten) return 'Raimon';
  // tras vencer a todos, en la recta final (desde el minuto 27) el campo pasa a ser el del Instituto Zeus
  if (match.bossesBeaten >= BOSSES.length && matchClock() >= ZEUS_THEME_AT) return 'Zeus';
  const B = BOSSES[match.bossesBeaten - 1];
  return B && FIELD_THEMES[B.team] ? B.team : 'Raimon';
}
function fieldTheme(){ return FIELD_THEMES[fieldThemeKey()]; }
/* cuánto césped tiene el campo: 0 al empezar (tierra marrón) → 1 tras vencer a casi todos los bosses */
function fieldGreen(){ return typeof match !== 'undefined' && match ? Math.min(1, (match.bossesBeaten || 0) / (BOSSES.length - 1)) : 0; }

/* ---- piezas de decorado en píxel (16 px de casilla) ---- */
const DECO = {
  tree(g, x, y, TH, v){
    const L = TH.leaf, c = L[v % 2];
    px(g, PAL.shadow, x + 2, y + 2 * TILE_SRC - 3, TILE_SRC - 4, 3);
    px(g, TH.trunk || PAL.trunk, x + 6, y + 18, 4, 12);
    px(g, c, x + 3, y + 1, 10, 2); px(g, c, x + 1, y + 3, 14, 13); px(g, c, x + 3, y + 16, 10, 2);
    px(g, L[2] || c, x + 3, y + 3, 4, 3); px(g, 'rgba(0,0,0,0.18)', x + 10, y + 6, 5, 10);
  },
  jungle(g, x, y, v){
    const big = v % 3 === 0;
    px(g, PAL.shadow, x + 1, y + 29, 14, 3);
    px(g, '#6b4423', x + 7, y + 12, 3, 18);
    const lc = ['#1f8a2a', '#2fae3a', '#147a2a'][v % 3];
    for (const [dx, dy, w, h] of [[0, 6, 8, 4], [8, 5, 8, 4], [2, 2, 5, 4], [9, 1, 5, 4], [4, 9, 9, 4]]) px(g, lc, x + dx, y + dy, w, h);
    px(g, '#7be05a', x + 3, y + 3, 3, 2); px(g, '#7be05a', x + 10, y + 2, 3, 2);
    if (big){ px(g, '#ff6b5e', x + 12, y + 20, 3, 3); px(g, '#ffd21f', x + 2, y + 24, 2, 2); }   // flores de la selva
  },
  antenna(g, x, y, v){
    px(g, PAL.shadow, x + 3, y + 29, 10, 3);
    px(g, '#7d8794', x + 7, y + 6, 2, 24); px(g, '#9aa3ad', x + 3, y + 26, 10, 4);
    px(g, '#c3cbd6', x + 2, y + 3, 12, 3); px(g, '#9aa3ad', x + 4, y + 1, 8, 2);      // plato
    px(g, '#e8463a', x + 7, y, 2, 2);                                                 // luz
    px(g, '#7d8794', x + 1, y + 10, 14, 1); px(g, '#7d8794', x + 3, y + 15, 10, 1);   // varillas
  },
  machine(g, x, y, v){
    px(g, PAL.shadow, x + 2, y + 29, 14, 3);
    px(g, '#4a5560', x + 1, y + 10, 14, 20); px(g, '#5f6b78', x + 2, y + 11, 12, 6);
    px(g, '#1b1d26', x + 3, y + 12, 10, 4); px(g, v % 2 ? '#46e0ff' : '#4fbf45', x + 4, y + 13, 6, 2);   // pantalla
    for (let k = 0; k < 3; k++) px(g, ['#e8463a', '#ffd21f', '#4fbf45'][(k + v) % 3], x + 3 + k * 4, y + 21, 2, 2);
    px(g, '#9aa3ad', x + 3, y + 25, 10, 2); px(g, '#c3cbd6', x + 6, y + 6, 4, 4);
  },
  building(g, x, y, v){
    const h = 26 + (v % 4) * 6, top = y + 32 - h, cols = ['#c9a06a', '#9aa3ad', '#e0bf8c', '#8d97c8', '#d8a0b8'];
    const c = cols[v % cols.length];
    px(g, PAL.shadow, x + 2, y + 30, 16, 3);
    px(g, c, x, top, 16, h); px(g, 'rgba(0,0,0,0.2)', x + 11, top, 5, h); px(g, 'rgba(255,255,255,0.25)', x, top, 16, 2);
    for (let wy = top + 4; wy < y + 26; wy += 5) for (let wx = x + 2; wx < x + 13; wx += 4) px(g, (wx + wy + v) % 3 ? '#fff1a8' : '#3a4050', wx, wy, 2, 3);
    px(g, '#3a4050', x + 6, y + 26, 4, 6);                                             // puerta
    if (v % 5 === 0){ px(g, '#ff7ac0', x + 1, top - 4, 14, 4); px(g, '#ffffff', x + 3, top - 3, 10, 2); }   // cartel
  },
  ninja(g, x, y, v){
    if (v % 3 === 0){                                                                   // farol de papel
      px(g, '#3a2a1a', x + 7, y + 4, 2, 26); px(g, '#d8321e', x + 4, y + 8, 8, 9); px(g, '#ff8a5c', x + 5, y + 9, 3, 7); px(g, '#1b1d26', x + 4, y + 8, 8, 1);
      return;
    }
    if (v % 3 === 1){                                                                   // ninja agazapado
      px(g, PAL.shadow, x + 3, y + 29, 10, 3);
      px(g, '#15161c', x + 4, y + 16, 8, 13); px(g, '#15161c', x + 5, y + 10, 6, 6); px(g, '#d8321e', x + 5, y + 12, 6, 1);
      px(g, '#f3c9a0', x + 6, y + 13, 4, 1); px(g, '#d8321e', x + 11, y + 12, 3, 1);
      return;
    }
    px(g, PAL.shadow, x + 2, y + 29, 12, 3);                                            // pino oscuro
    px(g, '#2a1a12', x + 7, y + 22, 2, 8);
    px(g, '#14301f', x + 3, y + 14, 10, 8); px(g, '#183a25', x + 5, y + 7, 6, 7); px(g, '#1d4430', x + 6, y + 2, 4, 5);
  },
  hay(g, x, y, v){
    px(g, PAL.shadow, x + 1, y + 29, 15, 3);
    px(g, '#d8b44a', x + 1, y + 18, 14, 12); px(g, '#f0d070', x + 2, y + 18, 12, 3); px(g, '#a8862a', x + 1, y + 26, 14, 4);
    px(g, '#8a6a1a', x + 5, y + 18, 1, 12); px(g, '#8a6a1a', x + 10, y + 18, 1, 12);
  },
  rock(g, x, y, v){
    px(g, PAL.shadow, x + 1, y + 29, 14, 3);
    px(g, '#8d97a6', x + 2, y + 20, 12, 10); px(g, '#8d97a6', x + 4, y + 17, 8, 3); px(g, '#c3cbd6', x + 5, y + 18, 4, 3); px(g, '#5f6773', x + 9, y + 23, 5, 7);
  },
  column(g, x, y, v){
    const broken = v % 4 === 0, h = broken ? 14 : 26;
    px(g, PAL.shadow, x + 2, y + 29, 14, 3);
    px(g, '#f4f0e2', x + 4, y + 32 - h, 8, h); px(g, '#d8d0b8', x + 9, y + 32 - h, 3, h);
    for (let k = 5; k < 11; k += 2) px(g, '#d8d0b8', x + k, y + 34 - h, 1, h - 4);
    px(g, '#ffffff', x + 2, y + 32 - h - 2, 12, 3); px(g, '#e0b012', x + 2, y + 32 - h - 2, 12, 1);   // capitel con oro
    px(g, '#ffffff', x + 2, y + 29, 12, 3);
  },
};
/* gradas a lo largo de las 4 vallas (Kirkwood, Royal) */
function drawStands(g, O, S){
  const C = CAMPUS, W0 = C.cols * TILE_SRC, H0 = C.rows * TILE_SRC, D = 40, gap = 14;
  const band = (x, y, w, h, vertical) => {
    px(g, S.base, x, y, w, h);
    const n = Math.floor((vertical ? w : h) / 5);
    for (let k = 0; k < n; k++){
      if (vertical) px(g, S.step, x + k * 5, y, 2, h); else px(g, S.step, x, y + k * 5, w, 2);
    }
    // asientos vacíos (sin público), en filas
    if (vertical){ for (let k = 0; k < n; k++) for (let q = 2; q < h - 2; q += 4) px(g, S.seat[(k + Math.floor(q / 40)) % S.seat.length], x + k * 5 + 2, y + q, 2, 2); }
    else { for (let k = 0; k < n; k++) for (let q = 2; q < w - 2; q += 4) px(g, S.seat[(k + Math.floor(q / 40)) % S.seat.length], x + q, y + k * 5 + 2, 2, 2); }
    px(g, 'rgba(0,0,0,0.3)', x, y, w, 1);
  };
  band(O - gap - D, O - gap - D, W0 + 2 * (gap + D), D, false);       // arriba
  band(O - gap - D, O + H0 + gap, W0 + 2 * (gap + D), D, false);       // abajo
  band(O - gap - D, O - gap, D, H0 + 2 * gap, true);                   // izquierda
  band(O + W0 + gap, O - gap, D, H0 + 2 * gap, true);                  // derecha
  px(g, 'rgba(0,0,0,0.25)', O - gap, O - gap, W0 + 2 * gap, 2);
}
/* Royal Academy: el campo flota sobre el vacío sujeto por puentes oscuros */
function drawRoyalBridges(g, O){
  const C = CAMPUS, W0 = C.cols * TILE_SRC, H0 = C.rows * TILE_SRC, B = C.border * TILE_SRC;
  const beam = (x, y, w, h) => { px(g, '#1b1f28', x, y, w, h); px(g, '#2f3646', x + 1, y + 1, w - 2, 2); px(g, '#0a0c10', x, y + h - 2, w, 2); };
  for (const fx of [0.2, 0.5, 0.8]){
    const cx = O + Math.round(W0 * fx);
    beam(cx - 10, 0, 20, O - 60);                       // hacia arriba
    beam(cx - 10, O + H0 + 60, 20, B - 60);             // hacia abajo
    for (let yy = 8; yy < O - 60; yy += 16) px(g, '#3a4050', cx - 10, yy, 20, 1);
  }
  for (const fy of [0.3, 0.7]){
    const cy = O + Math.round(H0 * fy);
    beam(0, cy - 10, O - 60, 20); beam(O + W0 + 60, cy - 10, B - 60, 20);
  }
}
/* decorado de fuera según el tema (reparte piezas como los árboles) */
function drawThemedDecor(g, TH){
  const T = TILE_SRC, C = CAMPUS, B = C.border, n = TH.every || C.treeEvery;
  const stands = TH.decor === 'stands' || TH.decor === 'royal';
  for (let ty = 0; ty < C.rows + 2 * B - 1; ty++) for (let tx = 0; tx < C.cols + 2 * B; tx++){
    const nearX = tx >= B - (stands ? 7 : 2) && tx < B + C.cols + (stands ? 7 : 2), nearY = ty >= B - (stands ? 8 : 3) && ty < B + C.rows + (stands ? 7 : 2);
    if (nearX && nearY) continue;
    const v = tileVar(tx * 3 + 1, ty * 5 + 2);
    if (v % n !== 0 || (v >> 4) % 3 === 0) continue;
    const x = tx * T, y = ty * T;
    switch (TH.decor){
      case 'trees':  DECO.tree(g, x, y, TH, v); break;
      case 'jungle': DECO.jungle(g, x, y, v); break;
      case 'tech':   (v >> 2) % 2 ? DECO.antenna(g, x, y, v) : DECO.machine(g, x, y, v); break;
      case 'city':   DECO.building(g, x, y, v >> 3); break;
      case 'ninja':  DECO.ninja(g, x, y, v >> 2); break;
      case 'farm':   (v >> 2) % 3 === 0 ? DECO.rock(g, x, y, v) : DECO.hay(g, x, y, v); break;
      case 'stands': if ((v >> 2) % 2) DECO.tree(g, x, y, { leaf:['#4f8a4f', '#3f7a3f'] }, v); break;
      case 'greek':  (v >> 2) % 3 ? DECO.column(g, x, y, v >> 4) : DECO.tree(g, x, y, { leaf:['#6fae4f', '#5f9a42', '#a6d96a'] }, v); break;
      case 'royal':  break;
    }
  }
}
/* movimiento fuera del campo (solo visual): matas de césped que se mecen con el viento,
   hojas o pétalos que vuelan y luces que parpadean en el suelo técnico */
let outsideAmb = null;
function buildOutsideAmbient(key, TH){
  const C = CAMPUS, T = TILE_SRC, O = C.border * T, W0 = C.cols * T, H0 = C.rows * T, r = rngFrom(99);
  const tufts = [], lights = [];
  if (TH.sway) for (let k = 0; k < 3600; k++){
    const u = r() * (W0 + 2 * O), v = r() * (H0 + 2 * O);
    if (u > O - 8 && u < O + W0 + 8 && v > O - 8 && v < O + H0 + 8) continue;               // solo fuera de las vallas
    const nb = 2 + Math.floor(r() * 3), blades = [];
    for (let b = 0; b < nb; b++) blades.push({ dx: (b - nb / 2) * 3 + r() * 2, len: 4 + Math.floor(r() * 3), lean: (r() - 0.5) * 1.2 });
    tufts.push({ x: (u - O) * PX, y: (v - O) * PX, blades, ph: r() * 6 });
  }
  if (TH.blink) for (let k = 0; k < 160; k++){
    const u = Math.floor(r() * (W0 + 2 * O) / 32) * 32 + 15, v = r() * (H0 + 2 * O);
    if (u > O - 8 && u < O + W0 + 8 && v > O - 8 && v < O + H0 + 8) continue;
    lights.push({ x: (u - O) * PX, y: (v - O) * PX, ph: r() * 6, c: r() < 0.5 ? '#46e0ff' : '#4fbf45' });
  }
  outsideAmb = { key, tufts, lights, drift: [] };
}
function drawOutsideAmbient(camX, camY, dt){
  const key = fieldThemeKey(), TH = FIELD_THEMES[key];
  if (!TH || !TH.decor) return;
  if (!outsideAmb || outsideAmb.key !== key) buildOutsideAmbient(key, TH);
  const t = match.elapsed, P = PX;
  const C = CAMPUS, fw = C.cols * TILE, fh = C.rows * TILE;
  const inField = (x, y) => x > -10 && x < fw + 10 && y > -10 && y < fh + 10;
  if (TH.sway){
    for (const tf of outsideAmb.tufts){
      const sx = tf.x + camX, sy = tf.y + camY;
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const gust = Math.max(0, Math.sin(t * 0.9 - tf.x * 0.004)) ** 3;
      const sway = Math.sin(t * 2.2 + tf.ph) * 0.9 + gust * 2.8;
      for (const b of tf.blades) for (let k = 0; k < b.len; k++){
        const f = k / b.len;
        ctx.fillStyle = k >= b.len - 1 ? TH.sway[1] : TH.sway[0];
        ctx.fillRect(Math.round(sx + b.dx + (b.lean + sway) * f * f * 1.6 * P), Math.round(sy - k * P), P, P);
      }
    }
  }
  if (TH.blink) for (const l of outsideAmb.lights){
    const sx = l.x + camX, sy = l.y + camY;
    if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
    if (Math.sin(t * 3 + l.ph) > 0.2){ ctx.fillStyle = l.c; ctx.fillRect(Math.round(sx), Math.round(sy), P * 2, P); }
  }
  if (TH.drift){                                                                               // hojas / pétalos / papelitos al viento
    const D = outsideAmb.drift;
    while (D.length < 26) D.push({ x: match.x + (Math.random() - 0.5) * W * 1.6, y: match.y + (Math.random() - 0.5) * H * 1.6, v: 30 + Math.random() * 40, ph: Math.random() * 6, c: TH.drift[Math.floor(Math.random() * TH.drift.length)] });
    for (const d of D){
      const gust = 1 + 2 * Math.max(0, Math.sin(t * 0.9 - d.x * 0.004)) ** 3;
      d.x += d.v * gust * (dt || 0.016); d.y += Math.sin(t * 1.6 + d.ph) * 10 * (dt || 0.016);
      const sx = d.x + camX, sy = d.y + camY;
      if (sx > W + 40 || sx < -60 || sy < -60 || sy > H + 60){ d.x = match.x - W / 2 - 20 - Math.random() * 40; d.y = match.y + (Math.random() - 0.5) * H; continue; }
      if (inField(d.x, d.y)) continue;
      ctx.fillStyle = d.c; ctx.fillRect(Math.round(sx), Math.round(sy), P * 2, P * (Math.sin(t * 6 + d.ph) > 0 ? 1 : 2));
    }
  }
}
/* aura del tema en pantalla (misterio, oscuridad, luz dorada) */
function drawThemeAura(){
  const TH = fieldTheme(), A = TH.aura;
  if (!A || match.inArena) return;
  const g = ctx.createRadialGradient(W/2, H/2, Math.min(W, H) * 0.28, W/2, H/2, Math.max(W, H) * 0.75);
  g.addColorStop(0, A.col + '0)'); g.addColorStop(1, A.col + (A.a * 2.4).toFixed(2) + ')');
  ctx.save(); ctx.fillStyle = A.col + A.a.toFixed(2) + ')'; ctx.globalAlpha = 0.5; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (A.parts){                                                  // motas flotando
    ctx.fillStyle = A.parts;
    for (let i = 0; i < 26; i++){
      const t = match.elapsed * (0.2 + (i % 5) * 0.05) + i * 13.7;
      const x = ((i * 197 + Math.sin(t) * 40) % W + W) % W, y = (((i * 131) - t * 18) % H + H) % H;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 3 + i);
      ctx.fillRect(Math.round(x), Math.round(y), 3, 3);
    }
  }
  ctx.restore();
}

/* ======================================================================
   DECORADO DETALLADO DE FUERA DEL CAMPO (v2) — solo visual
   Suelo con textura propia de cada tema + piezas grandes repartidas
   (ordenadas por altura para que se solapen bien).
   ====================================================================== */
function rngFrom(seed){ let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const D2 = {
  // ---------- piezas comunes ----------
  shadow(g, x, y, w){ px(g, 'rgba(0,0,0,0.22)', x - w / 2, y - 2, w, 3); },
  roundTree(g, x, y, c, r){                         // árbol de copa redonda (24x30)
    D2.shadow(g, x, y, 20);
    px(g, c.trunk, x - 2, y - 12, 4, 12); px(g, 'rgba(0,0,0,0.25)', x, y - 12, 2, 12);
    const blob = (bx, by, w, h, col) => { px(g, col, bx + 2, by, w - 4, h); px(g, col, bx, by + 2, w, h - 4); px(g, col, bx + 1, by + 1, w - 2, h - 2); };
    blob(x - 12, y - 32, 24, 20, c.leaf[1]);
    blob(x - 11, y - 33, 20, 17, c.leaf[0]);
    blob(x - 8, y - 32, 9, 7, c.leaf[2]);
    for (let k = 0; k < 6; k++) px(g, c.leaf[1], x - 9 + Math.floor(r() * 18), y - 30 + Math.floor(r() * 14), 2, 2);
    if (c.fruit) for (let k = 0; k < 3; k++) px(g, c.fruit, x - 8 + Math.floor(r() * 16), y - 28 + Math.floor(r() * 12), 2, 2);
  },
  // ---------- selva (Wild) ----------
  palm(g, x, y, r){
    D2.shadow(g, x + 6, y, 22);
    const lean = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < 30; k++){ const tx = x + Math.round(lean * k * k / 120); px(g, k % 4 === 0 ? '#5a3a1e' : '#8a5a2e', tx - 2, y - k, 4, 1); }
    const tx = x + Math.round(lean * 900 / 120), ty = y - 30;
    const frond = (dx, dy, len, col) => { for (let k = 0; k < len; k++) px(g, col, tx + Math.round(dx * k), ty + Math.round(dy * k + k * k * 0.06), 3, 2); };
    for (const [dx, dy] of [[1, -0.3], [-1, -0.3], [0.8, 0.2], [-0.8, 0.2], [0.3, -0.8], [-0.3, -0.8]]) frond(dx, dy, 13, '#1f8a2a');
    for (const [dx, dy] of [[1, -0.4], [-1, -0.4], [0.5, -0.7]]) frond(dx, dy, 9, '#5fd04a');
    px(g, '#6b4423', tx - 2, ty, 3, 3); px(g, '#6b4423', tx + 1, ty + 1, 3, 3);   // cocos
  },
  fern(g, x, y, r){
    const cols = ['#0f6a22', '#1f8a2a', '#3ab53a'];
    for (let b = 0; b < 7; b++){
      const ang = -Math.PI / 2 + (b - 3) * 0.42, len = 9 + Math.floor(r() * 6), c = cols[b % 3];
      for (let k = 0; k < len; k++){
        const fx = x + Math.round(Math.cos(ang) * k), fy = y + Math.round(Math.sin(ang) * k + k * k * 0.04);
        px(g, c, fx, fy, 2, 1);
        if (k % 2 === 0 && k > 2){ px(g, c, fx - 2, fy + 1, 2, 1); px(g, c, fx + 2, fy + 1, 2, 1); }   // foliolos
      }
    }
  },
  flowerBush(g, x, y, r){
    D2.shadow(g, x, y, 16);
    px(g, '#147a2a', x - 8, y - 9, 16, 9); px(g, '#2fae3a', x - 6, y - 11, 12, 6); px(g, '#5fd04a', x - 4, y - 11, 4, 2);
    const fc = ['#ff6b5e', '#ffd21f', '#ff7ac0', '#ffffff'][Math.floor(r() * 4)];
    for (let k = 0; k < 5; k++){ const fx = x - 6 + Math.floor(r() * 12), fy = y - 10 + Math.floor(r() * 7); px(g, fc, fx, fy, 2, 2); px(g, '#ffe27a', fx, fy, 1, 1); }
  },
  vine(g, x, y, r){
    for (let k = 0; k < 18; k++){ const vx = x + Math.round(Math.sin(k * 0.6) * 3); px(g, '#1f6a2a', vx, y - k, 1, 1); if (k % 3 === 0) px(g, '#3ab53a', vx + (k % 6 ? 1 : -2), y - k, 2, 2); }
  },
  // ---------- tecnología (Brain) ----------
  serverRack(g, x, y, r){
    D2.shadow(g, x, y, 18);
    px(g, '#2a3038', x - 8, y - 30, 16, 30); px(g, '#3a424c', x - 7, y - 29, 14, 28); px(g, '#1b1d26', x + 5, y - 29, 2, 28);
    for (let k = 0; k < 6; k++){
      const ry = y - 27 + k * 4; px(g, '#4a5560', x - 6, ry, 11, 3);
      px(g, r() < 0.5 ? '#46e0ff' : '#4fbf45', x - 5, ry + 1, 1, 1); px(g, r() < 0.3 ? '#e8463a' : '#ffd21f', x - 3, ry + 1, 1, 1);
      px(g, '#1b1d26', x, ry + 1, 4, 1);
    }
    px(g, '#5f6b78', x - 8, y - 31, 16, 2);
  },
  dish(g, x, y, r){
    D2.shadow(g, x, y, 20);
    px(g, '#7d8794', x - 2, y - 16, 4, 16); px(g, '#5f6773', x - 6, y - 3, 12, 3);
    px(g, '#d9dde4', x - 12, y - 28, 24, 4); px(g, '#c3cbd6', x - 10, y - 24, 20, 4); px(g, '#9aa3ad', x - 7, y - 20, 14, 3);
    px(g, '#ffffff', x - 10, y - 28, 8, 2); px(g, '#7d8794', x - 1, y - 34, 2, 8); px(g, '#e8463a', x - 1, y - 35, 2, 2);
  },
  tower(g, x, y, r){
    D2.shadow(g, x, y, 16);
    for (let k = 0; k < 44; k++){ const w = Math.max(2, Math.round(14 - k * 0.28)); if (k % 6 === 0) px(g, '#9aa3ad', x - w / 2, y - k, w, 1); px(g, '#7d8794', x - w / 2, y - k, 1, 1); px(g, '#7d8794', x + w / 2 - 1, y - k, 1, 1); if (k % 6 === 3) px(g, '#5f6773', x - w / 2 + 1, y - k, w - 2, 1); }
    px(g, '#e8463a', x - 1, y - 46, 2, 2); px(g, '#c3cbd6', x - 6, y - 34, 3, 4); px(g, '#c3cbd6', x + 3, y - 26, 3, 4);
  },
  terminal(g, x, y, r){
    D2.shadow(g, x, y, 14);
    px(g, '#4a5560', x - 6, y - 14, 12, 14); px(g, '#2a3038', x - 7, y - 22, 14, 9); px(g, '#1b1d26', x - 6, y - 21, 12, 7);
    const c = r() < 0.5 ? '#46e0ff' : '#4fbf45';
    for (let k = 0; k < 3; k++) px(g, c, x - 5, y - 20 + k * 2, 3 + Math.floor(r() * 7), 1);
    px(g, '#9aa3ad', x - 5, y - 10, 10, 2);
  },
  // ---------- ciudad (Otaku) ----------
  building(g, x, y, r, w, h){
    const base = ['#c9a06a', '#9aa3ad', '#e0bf8c', '#8d97c8', '#d8a0b8', '#b8c8d8', '#a8d0b8'][Math.floor(r() * 7)];
    const L = x - w / 2, T = y - h;
    D2.shadow(g, x + 3, y, w + 4);
    px(g, base, L, T, w, h); px(g, shadeHex(base, -0.25), L + w - 5, T, 5, h); px(g, shadeHex(base, 0.25), L, T, w, 2);
    px(g, shadeHex(base, -0.4), L, T + 2, w, 1);
    for (let wy = T + 5; wy < y - 10; wy += 6) for (let wx = L + 3; wx < L + w - 7; wx += 5){
      const lit = r(); px(g, lit < 0.35 ? '#fff1a8' : lit < 0.5 ? '#ffd27a' : '#3a4050', wx, wy, 3, 4); px(g, 'rgba(255,255,255,0.35)', wx, wy, 1, 1);
    }
    px(g, shadeHex(base, -0.45), L + 2, y - 9, w - 4, 9);                                 // planta baja
    const aw = ['#e8463a', '#3f8fe0', '#4fbf45', '#ff7ac0'][Math.floor(r() * 4)];
    for (let k = 0; k < w - 4; k += 2) px(g, k % 4 ? aw : '#ffffff', L + 2 + k, y - 11, 2, 3);   // toldo a rayas
    px(g, '#3a4050', x - 2, y - 7, 4, 7); px(g, '#9fd2ff', L + 4, y - 7, 4, 4);
    if (r() < 0.6){ px(g, '#7d8794', L + 3, T - 4, 6, 4); px(g, '#9aa3ad', L + 4, T - 6, 4, 2); }   // depósito en el tejado
    if (r() < 0.5){ px(g, '#c3cbd6', L + w - 10, T - 3, 5, 3); }                          // aire acondicionado
    if (r() < 0.45){ const nc = r() < 0.5 ? '#ff7ac0' : '#46e0ff'; px(g, '#1b1d26', L - 2, T + 6, 4, 14); px(g, nc, L - 1, T + 7, 2, 12); }   // neón vertical
  },
  lamp(g, x, y){ px(g, '#3a4050', x, y - 16, 1, 16); px(g, '#3a4050', x, y - 16, 4, 1); px(g, '#fff1a8', x + 3, y - 15, 2, 2); },
  vending(g, x, y, r){ D2.shadow(g, x, y, 10); const c = r() < 0.5 ? '#e8463a' : '#3f8fe0'; px(g, c, x - 4, y - 14, 8, 14); px(g, '#d6f3ff', x - 3, y - 12, 6, 6); for (let k = 0; k < 3; k++) px(g, ['#ffd21f', '#4fbf45', '#ff7ac0'][k], x - 3 + k * 2, y - 11, 1, 2); px(g, '#1b1d26', x - 2, y - 4, 4, 2); },
  // ---------- Occult ----------
  grave(g, x, y, r){
    D2.shadow(g, x, y, 12);
    px(g, '#7d8794', x - 5, y - 13, 10, 13); px(g, '#7d8794', x - 4, y - 14, 8, 1); px(g, '#9aa3ad', x - 5, y - 13, 3, 12); px(g, '#5f6773', x - 2, y - 10, 4, 1); px(g, '#5f6773', x - 1, y - 12, 2, 5);
    px(g, '#3a5a3a', x - 6, y - 1, 12, 1);
  },
  candles(g, x, y, r){ for (let k = 0; k < 3; k++){ const cx = x - 4 + k * 4, h = 4 + k % 2 * 2; px(g, '#e8e4ff', cx, y - h, 2, h); px(g, '#ffd27a', cx, y - h - 2, 2, 2); px(g, 'rgba(255,200,120,0.35)', cx - 2, y - h - 4, 6, 5); } },
  shroom(g, x, y, r){ px(g, '#e8e4ff', x - 1, y - 4, 2, 4); px(g, '#9a55e0', x - 4, y - 7, 8, 3); px(g, '#c7a6ff', x - 2, y - 7, 2, 1); },
  // ---------- Shuriken ----------
  bamboo(g, x, y, r){
    for (let s = 0; s < 4; s++){ const bx = x - 6 + s * 4, h = 26 + Math.floor(r() * 16);
      for (let k = 0; k < h; k++) px(g, k % 7 === 0 ? '#1f4a2a' : '#2f6a3a', bx, y - k, 2, 1);
      px(g, '#3a8a4a', bx + 2, y - h + 4, 4, 1); px(g, '#3a8a4a', bx - 3, y - h + 9, 3, 1); }
  },
  stoneLantern(g, x, y){ D2.shadow(g, x, y, 12); px(g, '#7d8794', x - 2, y - 8, 4, 8); px(g, '#9aa3ad', x - 5, y - 13, 10, 5); px(g, '#ffd27a', x - 2, y - 12, 4, 3); px(g, '#7d8794', x - 6, y - 15, 12, 2); px(g, '#5f6773', x - 4, y - 17, 8, 2); },
  ninja(g, x, y){ D2.shadow(g, x, y, 10); px(g, '#15161c', x - 4, y - 12, 8, 12); px(g, '#15161c', x - 3, y - 18, 6, 6); px(g, '#d8321e', x - 3, y - 16, 6, 1); px(g, '#f3c9a0', x - 2, y - 15, 4, 1); px(g, '#d8321e', x + 3, y - 16, 3, 1); px(g, '#9aa3ad', x + 4, y - 10, 1, 7); },
  torii(g, x, y){ D2.shadow(g, x, y, 26); px(g, '#c8231a', x - 10, y - 24, 3, 24); px(g, '#c8231a', x + 7, y - 24, 3, 24); px(g, '#1b1d26', x - 14, y - 28, 28, 3); px(g, '#c8231a', x - 12, y - 25, 24, 2); px(g, '#c8231a', x - 9, y - 19, 18, 2); },
  // ---------- Farm ----------
  hayRound(g, x, y, r){ D2.shadow(g, x, y, 18); px(g, '#c9a03a', x - 8, y - 14, 16, 14); px(g, '#e0bf5a', x - 7, y - 13, 14, 4); px(g, '#a8862a', x - 8, y - 4, 16, 4); px(g, '#f0d070', x - 3, y - 11, 6, 6); px(g, '#c9a03a', x - 1, y - 9, 2, 2); },
  hayBlock(g, x, y, r){ D2.shadow(g, x, y, 22); px(g, '#d8b44a', x - 11, y - 10, 22, 10); px(g, '#f0d070', x - 11, y - 12, 22, 3); px(g, '#8a6a1a', x - 5, y - 12, 1, 12); px(g, '#8a6a1a', x + 4, y - 12, 1, 12); for (let k = 0; k < 5; k++) px(g, '#f0d070', x - 10 + Math.floor(r() * 20), y - 8 + Math.floor(r() * 6), 2, 1); },
  rocks(g, x, y, r){
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++){ const rx = x - 10 + Math.floor(r() * 20), ry = y - Math.floor(r() * 6), s = 4 + Math.floor(r() * 8);
      D2.shadow(g, rx, ry, s + 2); px(g, '#8d97a6', rx - s / 2, ry - s, s, s); px(g, '#c3cbd6', rx - s / 2 + 1, ry - s, Math.max(1, s / 2), 2); px(g, '#5f6773', rx, ry - s / 2, s / 2, s / 2); }
  },
  fence(g, x, y){ for (let k = 0; k < 3; k++) px(g, '#8a5a2e', x - 12 + k * 11, y - 10, 2, 10); px(g, '#a8763e', x - 12, y - 8, 24, 2); px(g, '#a8763e', x - 12, y - 4, 24, 2); },
  // ---------- Zeus ----------
  column(g, x, y, r, broken){
    const h = broken ? 18 : 40;
    D2.shadow(g, x + 2, y, 16);
    px(g, '#e6e0cc', x - 8, y - 4, 16, 4); px(g, '#ffffff', x - 8, y - 4, 16, 1);           // basa
    px(g, '#f4f0e2', x - 5, y - h, 10, h - 4); px(g, '#d8d0b8', x + 2, y - h, 3, h - 4);
    for (let k = -3; k <= 1; k += 2) px(g, '#d8d0b8', x + k, y - h + 2, 1, h - 7);          // estrías
    if (!broken){ px(g, '#ffffff', x - 8, y - h - 4, 16, 4); px(g, '#e0b012', x - 8, y - h - 1, 16, 1); px(g, '#ffffff', x - 7, y - h - 6, 14, 2); }   // capitel dorado
    else { px(g, '#d8d0b8', x - 5, y - h, 4, 2); px(g, '#e6e0cc', x + 6, y - 3, 6, 3); }
  },
  statue(g, x, y){ D2.shadow(g, x, y, 14); px(g, '#e6e0cc', x - 6, y - 8, 12, 8); px(g, '#e0b012', x - 6, y - 8, 12, 1); px(g, '#f4f0e2', x - 3, y - 22, 6, 14); px(g, '#f4f0e2', x - 2, y - 27, 4, 5); px(g, '#f4f0e2', x + 3, y - 22, 2, 8); px(g, '#d8d0b8', x + 1, y - 21, 2, 12); px(g, '#e0b012', x - 3, y - 28, 6, 1); },
  brazier(g, x, y){ D2.shadow(g, x, y, 10); px(g, '#a8862a', x - 1, y - 10, 2, 10); px(g, '#e0b012', x - 5, y - 14, 10, 4); px(g, '#ff8a2a', x - 3, y - 18, 6, 4); px(g, '#ffe27a', x - 1, y - 20, 2, 4); },
  olive(g, x, y, r){ D2.roundTree(g, x, y, { trunk:'#6b5a3a', leaf:['#8aa66a', '#6f8a52', '#b8cf94'], fruit:'#3a4a2a' }, r); },
};
/* ---- piezas GRANDES (v3): árboles grandes, edificios y máquinas que se vean ---- */
const D3 = {
  bigTree(g, x, y, r, c, s = 1){
    const W = Math.round(40 * s), H = Math.round(52 * s), tH = Math.round(16 * s);
    px(g, 'rgba(0,0,0,0.25)', x - W / 2 + 4, y - 3, W - 2, 5);
    // tronco con raíces
    px(g, c.trunk, x - 3 * s, y - tH, 6 * s, tH); px(g, shadeHex(c.trunk, -0.35), x + 1 * s, y - tH, 2 * s, tH);
    px(g, c.trunk, x - 6 * s, y - 3, 3 * s, 3); px(g, c.trunk, x + 3 * s, y - 3, 3 * s, 3);
    // copa: varias masas con borde oscuro, cuerpo y brillo
    const blobs = [[0, -H + 14 * s, 18 * s], [-10 * s, -H + 24 * s, 14 * s], [10 * s, -H + 24 * s, 14 * s], [0, -H + 30 * s, 16 * s], [-4 * s, -H + 8 * s, 11 * s]];
    const disc = (cx, cy, rr, col) => { for (let yy = -rr; yy <= rr; yy++){ const w = Math.round(Math.sqrt(rr * rr - yy * yy)); px(g, col, Math.round(x + cx - w), Math.round(y + cy + yy), w * 2, 1); } };
    for (const [bx, by, br] of blobs) disc(bx, by, br + 1, '#14161c');
    for (const [bx, by, br] of blobs) disc(bx, by, br, c.leaf[1]);
    for (const [bx, by, br] of blobs) disc(bx - br * 0.2, by - br * 0.2, br * 0.78, c.leaf[0]);
    for (const [bx, by, br] of blobs) disc(bx - br * 0.4, by - br * 0.45, br * 0.32, c.leaf[2]);
    for (let k = 0; k < 26 * s; k++) px(g, k % 2 ? c.leaf[1] : c.leaf[2], Math.round(x - 18 * s + r() * 36 * s), Math.round(y - H + 4 * s + r() * 40 * s), 2, 1);
    if (c.fruit) for (let k = 0; k < 6; k++) px(g, c.fruit, Math.round(x - 14 * s + r() * 28 * s), Math.round(y - H + 10 * s + r() * 28 * s), 2, 2);
  },
  bigPalm(g, x, y, r){
    px(g, 'rgba(0,0,0,0.22)', x - 6, y - 3, 30, 5);
    const lean = r() < 0.5 ? -1 : 1, h = 58;
    for (let k = 0; k < h; k++){ const tx = x + Math.round(lean * k * k / 220); px(g, '#14161c', tx - 3, y - k, 7, 1); px(g, k % 5 < 2 ? '#6b4423' : '#9a6a3a', tx - 2, y - k, 5, 1); }
    const tx = x + Math.round(lean * h * h / 220), ty = y - h;
    const frond = (ang, len, col) => { for (let k = 0; k < len; k++){ const fx = tx + Math.round(Math.cos(ang) * k), fy = ty + Math.round(Math.sin(ang) * k + k * k * 0.045); px(g, '#0d3a14', fx - 1, fy - 1, 5, 4); px(g, col, fx, fy, 3, 2); if (k % 3 === 1){ px(g, col, fx - 2, fy + 2, 2, 2); px(g, col, fx + 2, fy + 2, 2, 2); } } };
    for (let a = 0; a < 8; a++) frond(-Math.PI / 2 + (a - 3.5) * 0.48, 22, a % 2 ? '#1f8a2a' : '#2fae3a');
    for (let a = 0; a < 4; a++) frond(-Math.PI / 2 + (a - 1.5) * 0.6, 14, '#6fe05a');
    px(g, '#5a3a1e', tx - 3, ty + 1, 4, 4); px(g, '#7a4a22', tx + 1, ty + 2, 4, 4); px(g, '#5a3a1e', tx - 1, ty + 4, 4, 4);
  },
  // ---------- ciudad: edificio grande ----------
  bigBuilding(g, x, y, r){
    const w = 60 + Math.floor(r() * 4) * 8, h = 90 + Math.floor(r() * 5) * 14, L = Math.round(x - w / 2), T = y - h;
    const base = ['#c9a06a', '#9aa3b8', '#e0bf8c', '#8d97c8', '#d8a0b8', '#a8c0d0', '#b8d0a8'][Math.floor(r() * 7)], dark = shadeHex(base, -0.3), light = shadeHex(base, 0.2);
    px(g, 'rgba(0,0,0,0.3)', L + 6, y - 2, w + 4, 6);
    px(g, '#14161c', L - 1, T - 1, w + 2, h + 1);
    px(g, base, L, T, w, h); px(g, dark, L + w - 10, T, 10, h); px(g, light, L, T, 3, h);
    // azotea
    px(g, light, L, T, w, 3); px(g, '#14161c', L, T + 3, w, 1);
    px(g, '#7d8794', L + 5, T - 10, 12, 10); px(g, '#9aa3ad', L + 6, T - 12, 10, 3); px(g, '#5f6773', L + 7, T - 4, 2, 4); px(g, '#5f6773', L + 13, T - 4, 2, 4);   // depósito
    px(g, '#c3cbd6', L + w - 22, T - 5, 9, 5); px(g, '#9aa3ad', L + w - 21, T - 4, 2, 3);                                                                       // aire acondicionado
    px(g, '#5f6773', L + w / 2, T - 18, 1, 18); px(g, '#e8463a', L + w / 2 - 1, T - 19, 3, 2);                                                                 // antena
    // ventanas por plantas, con marco y reflejo
    for (let fy = T + 8, f = 0; fy < y - 26; fy += 11, f++){
      px(g, dark, L + 2, fy + 8, w - 4, 1);                                                      // cornisa de cada planta
      for (let wx = L + 5; wx < L + w - 12; wx += 9){
        const lit = r(); const col = lit < 0.35 ? '#fff1a8' : lit < 0.5 ? '#ffc86a' : lit < 0.62 ? '#9fd2ff' : '#3a4050';
        px(g, '#14161c', wx - 1, fy - 1, 7, 8); px(g, col, wx, fy, 5, 6); px(g, 'rgba(255,255,255,0.45)', wx, fy, 2, 1); px(g, '#14161c', wx + 2, fy, 1, 6);
      }
    }
    // planta baja: escaparate, toldo, puerta y cartel
    px(g, shadeHex(base, -0.45), L + 2, y - 24, w - 4, 24);
    px(g, '#14161c', L + 5, y - 18, w - 24, 14); px(g, '#9fd2ff', L + 6, y - 17, w - 26, 12); px(g, 'rgba(255,255,255,0.5)', L + 7, y - 16, 6, 2);
    const aw = ['#e8463a', '#3f8fe0', '#4fbf45', '#ff7ac0'][Math.floor(r() * 4)];
    for (let k = 0; k < w - 4; k += 4){ px(g, k % 8 ? aw : '#ffffff', L + 2 + k, y - 24, 4, 5); px(g, k % 8 ? shadeHex(aw, -0.3) : '#d9dde4', L + 2 + k, y - 20, 4, 1); }
    px(g, '#3a2a1a', L + w - 16, y - 16, 9, 16); px(g, '#ffd21f', L + w - 9, y - 9, 1, 1);      // puerta
    const sc = ['#ff7ac0', '#46e0ff', '#ffd21f'][Math.floor(r() * 3)];
    px(g, '#14161c', L + 6, y - 34, w - 18, 9); px(g, sc, L + 7, y - 33, w - 20, 7);
    for (let k = 0; k < (w - 26) / 5; k++) px(g, '#14161c', L + 10 + k * 5, y - 31, 3, 3);      // letras del cartel
    if (r() < 0.6){ px(g, '#14161c', L - 6, T + 14, 6, 34); const nc = r() < 0.5 ? '#ff7ac0' : '#46e0ff'; px(g, nc, L - 5, T + 15, 4, 32); for (let k = 0; k < 5; k++) px(g, '#ffffff', L - 4, T + 18 + k * 6, 2, 3); }   // neón vertical
  },
  // ---------- tecnología grande ----------
  bigServer(g, x, y, r){
    const w = 64, h = 72, L = x - w / 2, T = y - h;
    px(g, 'rgba(0,0,0,0.3)', L + 6, y - 2, w + 4, 6);
    px(g, '#14161c', L - 1, T - 1, w + 2, h + 1); px(g, '#2a3038', L, T, w, h); px(g, '#3a424c', L, T, w, 4);
    for (let c = 0; c < 4; c++){
      const cx = L + 3 + c * 15;
      px(g, '#1b1d26', cx, T + 7, 13, h - 12); px(g, '#4a5560', cx + 1, T + 8, 11, h - 14);
      for (let k = 0; k < 11; k++){ const ry = T + 10 + k * 5; px(g, '#2a3038', cx + 2, ry, 9, 4); px(g, r() < 0.6 ? '#46e0ff' : '#4fbf45', cx + 3, ry + 1, 1, 2); px(g, r() < 0.25 ? '#e8463a' : '#ffd21f', cx + 5, ry + 1, 1, 1); px(g, '#14161c', cx + 7, ry + 1, 3, 2); }
    }
    for (let k = 0; k < 3; k++){ const fx = L + 10 + k * 20; px(g, '#14161c', fx - 6, T - 6, 12, 6); px(g, '#5f6773', fx - 5, T - 5, 10, 5); px(g, '#2a3038', fx - 1, T - 5, 2, 5); px(g, '#2a3038', fx - 5, T - 3, 10, 1); }   // ventiladores
    for (let k = 0; k < 4; k++) px(g, k % 2 ? '#46e0ff' : '#ffd21f', L + 4 + k * 16, y - 3, 8, 1);
  },
  bigDish(g, x, y, r){
    px(g, 'rgba(0,0,0,0.3)', x - 22, y - 2, 50, 6);
    px(g, '#14161c', x - 5, y - 30, 10, 30); px(g, '#7d8794', x - 4, y - 30, 8, 30); px(g, '#5f6773', x + 1, y - 30, 3, 30);
    px(g, '#14161c', x - 16, y - 6, 32, 6); px(g, '#9aa3ad', x - 15, y - 5, 30, 5);
    const rows = [[56, 0], [54, 3], [50, 6], [44, 9], [36, 12], [24, 15]];
    for (const [w, dy] of rows){ px(g, '#14161c', x - w / 2 - 1, y - 62 + dy, w + 2, 4); px(g, '#e6ebf2', x - w / 2, y - 62 + dy, w, 3); px(g, '#c3cbd6', x + w / 4, y - 62 + dy, w / 4, 3); }
    px(g, '#ffffff', x - 22, y - 62, 14, 2);
    px(g, '#7d8794', x - 1, y - 78, 2, 18); px(g, '#7d8794', x - 14, y - 60, 14, 1); px(g, '#7d8794', x, y - 60, 14, 1);
    px(g, '#e8463a', x - 2, y - 80, 4, 3);
  },
  bigTower(g, x, y, r){
    const h = 120;
    px(g, 'rgba(0,0,0,0.25)', x - 14, y - 2, 34, 5);
    for (let k = 0; k < h; k++){
      const w = Math.max(4, Math.round(30 - k * 0.22)), L = x - w / 2;
      px(g, '#5f6773', L, y - k, 2, 1); px(g, '#5f6773', L + w - 2, y - k, 2, 1);
      if (k % 10 === 0) px(g, '#9aa3ad', L, y - k, w, 2);
      if (k % 10 === 5){ for (let q = 0; q < w; q += 2) px(g, '#7d8794', L + q, y - k + (q % 4 ? 1 : 0), 1, 1); }
    }
    for (const [dy, side] of [[40, -1], [70, 1], [95, -1]]){ px(g, '#14161c', x + side * 8 - 4, y - dy - 1, 8, 12); px(g, '#d9dde4', x + side * 8 - 3, y - dy, 6, 10); }   // antenas de panel
    px(g, '#e8463a', x - 2, y - h - 4, 4, 4); px(g, '#ffffff', x - 1, y - h - 4, 1, 1);
  },
  bigScreen(g, x, y, r){
    const w = 70, h = 46, L = x - w / 2, T = y - h - 24;
    px(g, 'rgba(0,0,0,0.3)', L + 6, y - 2, w, 6);
    px(g, '#14161c', x - 5, T + h, 10, 24); px(g, '#5f6773', x - 4, T + h, 8, 24);
    px(g, '#14161c', L - 2, T - 2, w + 4, h + 4); px(g, '#3a424c', L - 1, T - 1, w + 2, h + 2); px(g, '#0b1a24', L + 2, T + 2, w - 4, h - 4);
    for (let k = 0; k < 9; k++){ const yy = T + 5 + k * 4; px(g, k % 3 ? '#46e0ff' : '#4fbf45', L + 5, yy, 8 + Math.floor(r() * 40), 2); }   // código
    for (let k = 0; k < 6; k++){ const bh = 4 + Math.floor(r() * 16); px(g, '#ffd21f', L + w - 28 + k * 4, T + h - 6 - bh, 3, bh); }         // gráfico de barras
  },
  // ---------- Zeus (gris y blanco) ----------
  bigColumn(g, x, y, r, broken){
    const h = broken ? 26 : 66;
    px(g, 'rgba(0,0,0,0.25)', x - 8, y - 2, 22, 5);
    px(g, '#14161c', x - 11, y - 7, 22, 7); px(g, '#c9ccd2', x - 10, y - 6, 20, 6); px(g, '#e9ebef', x - 10, y - 6, 20, 2);
    px(g, '#14161c', x - 8, y - h - 1, 16, h - 5); px(g, '#e9ebef', x - 7, y - h, 14, h - 7); px(g, '#b8bcc4', x + 3, y - h, 4, h - 7);
    for (let k = -5; k <= 1; k += 3) px(g, '#c9ccd2', x + k, y - h + 3, 1, h - 12);                 // estrías
    if (!broken){
      px(g, '#14161c', x - 12, y - h - 8, 24, 9); px(g, '#f4f5f7', x - 11, y - h - 7, 22, 7); px(g, '#c9ccd2', x - 11, y - h - 2, 22, 1);
      px(g, '#9aa0a8', x - 13, y - h - 6, 3, 3); px(g, '#9aa0a8', x + 10, y - h - 6, 3, 3);            // volutas
    } else { px(g, '#c9ccd2', x - 7, y - h, 5, 3); px(g, '#14161c', x + 8, y - 5, 10, 5); px(g, '#e9ebef', x + 9, y - 4, 8, 4); }
  },
  temple(g, x, y, r){                                   // frontón griego sobre columnas
    const w = 96, L = x - w / 2;
    for (let k = 0; k < 4; k++) D3.bigColumn(g, L + 12 + k * 24, y, r, false);
    px(g, '#14161c', L - 2, y - 82, w + 4, 8); px(g, '#e9ebef', L - 1, y - 81, w + 2, 6); px(g, '#c9ccd2', L - 1, y - 77, w + 2, 2);
    for (let k = 0; k < 18; k++){ const ww = w + 2 - k * 5.6; px(g, '#14161c', x - ww / 2 - 1, y - 83 - k, ww + 2, 1); px(g, k < 2 ? '#c9ccd2' : '#f4f5f7', x - ww / 2, y - 83 - k, ww, 1); }
    px(g, '#d4b84a', x - 6, y - 92, 12, 3);                                                            // un detalle dorado pequeño
  },
  statue(g, x, y){
    px(g, 'rgba(0,0,0,0.25)', x - 10, y - 2, 24, 5);
    px(g, '#14161c', x - 11, y - 15, 22, 15); px(g, '#c9ccd2', x - 10, y - 14, 20, 14); px(g, '#e9ebef', x - 10, y - 14, 20, 2);
    px(g, '#14161c', x - 6, y - 50, 12, 36); px(g, '#e9ebef', x - 5, y - 49, 10, 34); px(g, '#c9ccd2', x + 2, y - 49, 3, 34);
    px(g, '#14161c', x - 4, y - 59, 8, 10); px(g, '#f4f5f7', x - 3, y - 58, 6, 8);
    px(g, '#e9ebef', x + 5, y - 56, 3, 14); px(g, '#e9ebef', x + 5, y - 58, 7, 3);                    // brazo levantado
    px(g, '#c9ccd2', x - 5, y - 30, 10, 2);
  },
  urn(g, x, y){ px(g, 'rgba(0,0,0,0.2)', x - 6, y - 2, 14, 4); px(g, '#14161c', x - 6, y - 16, 12, 16); px(g, '#e9ebef', x - 5, y - 15, 10, 14); px(g, '#c9ccd2', x + 1, y - 15, 4, 14); px(g, '#9aa0a8', x - 5, y - 10, 10, 2); },
};
/* suelo de fuera con textura de cada tema */
function drawThemeGround(g, TH, O, seed){
  const C = CAMPUS, T = TILE_SRC, Wt = (C.cols + 2 * C.border) * T, Ht = (C.rows + 2 * C.border) * T, W0 = C.cols * T, H0 = C.rows * T;
  const inField = (x, y, m = 0) => x > O - m && x < O + W0 + m && y > O - m && y < O + H0 + m;
  const r = rngFrom(seed);
  // todo el suelo de fuera se pinta recortado: nunca toca el campo
  g.save(); g.beginPath(); g.rect(0, 0, Wt, Ht); g.rect(O - 6, O - 6, W0 + 12, H0 + 12); g.clip('evenodd');
  const spots = (n, cols, wMax, hMax) => { for (let k = 0; k < n; k++){ const x = Math.floor(r() * Wt), y = Math.floor(r() * Ht); if (inField(x, y, 10)) continue; px(g, cols[k % cols.length], x, y, 1 + Math.floor(r() * wMax), 1 + Math.floor(r() * hMax)); } };
  switch (TH.decor){
    case 'jungle': spots(5000, ['#1f7a2a', '#3a9a3a', '#2a6a22', '#5fbf4a', '#174a1a'], 3, 2); break;
    case 'trees':  spots(2600, ['#3a2a4a', '#4a3a5a', '#2a3a30', '#5a3a7a'], 4, 2); break;
    case 'ninja':  spots(2600, ['#2a302a', '#141814', '#2f3a30'], 4, 2); break;
    case 'farm':
      for (let y = 0; y < Ht; y += 6) for (let x = 0; x < Wt; x += 4){ if (inField(x, y, 6)) continue; if ((Math.floor(y / 6) + Math.floor(x / 160)) % 2) px(g, 'rgba(120,80,30,0.25)', x, y, 4, 2); }   // surcos
      spots(2400, ['#8a6a3a', '#c9a03a', '#7d8794', '#a8763e'], 3, 2); break;
    case 'tech':
      for (let y = 0; y < Ht; y += 32) px(g, 'rgba(0,0,0,0.18)', 0, y, Wt, 1);
      for (let x = 0; x < Wt; x += 32) px(g, 'rgba(0,0,0,0.18)', x, 0, 1, Ht);
      for (let k = 0; k < 90; k++){ const x = Math.floor(r() * Wt / 32) * 32, y = Math.floor(r() * Ht); if (inField(x, y, 8)) continue; px(g, '#2a3038', x - 1, y, 3, 26); px(g, k % 2 ? '#46e0ff' : '#4fbf45', x, y + 12, 1, 2); }   // cables
      break;
    case 'city': {
      for (let y = 0; y < Ht; y += 64){ px(g, '#4a4f58', 0, y, Wt, 12); for (let x = 0; x < Wt; x += 12) px(g, '#e8e4c0', x, y + 6, 6, 1); px(g, '#b8bcc4', 0, y + 12, Wt, 2); }   // calles con línea discontinua
      for (let x = 0; x < Wt; x += 96){ px(g, '#4a4f58', x, 0, 12, Ht); px(g, '#b8bcc4', x + 12, 0, 2, Ht); }
      break;
    }
    case 'greek':
      for (let y = 0; y < Ht; y += 16) for (let x = (y / 16 % 2) * 8; x < Wt; x += 16){ px(g, 'rgba(90,96,110,0.22)', x, y, 16, 1); px(g, 'rgba(90,96,110,0.22)', x, y, 1, 16); px(g, 'rgba(255,255,255,0.25)', x + 1, y + 1, 6, 1); }   // losas de mármol gris
      spots(900, ['#b8bcc4', '#e9ebef', '#a0a6b0'], 3, 1); break;
    case 'royal':
      spots(500, ['#2a3040', '#3a4458', '#ffffff'], 1, 1); break;
    case 'stands':
      spots(1600, ['#6a7078', '#4a5058'], 3, 2); break;
  }
  g.restore();
}
/* reparte y dibuja las piezas grandes del tema (ordenadas por y) */
function drawThemeObjects(g, TH, O, seed){
  const C = CAMPUS, T = TILE_SRC, Wt = (C.cols + 2 * C.border) * T, Ht = (C.rows + 2 * C.border) * T, W0 = C.cols * T, H0 = C.rows * T;
  const stands = TH.stands ? 70 : 22;
  const oW = TH.objW || 30, oH = TH.objH || 40;
  // la caja del objeto (ancho oW, alto oH sobre su base) no puede tocar el campo ni las gradas
  const blocked = (x, y) => x + oW / 2 > O - stands - 6 && x - oW / 2 < O + W0 + stands + 6 && y > O - stands - 4 && y - oH < O + H0 + stands + 6;
  const r = rngFrom(seed * 7 + 3), items = [];
  const step = TH.step || 26;
  for (let gy = 0; gy < Ht + 40; gy += step) for (let gx = 0; gx < Wt; gx += step){
    const x = gx + Math.floor(r() * step * 0.8), y = gy + Math.floor(r() * step * 0.8);
    if (blocked(x, y) || r() > (TH.density || 0.7)) continue;
    items.push({ x, y, v: r() });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items){
    const { x, y, v } = it, rr = rngFrom(Math.floor(v * 1e6) + 1);
    switch (TH.decor){
      case 'trees':  v < 0.6 ? D3.bigTree(g, x, y, rr, { trunk:'#3a2a40', leaf:['#8a4fc8', '#5a2a90', '#c9a0f0'] }) : v < 0.8 ? D2.grave(g, x, y, rr) : v < 0.92 ? D2.candles(g, x, y, rr) : D2.shroom(g, x, y, rr); break;
      case 'jungle': v < 0.35 ? D3.bigPalm(g, x, y, rr) : v < 0.62 ? D3.bigTree(g, x, y, rr, { trunk:'#5a3a1e', leaf:['#2fae3a', '#147a2a', '#7be05a'], fruit:'#ff6b5e' }, 1.1) : v < 0.84 ? D2.fern(g, x, y, rr) : D2.flowerBush(g, x, y, rr); break;
      case 'tech':   v < 0.32 ? D3.bigServer(g, x, y, rr) : v < 0.55 ? D3.bigDish(g, x, y, rr) : v < 0.75 ? D3.bigTower(g, x, y, rr) : D3.bigScreen(g, x, y, rr); break;
      case 'city':   v < 0.82 ? D3.bigBuilding(g, x, y, rr) : v < 0.92 ? D2.vending(g, x, y, rr) : D2.lamp(g, x, y); break;
      case 'ninja':  v < 0.35 ? D2.bamboo(g, x, y, rr) : v < 0.55 ? D3.bigTree(g, x, y, rr, { trunk:'#2a1a12', leaf:['#1d4430', '#10281a', '#2f6a4a'] }, 0.9) : v < 0.7 ? D2.stoneLantern(g, x, y) : v < 0.85 ? D2.ninja(g, x, y) : D2.torii(g, x, y); break;
      case 'farm':   v < 0.38 ? D2.rocks(g, x, y, rr) : v < 0.62 ? D2.hayRound(g, x, y, rr) : v < 0.84 ? D2.hayBlock(g, x, y, rr) : D2.fence(g, x, y); break;
      case 'greek':  v < 0.45 ? D3.bigColumn(g, x, y, rr, v < 0.12) : v < 0.58 ? D3.statue(g, x, y) : v < 0.66 ? D3.temple(g, x, y, rr) : v < 0.8 ? D3.urn(g, x, y) : D3.bigTree(g, x, y, rr, { trunk:'#6b5a3a', leaf:['#a8b49a', '#848f78', '#cfd8c2'] }, 0.9); break;
      case 'stands': v < 0.75 ? D3.bigTree(g, x, y, rr, { trunk:'#5a3a1e', leaf:['#4f8a4f', '#3f7a3f', '#7ab06a'] }, 0.95) : D2.lamp(g, x, y); break;
      case 'royal':  break;
    }
  }
  // Zeus: columnata alrededor del estadio
  if (TH.decor === 'greek'){
    const W0p = W0 + 60, gap = 36;
    for (let x = O - 30; x <= O + W0p - 30; x += gap + 12){ D3.bigColumn(g, x, O - 30, r, false); }
    for (let x = O - 30; x <= O + W0p - 30; x += gap + 12){ D3.bigColumn(g, x, O + H0 + 92, r, false); }
  }
}

/* ======================================================================
   SPRITES DE DECORADO (v4): pocas piezas y bien trabajadas
   Cada sprite se genera píxel a píxel con sombreado de 4 tonos (luz
   arriba a la izquierda) y contorno oscuro, y se reutiliza.
   ====================================================================== */
const OUTLINE = '#14161c';
function genSprite(w, h, paint){
  const cv = document.createElement('canvas'); cv.width = w + 2; cv.height = h + 2;
  const g = cv.getContext('2d'), grid = [];
  for (let y = 0; y < h; y++){ grid.push([]); for (let x = 0; x < w; x++) grid[y].push(paint(x, y) || null); }
  const at = (x, y) => (y >= 0 && y < h && x >= 0 && x < w) ? grid[y][x] : null;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++){
    let c = at(x, y);
    if (!c && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) c = OUTLINE;
    if (c){ g.fillStyle = c; g.fillRect(x + 1, y + 1, 1, 1); }
  }
  return cv;
}
const hash2 = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
/* tono según la normal de una esfera (luz arriba-izquierda) */
function shade4(nx, ny, pal, dither){
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  let l = (-0.55 * nx - 0.65 * ny + 0.52 * nz);
  l += (dither - 0.5) * 0.18;
  return l > 0.62 ? pal[3] : l > 0.32 ? pal[2] : l > 0.02 ? pal[1] : pal[0];
}
/* copa de árbol: varias bolas con sombreado propio y borde "de hojas" */
function treeSprite(pal, trunk, W = 34, H = 44, opts = {}){
  const blobs = opts.blobs || [[17, 13, 11], [9, 19, 8.5], [25, 19, 8.5], [17, 23, 10], [12, 10, 7], [23, 11, 7]];
  const trunkTop = H - 14;
  return genSprite(W, H, (x, y) => {
    // copa
    let best = null, bd = 9;
    for (const [cx, cy, r] of blobs){
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d = dx * dx + dy * dy;
      const edge = 1 + (hash2(x, y) - 0.5) * 0.22;                    // borde irregular de hojas
      if (d < edge && cy - (y + 0.5) > -r * 2 && d < bd){ bd = d; best = [dx, dy]; }
    }
    if (best){
      const c = shade4(best[0] * 0.95, best[1] * 0.95, pal, hash2(x * 3, y * 7));
      if (opts.fruit && hash2(x * 11, y * 5) > 0.975) return opts.fruit;
      return c;
    }
    // tronco con raíces
    const tx = W / 2;
    if (y >= trunkTop - 4 && y < H){
      const half = 2.5 + (y > H - 4 ? (y - (H - 4)) * 1.2 : 0);
      if (Math.abs(x + 0.5 - tx) < half){ const rel = (x + 0.5 - (tx - half)) / (2 * half); return rel < 0.3 ? trunk[2] : rel < 0.7 ? trunk[1] : trunk[0]; }
    }
    return null;
  });
}
function palmSprite(){
  const W = 44, H = 58;
  return genSprite(W, H, (x, y) => {
    // hojas: arcos gruesos que caen desde la corona
    const cx = 22, cy = 14;
    const fronds = [[-1, -0.25], [1, -0.25], [-0.85, 0.35], [0.85, 0.35], [-0.35, -0.9], [0.35, -0.9], [0, -1]];
    for (const [dx, dy] of fronds){
      for (let k = 0; k <= 20; k++){
        const fx = cx + dx * k, fy = cy + dy * k + k * k * 0.035;
        const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy), wdt = 2.6 - k * 0.07;
        if (d < wdt){ const side = ((x + 0.5 - fx) * dy - (y + 0.5 - fy) * dx); return k < 3 ? '#2a7a2a' : side > 0.3 ? '#1d6a24' : side < -0.6 ? '#7be05a' : '#3aa83a'; }
      }
    }
    // cocos
    if (Math.hypot(x + 0.5 - 20, y + 0.5 - 17) < 2.2 || Math.hypot(x + 0.5 - 24, y + 0.5 - 18) < 2.2) return (x + y) % 3 ? '#6b4423' : '#8a5a2e';
    // tronco curvado con anillos
    if (y > 16){ const t = (y - 16) / (H - 16), tx = 22 + Math.sin(t * 1.6) * 5, half = 2.2 + t * 1.2;
      if (Math.abs(x + 0.5 - tx) < half){ const ring = (y % 4 === 0); const rel = (x + 0.5 - (tx - half)) / (2 * half); return ring ? '#5a3a1e' : rel < 0.35 ? '#c08a52' : rel < 0.7 ? '#9a6a3a' : '#6b4423'; } }
    return null;
  });
}
function haySprite(){
  const W = 30, H = 22;
  return genSprite(W, H, (x, y) => {
    const fx = 8, fy = 11, r = 9.5;                                   // cara redonda (espiral)
    const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
    if (d < r){ const ring = Math.floor(d * 1.1 + Math.atan2(y + 0.5 - fy, x + 0.5 - fx) * 0.5) % 3; return d > r - 1.5 ? '#a8862a' : ring === 0 ? '#c9a03a' : ring === 1 ? '#e8c45a' : '#f6dc80'; }
    if (x >= fx && x < W - 1 && Math.abs(y + 0.5 - fy) < r){       // cuerpo del rollo
      const ny = (y + 0.5 - fy) / r; const strand = hash2(x * 5, y) > 0.8;
      if (x === 18 || x === 19) return '#7a5a1a';                       // cuerda
      return strand ? '#f6dc80' : ny < -0.45 ? '#f0d070' : ny < 0.3 ? '#d8b44a' : '#a8862a';
    }
    return null;
  });
}
function dishSprite(){
  const W = 40, H = 48;
  return genSprite(W, H, (x, y) => {
    const X = x + 0.5, Y = y + 0.5;
    // plato: elipse inclinada
    const dx = (X - 20) / 18, dy = (Y - 16) / 11;
    if (dx * dx + dy * dy < 1){
      const inner = (X - 21) * (X - 21) / (14 * 14) + (Y - 17.5) * (Y - 17.5) / (8 * 8) < 1;
      if (!inner) return dy < -0.3 ? '#ffffff' : '#c3cbd6';                              // borde
      const l = -(X - 21) / 14 - (Y - 17.5) / 8;
      return l > 0.6 ? '#9aa3ad' : l > -0.2 ? '#d9dde4' : '#eef1f5';                       // interior cóncavo
    }
    // brazo y receptor
    if (Math.abs(X - 21) < 1 && Y > 6 && Y < 18) return '#7d8794';
    if (Math.hypot(X - 21, Y - 5) < 2.4) return Y < 5 ? '#ff6b5e' : '#c8231a';
    // soporte y base
    if (Y > 26 && Y < 42 && Math.abs(X - 20) < 2.5) return X < 19.5 ? '#c3cbd6' : X < 21 ? '#9aa3ad' : '#7d8794';
    if (Y > 26 && Y < 32 && Math.abs(X - 20 - (Y - 26) * 1.2) < 1) return '#7d8794';
    if (Y > 41 && Y < 47 && Math.abs(X - 20) < 9) return Y < 43 ? '#d9dde4' : X < 14 ? '#c3cbd6' : '#9aa3ad';
    return null;
  });
}
function columnSprite(){
  const W = 22, H = 64;
  return genSprite(W, H, (x, y) => {
    const X = x + 0.5;
    if (y < 4) return y < 1 ? '#ffffff' : y < 3 ? '#e9ebef' : '#b8bcc4';                       // ábaco
    if (y < 8){ if (X < 3 || X > W - 3){ return '#c9ccd2'; } return y < 6 ? '#f4f5f7' : '#c9ccd2'; }   // equino con volutas
    if (y >= H - 6) return y < H - 5 ? '#ffffff' : y < H - 3 ? '#e9ebef' : '#b8bcc4';           // basa
    if (y >= H - 9){ if (X < 3 || X > W - 3) return null; return '#d9dce2'; }
    if (X < 4 || X > W - 4) return null;                                                          // fuste
    const rel = (X - 4) / (W - 8), flute = Math.floor((X - 4) / 2.5) % 2 === 1;
    if (rel < 0.18) return '#ffffff'; if (rel > 0.8) return '#a8acb4';
    return flute ? (rel > 0.55 ? '#c3c7ce' : '#d9dce2') : (rel > 0.55 ? '#d4d7dd' : '#eef0f3');
  });
}
function lampSprite(){
  const W = 18, H = 52;
  return genSprite(W, H, (x, y) => {
    const X = x + 0.5;
    if (Math.hypot(X - 13, y + 0.5 - 7) < 4.5) return y < 6 ? '#fff6c2' : '#ffd27a';             // bombilla
    if (y >= 2 && y < 5 && X > 7 && X < 18) return y < 3 ? '#5f6773' : '#3a404a';               // capuchón
    if (y >= 4 && y < 6 && X > 4 && X < 10) return '#3a404a';                                   // brazo
    if (y >= 4 && y < H - 4 && X > 3 && X < 7) return X < 5 ? '#7d8794' : '#4a505a';            // poste
    if (y >= H - 4 && X > 1 && X < 9) return y < H - 3 ? '#7d8794' : '#4a505a';                  // base
    return null;
  });
}
const DECO_SPR = {};
function decoSprite(key){
  if (DECO_SPR[key]) return DECO_SPR[key];
  const S = {
    tree:       () => treeSprite(['#2a6a2a', '#3f8f3a', '#5fb34a', '#9ad86a'], ['#4a2e18', '#6b4423', '#8a5a2e']),
    purpleTree: () => treeSprite(['#3a1a5a', '#5a2a90', '#8a4fc8', '#c9a0f0'], ['#2a1a2a', '#3a2a40', '#5a4060']),
    darkTree:   () => treeSprite(['#0d2016', '#183a25', '#265a38', '#3f7a52'], ['#1a120c', '#2a1a12', '#3a2a1a']),
    jungleTree: () => treeSprite(['#0f5a1a', '#1f8a2a', '#3ab53a', '#7be05a'], ['#3a2412', '#5a3a1e', '#7a4f28'], 38, 48, { fruit:'#ff6b5e', blobs:[[19, 13, 12], [9, 21, 9], [29, 21, 9], [19, 25, 11], [12, 9, 8], [26, 10, 8]] }),
    oliveTree:  () => treeSprite(['#5a6650', '#7d8a70', '#a8b49a', '#d4dccb'], ['#4a3e2a', '#6b5a3a', '#8a7a5a']),
    palm: palmSprite, hay: haySprite, dish: dishSprite, column: columnSprite, lamp: lampSprite,
  };
  return (DECO_SPR[key] = S[key]());
}
/* coloca un sprite con su base en (x, y) y una sombra suave */
function stamp(g, key, x, y){
  const s = decoSprite(key);
  px(g, 'rgba(0,0,0,0.22)', Math.round(x - s.width * 0.35), Math.round(y - 2), Math.round(s.width * 0.75), 4);
  g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height));
}
/* posiciones fijas y espaciadas alrededor del estadio (fracciones del borde) */
function decoSpots(O, W0, H0, B, n, seed, pad = 30){
  const r = rngFrom(seed), out = [];
  const sides = ['top', 'bottom', 'left', 'right'];
  for (let i = 0; i < n; i++){
    const side = sides[i % 4], t = (Math.floor(i / 4) + 0.5 + (r() - 0.5) * 0.5) / Math.ceil(n / 4);
    const depth = pad + 24 + r() * 80;                     // cerca de la valla, para que se vean al jugar
    if (side === 'top') out.push([O + t * W0, O - depth]);
    else if (side === 'bottom') out.push([O + t * W0, O + H0 + depth + 40]);
    else if (side === 'left') out.push([O - depth, O + 40 + t * (H0 - 20)]);
    else out.push([O + W0 + depth, O + 40 + t * (H0 - 20)]);
  }
  return out.sort((a, b) => a[1] - b[1]);
}
/* decorado sencillo del tema: suelo liso + unas pocas piezas */
function drawThemeSimple(g, TH, O){
  const C = CAMPUS, T = TILE_SRC, B = C.border * T, W0 = C.cols * T, H0 = C.rows * T, Wt = W0 + 2 * B, Ht = H0 + 2 * B;
  g.save(); g.beginPath(); g.rect(0, 0, Wt, Ht); g.rect(O - 6, O - 6, W0 + 12, H0 + 12); g.clip('evenodd');
  if (TH.floor === 'tiles'){                                                                 // losas (acera, mármol, suelo técnico)
    const s = TH.tile || 24;
    for (let y = 0; y < Ht; y += s) for (let x = ((y / s) % 2) * (TH.offset ? s / 2 : 0); x < Wt; x += s){
      px(g, TH.tileLine, x, y, s, 1); px(g, TH.tileLine, x, y, 1, s);
      if (TH.tileHi) px(g, TH.tileHi, x + 1, y + 1, s - 2, 1);
    }
  }
  if (TH.floor === 'grass'){                                                                 // césped con zonas, briznas y flores
    const r = rngFrom(77), G = TH.grass || {};
    const light = G.light || shadeHex(TH.outside, 0.12), dark = G.dark || shadeHex(TH.outside, -0.14);
    for (let k = 0; k < 70; k++){                                                             // manchas grandes de luz y sombra
      const cx = r() * Wt, cy = r() * Ht, rw = 18 + r() * 40, rh = 10 + r() * 22, col = k % 2 ? light : dark;
      for (let yy = -rh; yy <= rh; yy += 2){ const w = Math.round(rw * Math.sqrt(1 - (yy / rh) ** 2)); px(g, col, Math.round(cx - w), Math.round(cy + yy), w * 2, 2); }
    }
    for (let k = 0; k < 6000; k++){                                                           // briznas en "v"
      const x = Math.floor(r() * Wt), y = Math.floor(r() * Ht), c = k % 3 ? TH.tuft : light;
      px(g, c, x, y, 1, 2); px(g, c, x + 1, y - 1, 1, 2); px(g, c, x + 2, y, 1, 2);
    }
    if (G.flowers) for (let k = 0; k < 140; k++){                                             // florecillas
      const x = Math.floor(r() * Wt), y = Math.floor(r() * Ht), c = G.flowers[k % G.flowers.length];
      px(g, c, x, y, 2, 2); px(g, '#ffe27a', x, y, 1, 1);
    }
  }
  if (TH.floor === 'tiles' && TH.extra){                                                     // detalles de las losas
    const r = rngFrom(55);
    for (let k = 0; k < 220; k++){
      const x = Math.floor(r() * Wt), y = Math.floor(r() * Ht);
      if (TH.extra === 'cracks'){ px(g, TH.tileLine, x, y, 3, 1); px(g, TH.tileLine, x + 2, y + 1, 2, 1); px(g, TH.tileLine, x + 4, y + 2, 1, 2); }
      if (TH.extra === 'veins'){ px(g, 'rgba(120,128,140,0.25)', x, y, 5, 1); px(g, 'rgba(120,128,140,0.25)', x + 4, y + 1, 4, 1); }
      if (TH.extra === 'tech' && k < 90){ const tx = Math.floor(x / 32) * 32 + 15; px(g, '#4a505a', tx, y, 2, 12); }
    }
  }
  g.restore();
  // reparto con separación mínima entre piezas (no se amontonan)
  const all = [], pad = TH.stands ? 80 : 30, minSep = TH.sep || 52;
  for (const [key, n, seed] of (TH.items || [])){
    const r = rngFrom(seed);
    for (let i = 0, tries = 0; i < n && tries < n * 80; tries++){
      const side = Math.floor(r() * 4), t = r(), depth = pad + 26 + r() * 130;
      const x = side === 0 || side === 1 ? O + t * W0 : side === 2 ? O - depth : O + W0 + depth;
      const y = side === 0 ? O - depth : side === 1 ? O + H0 + depth + 40 : O + 40 + t * (H0 - 20);
      if (all.some(([, ax, ay]) => Math.hypot(ax - x, (ay - y) * 1.3) < minSep)) continue;
      all.push([key, x, y]); i++;
    }
  }
  all.sort((a, b) => a[2] - b[2]);
  for (const [key, x, y] of all) stamp(g, key, x, y);
}

/* ---- suelo: tierra dentro de las vallas, césped fuera ---- */
function drawPitchGround(g, useTiles, O, TH = FIELD_THEMES.Raimon){
  const T = TILE_SRC, C = CAMPUS, B = C.border;
  for (let y = 0; y < C.rows + 2 * B; y++) for (let x = 0; x < C.cols + 2 * B; x++){
    const inside = x >= B && x < B + C.cols && y >= B && y < B + C.rows;
    if (inside && TH.ground){                                     // césped/arena del tema, con franjas de corte
      px(g, (Math.floor((x - B) / 4) % 2) ? TH.stripes : TH.ground, x * T, y * T, T, T);
      if (tileVar(x, y) % 4 === 0) px(g, 'rgba(0,0,0,0.05)', x * T + (tileVar(y, x) % 12), y * T + 6, 3, 1);
      continue;
    }
    if (!inside && TH.outside){ px(g, TH.outside, x * T, y * T, T, T); continue; }   // fuera del campo: color liso del tema
    if (useTiles){
      const list = inside ? CT.dirt : CT.grass;
      const [c, r] = list[tileVar(x, y) % list.length];
      putTile(g, c, r, x * T, y * T);
    } else {
      px(g, inside ? PAL.dirt : PAL.grass, x * T, y * T, T, T);
      if (tileVar(x, y) % 3 === 0) px(g, 'rgba(0,0,0,0.06)', x * T + 4, y * T + 9, 2, 1);
    }
  }
  if (TH.ground) return;
  // la tierra del Raimon es más clara y con manchas
  const W0 = C.cols * T, H0 = C.rows * T;
  px(g, PAL.sandTint, O, O, W0, H0);
  for (let k = 0; k < 260; k++){
    const v = tileVar(k * 13, k * 7);
    const x = O + (v * 37 + k * 91) % W0, y = O + (v * 53 + k * 17) % H0;
    px(g, k % 3 ? 'rgba(120,80,40,0.07)' : 'rgba(255,240,210,0.12)', x, y, 6 + v % 14, 2 + v % 4);
  }
}

/* ---- líneas del campo (medidas reales: 105 × 68 m) ---- */
function drawPitchLines(g, O){
  const p = CAMPUS.pitch, L = PAL.line;
  const x = O + Math.round(p.x / PX), y = O + Math.round(p.y / PX), w = Math.round(p.w / PX), h = Math.round(p.h / PX);
  const mx = w / 105, my = h / 68, cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
  pixelFrame(g, L, x, y, w, h);
  px(g, L, cx, y, 1, h);
  const rc = Math.round(9.15 * my);
  pixelArc(g, L, cx, cy, rc);
  px(g, L, cx - 1, cy - 1, 3, 3);
  const pa = { d: Math.round(16.5 * mx), w: Math.round(40.3 * my) };   // área grande
  const ga = { d: Math.round(5.5 * mx),  w: Math.round(18.3 * my) };   // área pequeña
  const spot = Math.round(11 * mx);
  for (const side of [0, 1]){
    const ax = side ? x + w - pa.d : x, gx = side ? x + w - ga.d : x;
    pixelFrame(g, L, ax, cy - Math.round(pa.w / 2), pa.d + (side ? 0 : 1), pa.w);
    pixelFrame(g, L, gx, cy - Math.round(ga.w / 2), ga.d + (side ? 0 : 1), ga.w);
    const sx = side ? x + w - spot : x + spot;
    px(g, L, sx - 1, cy - 1, 2, 2);                                       // punto de penalti
    pixelArc(g, L, sx, cy, rc, (qx) => side ? qx < x + w - pa.d : qx > x + pa.d);   // semicírculo del área
  }
  const rk = Math.round(1 * mx) + 2;                                      // arcos de córner
  pixelArc(g, L, x, y, rk, (qx, qy) => qx >= x && qy >= y);
  pixelArc(g, L, x + w - 1, y, rk, (qx, qy) => qx <= x + w - 1 && qy >= y);
  pixelArc(g, L, x, y + h - 1, rk, (qx, qy) => qx >= x && qy <= y + h - 1);
  pixelArc(g, L, x + w - 1, y + h - 1, rk, (qx, qy) => qx <= x + w - 1 && qy <= y + h - 1);
  // porterías blancas con red (detrás de la línea de gol)
  const gh = Math.round(7.32 * my), gd = Math.round(2 * mx), gy = cy - Math.round(gh / 2);
  for (const side of [0, 1]){
    const gx = side ? x + w : x - gd;
    px(g, PAL.shadow, gx + 2, gy + 3, gd, gh);
    px(g, PAL.net, gx, gy, gd, gh);
    for (let k = 2; k < gh; k += 3) px(g, PAL.netDark, gx, gy + k, gd, 1);
    for (let k = 2; k < gd; k += 3) px(g, PAL.netDark, gx + k, gy, 1, gh);
    px(g, PAL.postShade, side ? gx + gd - 1 : gx, gy, 1, gh);              // fondo de la red
    px(g, PAL.post, gx, gy, gd, 2); px(g, PAL.post, gx, gy + gh - 2, gd, 2);   // laterales
    px(g, PAL.post, side ? gx : gx + gd - 2, gy - 1, 2, gh + 2);            // postes y larguero
  }
}

/* ---- vallas bajas de hormigón alrededor de la tierra ---- */
function drawLowFences(g, O){
  const C = CAMPUS, f = C.fence, W0 = C.cols * TILE_SRC, H0 = C.rows * TILE_SRC, t = f.thick;
  const block = (x, y, w, h) => {           // bloque visto desde arriba: cara superior + cara frontal
    px(g, PAL.shadow, x + 2, y + h, w, 2);
    px(g, PAL.blockEdge, x, y, w, h);
    px(g, PAL.blockTop, x + 1, y, w - 2, h - 3);
    px(g, PAL.blockFront, x + 1, y + h - 3, w - 2, 2);
    px(g, 'rgba(255,255,255,0.35)', x + 1, y, w - 2, 1);
  };
  const run = (len, put) => { for (let s = 4; s + 6 < len; s += f.block + f.gap) put(s, Math.min(f.block, len - 4 - s)); };
  run(W0, (s, l) => { block(O + s, O - t - 1, l, t); block(O + s, O + H0 + 1, l, t); });          // arriba y abajo
  run(H0, (s, l) => { block(O - t - 1, O + s, t, l); block(O + W0 + 1, O + s, t, l); });          // izquierda y derecha
}

/* ---- decorado de fuera: árboles y arbustos sobre el césped ---- */
function drawOutsideDecor(g, useTiles){
  const T = TILE_SRC, C = CAMPUS, B = C.border, n = C.treeEvery;
  for (let ty = 0; ty < C.rows + 2 * B - 1; ty++) for (let tx = 0; tx < C.cols + 2 * B; tx++){
    const nearX = tx >= B - 2 && tx < B + C.cols + 2, nearY = ty >= B - 3 && ty < B + C.rows + 2;
    if (nearX && nearY) continue;                                  // deja libre la franja junto a las vallas
    const v = tileVar(tx * 3 + 1, ty * 5 + 2);
    if (v % n !== 0 || (v >> 4) % 3 === 0) continue;                // árboles sueltos, no en filas
    const x = tx * T, y = ty * T;
    if ((v >> 2) % 4 === 1){                                        // arbusto
      if (useTiles) putTile(g, CT.bush[0], CT.bush[1], x, y + T);
      else { px(g, PAL.leaf[0], x + 3, y + T + 4, 10, 9); }
      continue;
    }
    px(g, PAL.shadow, x + 2, y + 2 * T - 3, T - 4, 3);
    if (useTiles){ const col = CT.treeCols[v % CT.treeCols.length]; putTile(g, col, 10, x, y); putTile(g, col, 11, x, y + T); }
    else { px(g, PAL.trunk, x + 6, y + 18, 4, 12); px(g, PAL.leaf[v % 2], x + 2, y + 2, 12, 17); }
  }
}

function buildPitchCanvas(){
  const C = CAMPUS, O = C.border * TILE_SRC;
  const cv = document.createElement('canvas');
  cv.width = (C.cols + 2 * C.border) * TILE_SRC;
  cv.height = (C.rows + 2 * C.border) * TILE_SRC;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const TH = fieldTheme();
  const decor = useTiles => {
    if (!TH.decor){ drawOutsideDecor(g, useTiles); return; }
    if (TH.decor === 'royal') drawRoyalBridges(g, O);
    if (TH.stands) drawStands(g, O, TH.stands);
    drawThemeSimple(g, TH, O);
  };
  const greenUp = () => {                            // tinte verde césped que sube con cada boss vencido
    const k = fieldGreen(); if (k <= 0) return;
    const T = TILE_SRC, C2 = CAMPUS, W0 = C2.cols * T, H0 = C2.rows * T;
    g.save(); g.globalAlpha = 0.72 * k; g.fillStyle = '#5fae4a'; g.fillRect(O, O, W0, H0);
    if (k > 0.35){ g.globalAlpha = 0.18 * k; g.fillStyle = '#7cc65e'; for (let x = 0; x < C2.cols; x += 8) g.fillRect(O + x * T, O, 4 * T, H0); }   // franjas de corte
    g.restore();
  };
  const paint = useTiles => { drawPitchGround(g, useTiles, O, TH); greenUp(); decor(useTiles); drawLowFences(g, O); drawFieldLogo(g, O); drawPitchLines(g, O); drawFieldObstacles(g, useTiles, O); };
  cv.obstacles = match && match.obstacles;
  cv.theme = fieldThemeKey() + fieldGreen();
  cv.tiles = false;
  if (citySheetReady){
    try { paint(true); cv.tiles = true; }
    catch (err){ console.warn('[campo] Error al dibujar con casillas; se usan formas de canvas.', err); g.clearRect(0, 0, cv.width, cv.height); }
  }
  if (!cv.tiles) paint(false);
  pitchCanvas = cv;
}

/* ---- dibuja el campo de tierra completo (copia la parte visible) ---- */
function drawPitch(camX, camY){
  ctx.fillStyle = fieldTheme().outside || PAL.grassDark;
  ctx.fillRect(0, 0, W, H);
  if (!pitchCanvas || pitchCanvas.tiles !== citySheetReady || pitchCanvas.obstacles !== match.obstacles || pitchCanvas.theme !== fieldThemeKey() + fieldGreen()) buildPitchCanvas();
  const O = CAMPUS.border * TILE_SRC;
  const u0 = Math.max(0, Math.floor(O - camX / PX)), v0 = Math.max(0, Math.floor(O - camY / PX));
  const u1 = Math.min(pitchCanvas.width, Math.ceil(O + (W - camX) / PX)), v1 = Math.min(pitchCanvas.height, Math.ceil(O + (H - camY) / PX));
  if (u1 > u0 && v1 > v0){
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pitchCanvas, u0, v0, u1 - u0, v1 - v0,
                  Math.round(camX + (u0 - O) * PX), Math.round(camY + (v0 - O) * PX), (u1 - u0) * PX, (v1 - v0) * PX);
    ctx.imageSmoothingEnabled = true;
  }
}

/* ---- movimiento ambiental sobre la tierra del campo (solo decorado) ----
   matas de hierba seca que se mecen con rachas de viento, polvo que vuela
   y sombras de nubes que pasan, como en el fondo de la portada */
const FIELD_AMBIENT = { tuftEvery: 22000, dust: 70 };
let fieldAmb = null;
function buildFieldAmbient(){
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const p = CAMPUS.pitch, tufts = [];
  const n = Math.round(p.w * p.h / FIELD_AMBIENT.tuftEvery);
  for (let i = 0; i < n; i++){
    const x = p.x + rnd() * p.w, y = p.y + rnd() * p.h;
    const blades = [];
    for (let b = 0, nb = 2 + Math.floor(rnd() * 3); b < nb; b++) blades.push({ dx: (b - nb / 2) * 3 + rnd() * 2, len: 2 + Math.floor(rnd() * 3), lean: (rnd() - 0.5) * 1.2 });
    tufts.push({ x, y, blades, ph: rnd() * 6, c: rnd() < 0.5 ? '#7d7a36' : '#8f8a3e', tip: rnd() < 0.5 ? '#b6ad5a' : '#c4b866' });
  }
  fieldAmb = { tufts, dust: [] };
}
function drawFieldAmbient(camX, camY){
  if (!fieldAmb) buildFieldAmbient();
  const t = match.elapsed, P = PX;
  // sombras de nubes (lentas, en coordenadas del mundo)
  ctx.save();
  for (let k = 0; k < 3; k++){
    const wx = ((t * 18 + k * 1300) % (FIELD_W + 1200)) - 600 + camX, wy = 300 + k * 600 + camY;
    if (wx < -500 || wx > W + 500 || wy < -300 || wy > H + 300) continue;
    const gr = ctx.createRadialGradient(wx, wy, 0, wx, wy, 420);
    gr.addColorStop(0, 'rgba(40,20,0,0.10)'); gr.addColorStop(0.6, 'rgba(40,20,0,0.06)'); gr.addColorStop(1, 'rgba(40,20,0,0)');
    ctx.setTransform(1, 0, 0, 0.55, 0, wy * 0.45);                    // sombra achatada
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(wx, wy, 420, 0, Math.PI * 2); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
  // matas de hierba seca que se mecen (solo las visibles)
  for (const tf of fieldAmb.tufts){
    const sx = tf.x + camX, sy = tf.y + camY;
    if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
    if (!match.inArena && match.obstacles && obstacleAt(tf.x, tf.y, 6)) continue;
    const gust = Math.max(0, Math.sin(t * 0.9 - tf.x * 0.004)) ** 3;
    const sway = Math.sin(t * 2.2 + tf.ph) * 0.8 + gust * 2.6;
    for (const b of tf.blades){
      for (let k = 0; k < b.len; k++){
        const f = k / b.len;
        const x = Math.round(sx + b.dx + (b.lean + sway) * f * f * 1.6 * P), y = Math.round(sy - k * P);
        ctx.fillStyle = k >= b.len - 1 ? tf.tip : tf.c;
        ctx.fillRect(x, y, P, P);
      }
    }
  }
  // polvo arrastrado por el viento alrededor de la cámara
  const D = fieldAmb.dust;
  while (D.length < FIELD_AMBIENT.dust) D.push({ x: match.x + (Math.random() - 0.5) * W * 1.4, y: match.y + (Math.random() - 0.5) * H * 1.4, v: 20 + Math.random() * 40, ph: Math.random() * 6, c: Math.random() < 0.5 ? '#e2c08c' : '#b58a55' });
  const dt = Math.max(0, Math.min(0.1, t - (fieldAmb.lastT ?? t))); fieldAmb.lastT = t;
  for (const d of D){
    const gust = 1 + 2.5 * Math.max(0, Math.sin(t * 0.9 - d.x * 0.004)) ** 3;
    d.x += d.v * gust * dt; d.y += Math.sin(t * 1.5 + d.ph) * 8 * dt;
    if (Math.abs(d.x - match.x) > W * 0.75 || Math.abs(d.y - match.y) > H * 0.75){ d.x = match.x - W * 0.7; d.y = match.y + (Math.random() - 0.5) * H * 1.4; }   // vuelve a entrar por la izquierda
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 3 + d.ph);
    ctx.fillStyle = d.c; ctx.fillRect(Math.round(d.x + camX), Math.round(d.y + camY), P, P);
  }
  ctx.globalAlpha = 1;
}

/* mezcla dos colores hex (t = 0 → a, t = 1 → b) */
function mixColor(a, b, t){
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* ======================================================================
   OBSTÁCULOS DEL CAMPO PRINCIPAL (se colocan al azar en cada partido)
   - Sólidos (no se pueden atravesar, ni tú ni los rivales; frenan los
     balones de los tiradores): rocas, conos y neumáticos.
   - Hierbajos y barro: te ralentizan a ti y a los rivales mientras los pisas.
   - Plátanos: si pasas por encima resbalas unos instantes sin control.
   Todo en px de mundo. El dibujo va dentro del lienzo del campo.
   ====================================================================== */
const FIELD_OBSTACLES = {
  safeRadius: 340,                                   // libre alrededor del centro (saque inicial)
  spacing: 50,                                       // separación mínima entre obstáculos
  // count / lines / groups = [mínimo, máximo]: en cada partido sale un número al azar en ese rango
  rocks:   { count: [3, 6], r: [22, 40] },
  cones:   { lines: [1, 3], perLine: [3, 4], gap: 72, r: 14 },   // filas de conos, como un ejercicio
  tires:   { count: [2, 4], r: 52 },                             // un neumático grande, suelto (solo goma)
  weeds:   { count: [3, 6], r: [55, 95], slow: 0.55 },
  mud:     { count: [1, 3], r: [60, 100], slow: 0.7 },
  // después de cada boss aparecen unos pocos obstáculos más
  afterBoss: { count: [2, 4], playerSafe: 260 },
  bananas: { count: [2, 5], r: 16, slipTime: 0.7, slipSpeed: 1.7, cooldown: 1.2 },
};
// casilla de Kenney para el cono (el neumático se dibuja con código)
const OBST_TILES = { cone:[14,18] };

function randIn([a, b]){ return a + Math.random() * (b - a); }
function randInt([a, b]){ return a + Math.floor(Math.random() * (b - a + 1)); }
function pixelDisc(g, color, cx, cy, r){
  g.fillStyle = color;
  for (let dy = -r; dy <= r; dy++){ const dx = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
function rockShape(r){
  const n = 7 + Math.floor(Math.random() * 3), pts = [];
  for (let k = 0; k < n; k++){ const a = k / n * Math.PI * 2, rr = r * (0.75 + Math.random() * 0.35); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  const crack = [[(Math.random() - 0.5) * r * 0.6, -r * 0.7]];
  for (let k = 1; k <= 3; k++) crack.push([(Math.random() - 0.5) * r * 0.8, -r * 0.7 + k * r * 0.45]);
  return { pts, crack };
}

function buildFieldObstacles(){
  const F = FIELD_OBSTACLES, items = [];
  const cx = FIELD_W / 2, cy = FIELD_H / 2;
  const free = (x, y, r) => x > r + 70 && x < FIELD_W - r - 70 && y > r + 70 && y < FIELD_H - r - 70
    && Math.hypot(x - cx, y - cy) > F.safeRadius + r
    && items.every(o => Math.hypot(o.x - x, o.y - y) > o.r + r + F.spacing);
  const place = (r, make, tries = 80) => {
    while (tries-- > 0){
      const x = Math.random() * FIELD_W, y = Math.random() * FIELD_H;
      if (free(x, y, r)){ const o = make(x, y); items.push(o); return o; }
    }
    return null;
  };
  const solids = [], zones = [], bananas = [];
  // las zonas grandes primero (hierbajos y barro), para que no tapen lo demás
  for (let i = 0, n = randInt(F.weeds.count); i < n; i++){ const r = randIn(F.weeds.r); const z = place(r, (x, y) => ({ kind:'weeds', x, y, r, slow:F.weeds.slow, seed:Math.random() * 1000 })); if (z) zones.push(z); }
  for (let i = 0, n = randInt(F.mud.count); i < n; i++){ const r = randIn(F.mud.r); const z = place(r, (x, y) => ({ kind:'mud', x, y, r, slow:F.mud.slow, seed:Math.random() * 1000 })); if (z) zones.push(z); }
  for (let i = 0, n = randInt(F.rocks.count); i < n; i++){ const r = randIn(F.rocks.r); const s = place(r, (x, y) => ({ kind:'rock', x, y, r, ...rockShape(r) })); if (s) solids.push(s); }
  // filas de conos
  for (let i = 0, lines = randInt(F.cones.lines); i < lines; i++){
    const n = Math.round(randIn(F.cones.perLine)), horiz = Math.random() < 0.5, len = (n - 1) * F.cones.gap;
    place(len / 2 + 20, (x, y) => {
      for (let k = 0; k < n; k++){
        const o = { kind:'cone', r:F.cones.r, x: x + (horiz ? k * F.cones.gap - len / 2 : 0), y: y + (horiz ? 0 : k * F.cones.gap - len / 2) };
        solids.push(o);
      }
      return { x, y, r: len / 2 + 20 };
    });
  }
  // grupos de neumáticos
  for (let i = 0, n = randInt(F.tires.count); i < n; i++){
    const t = place(F.tires.r, (x, y) => ({ kind:'tire', x, y, r:F.tires.r, rot: Math.random() * Math.PI }));
    if (t) solids.push(t);
  }
  for (let i = 0, n = randInt(F.bananas.count); i < n; i++){ const b = place(F.bananas.r, (x, y) => ({ kind:'banana', x, y, r:F.bananas.r, ang: Math.random() * Math.PI * 2 })); if (b) bananas.push(b); }
  return { solids, zones, bananas };
}
/* tras ganar a un boss: unos pocos obstáculos más, lejos de donde vuelves al campo.
   Se crea un objeto nuevo para que el campo se vuelva a dibujar. */
function addFieldObstacles(ob, safeX, safeY){
  const F = FIELD_OBSTACLES, cx = FIELD_W / 2, cy = FIELD_H / 2;
  const all = [...ob.solids, ...ob.zones, ...ob.bananas];
  const nb = { solids:[...ob.solids], zones:[...ob.zones], bananas:[...ob.bananas] };
  const free = (x, y, r) => x > r + 70 && x < FIELD_W - r - 70 && y > r + 70 && y < FIELD_H - r - 70
    && Math.hypot(x - cx, y - cy) > F.safeRadius + r
    && Math.hypot(x - safeX, y - safeY) > F.afterBoss.playerSafe + r
    && all.every(o => Math.hypot(o.x - x, o.y - y) > o.r + r + F.spacing);
  const kinds = ['rock', 'rock', 'tire', 'tire', 'mud', 'weeds', 'banana', 'cones'];
  for (let i = 0, n = randInt(F.afterBoss.count); i < n; i++){
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    const r = k === 'rock' ? randIn(F.rocks.r) : k === 'tire' ? F.tires.r : k === 'banana' ? F.bananas.r
            : k === 'cones' ? F.cones.gap * 1.5 + 20 : randIn(F[k].r);
    for (let tries = 0; tries < 60; tries++){
      const x = Math.random() * FIELD_W, y = Math.random() * FIELD_H;
      if (!free(x, y, r)) continue;
      let o;
      if (k === 'rock') nb.solids.push(o = { kind:'rock', x, y, r, ...rockShape(r) });
      else if (k === 'tire') nb.solids.push(o = { kind:'tire', x, y, r, rot: Math.random() * Math.PI });
      else if (k === 'banana') nb.bananas.push(o = { kind:'banana', x, y, r, ang: Math.random() * Math.PI * 2 });
      else if (k === 'cones'){
        const horiz = Math.random() < 0.5;
        for (let c = 0; c < 4; c++) nb.solids.push({ kind:'cone', r:F.cones.r, x: x + (horiz ? (c - 1.5) * F.cones.gap : 0), y: y + (horiz ? 0 : (c - 1.5) * F.cones.gap) });
        o = { x, y, r };
      } else nb.zones.push(o = { kind:k, x, y, r, slow:F[k].slow, seed:Math.random() * 1000 });
      all.push(o);
      break;
    }
  }
  return nb;
}

/* ---- efectos en el juego ---- */
/* porterías: cajas sólidas (en mundo) calculadas igual que se dibujan en drawPitchLines */
let _goalRects = null;
function goalRects(){
  if (_goalRects) return _goalRects;
  const p = CAMPUS.pitch;
  const x = Math.round(p.x / PX), y = Math.round(p.y / PX), w = Math.round(p.w / PX), h = Math.round(p.h / PX);
  const mx = w / 105, my = h / 68, cy = y + Math.floor(h / 2);
  const gh = Math.round(7.32 * my), gd = Math.round(2 * mx), gy = cy - Math.round(gh / 2);
  _goalRects = [0, 1].map(side => {
    const gx = side ? x + w : x - gd;
    return { x0: gx * PX, x1: (gx + gd) * PX, y0: (gy - 1) * PX, y1: (gy + gh + 1) * PX };
  });
  return _goalRects;
}
function pushOutOfGoals(o, radius){
  for (const r of goalRects()){
    const nx = Math.max(r.x0, Math.min(r.x1, o.x)), ny = Math.max(r.y0, Math.min(r.y1, o.y));
    const dx = o.x - nx, dy = o.y - ny, d = Math.hypot(dx, dy);
    if (d >= radius) continue;
    if (d > 0.01){ o.x = nx + dx / d * radius; o.y = ny + dy / d * radius; continue; }
    // el centro está dentro de la caja: sale por el lado más cercano
    const opts = [[o.x - r.x0, -1, 0], [r.x1 - o.x, 1, 0], [o.y - r.y0, 0, -1], [r.y1 - o.y, 0, 1]].sort((a, b) => a[0] - b[0]);
    const [, sx, sy] = opts[0];
    if (sx) o.x = (sx < 0 ? r.x0 : r.x1) + sx * radius; else o.y = (sy < 0 ? r.y0 : r.y1) + sy * radius;
  }
}
function pushOutOfObstacles(o, radius){
  if (match.inArena) return;
  pushOutOfGoals(o, radius);
  if (match.itower){                                       // la Torre Inazuma es sólida (su base)
    const t = match.itower, dx = o.x - t.x, dy = o.y - (t.y + 8), min = 24 + radius, d = Math.hypot(dx, dy) || 0.01;
    if (d < min){ o.x = t.x + dx / d * min; o.y = t.y + 8 + dy / d * min; }
  }
  if (!match.obstacles) return;
  for (const s of match.obstacles.solids){
    const dx = o.x - s.x, dy = o.y - s.y, min = s.r + radius;
    if (dx > min || dx < -min || dy > min || dy < -min) continue;
    const d = Math.hypot(dx, dy) || 0.01;
    if (d < min){ o.x = s.x + dx / d * min; o.y = s.y + dy / d * min; }
  }
}
function obstacleAt(x, y, pad){
  if (goalRects().some(r => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad)) return true;
  if (!match.obstacles) return false;
  return match.obstacles.solids.some(s => Math.hypot(x - s.x, y - s.y) < s.r + pad);
}
/* multiplicador de velocidad del terreno (1 = normal) */
function terrainSlow(x, y){
  if (match.inArena || !match.obstacles) return 1;
  let m = 1;
  for (const z of match.obstacles.zones) if (Math.hypot(x - z.x, y - z.y) < z.r * 0.92) m = Math.min(m, z.slow);
  return m;
}
/* plátanos: al pisar uno resbalas en la dirección en la que ibas */
function checkBananas(spd){
  if (match.inArena || !match.obstacles || match.slip) return;
  if (match.elapsed < (match.slipCdUntil || 0)) return;
  const F = FIELD_OBSTACLES.bananas;
  for (const b of match.obstacles.bananas){
    if (Math.hypot(match.x - b.x, match.y - b.y) < b.r + 10){
      const v = spd * F.slipSpeed * 60;
      match.slip = { vx: match.aim.x * v, vy: match.aim.y * v, t: F.slipTime, dur: F.slipTime };
      match.slipCdUntil = match.elapsed + F.slipTime + F.cooldown;
      addFloatText(match.x, match.y - 30, '¡Resbalón! 🍌', '#f2d34b');
      return;
    }
  }
}

/* ---- dibujo (en el lienzo del campo, a resolución de la hoja) ---- */
function drawPixelRock(g, rx, ry, rr, pts, crack){
  pixelEllipse(g, 'rgba(0,0,0,0.35)', rx + 1.3, ry + rr * 0.75, Math.round(rr * 0.95), Math.max(2, Math.round(rr * 0.35)));
  const R = Math.ceil(rr) + 2;
  const inside = (ix, iy) => pointInPoly(ix + 0.5 - rx, iy + 0.5 - ry, pts);
  for (let iy = Math.floor(ry - R); iy <= ry + R; iy++) for (let ix = Math.floor(rx - R); ix <= rx + R; ix++){
    if (!inside(ix, iy)) continue;
    const edge = !inside(ix + 1, iy) || !inside(ix - 1, iy) || !inside(ix, iy + 1) || !inside(ix, iy - 1);
    const nx = (ix + 0.5 - rx) / rr, ny = (iy + 0.5 - ry) / rr, lit = -0.6 * nx - 0.8 * ny;
    let col = '#6f6a63';
    if (edge) col = '#3b3733';
    else if (lit > 0.45) col = '#8a857d';
    else if (lit < -0.35) col = '#5c5751';
    px(g, col, ix, iy, 1, 1);
  }
  for (let k = 1; k < crack.length; k++){
    const [x0, y0] = crack[k - 1], [x1, y1] = crack[k];
    pixelLine(g, '#2a2724', rx + x0, ry + y0, rx + x1, ry + y1, 1);
  }
}
/* neumático grande visto desde arriba (código, píxel a píxel): banda con dibujo,
   flanco, llanta gris y el agujero del centro por el que se ve la tierra */
/* neumático tumbado visto desde arriba: solo goma (sin llanta) con tacos y agujero */
function drawPixelTire(g, cx, cy, R, rot){
  pixelEllipse(g, 'rgba(0,0,0,0.32)', cx + 3, cy + 4, R + 1, R);         // sombra en la tierra
  const hole = Math.round(R * 0.42);                                     // radio del agujero central
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++){
    const d = Math.hypot(dx + 0.5, dy + 0.5);
    if (d > R) continue;
    const a = Math.atan2(dy, dx), lit = -(dx + dy) / (R * 1.41);         // luz desde arriba a la izquierda
    let col = null;
    if (d > R - 1) col = '#0e0f10';                                      // contorno exterior
    else if (d > R - 4.5){                                               // banda de rodadura con tacos
      const lug = Math.floor(((a + rot) / (Math.PI * 2)) * 26) % 2 === 0;
      const deep = d > R - 2.5;
      col = lug ? (lit > 0.35 ? '#4b4e53' : lit < -0.35 ? '#2b2d30' : '#3a3c40') : (deep ? '#17181a' : '#232427');
    }
    else if (d > hole + 2){                                              // flanco de goma, con brillo y sombra
      const band = (d - hole - 2) / (R - 4.5 - hole - 2);                // 0 dentro, 1 fuera
      col = lit > 0.45 ? '#55595e' : lit > 0.1 ? '#43464a' : lit < -0.45 ? '#202124' : '#303235';
      if (band > 0.42 && band < 0.58 && lit > -0.2) col = '#5d6166';     // arista que brilla en mitad del flanco
    }
    else if (d > hole + 1) col = '#121314';                              // borde interior (talón)
    else if (d > hole){                                                  // borde del agujero
      col = lit > 0 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)';
    } else {
      // agujero: se ve la tierra; el borde de arriba a la izquierda proyecta una media luna de sombra
      if (Math.hypot(dx + 0.5 + 2, dy + 0.5 + 2) > hole) col = 'rgba(0,0,0,0.35)';
      else continue;
    }
    px(g, col, cx + dx, cy + dy, 1, 1);
  }
  // letras en relieve del flanco (rayitas un poco más claras)
  for (let k = 0; k < 10; k++){
    const a = rot + k / 10 * Math.PI * 2, rr = (hole + 2 + R - 4.5) / 2 + 1;
    if (k % 5 === 4) continue;
    px(g, '#4f5357', Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 2, 1);
  }
}

function drawFieldObstacles(g, useTiles, O){
  const ob = match && match.obstacles;
  if (!ob) return;
  const U = v => O + v / PX;           // px de mundo → px del lienzo
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
  // barro
  for (const z of ob.zones.filter(z => z.kind === 'mud')){
    seedN = Math.floor(z.seed * 1000) + 7;
    const cx = U(z.x), cy = U(z.y), r = z.r / PX;
    for (let k = 0; k < 3; k++){
      const ox = (rnd() - 0.5) * r * 0.5, oy = (rnd() - 0.5) * r * 0.35;
      pixelEllipse(g, '#5e4127', cx + ox, cy + oy, Math.round(r * (0.65 + rnd() * 0.15)), Math.round(r * 0.42));
    }
    pixelEllipse(g, '#6e4c2e', cx, cy, Math.round(r * 0.5), Math.round(r * 0.28));
    for (let k = 0; k < 10; k++) px(g, k % 2 ? '#8b6a48' : '#4b3320', Math.round(cx + (rnd() - 0.5) * r), Math.round(cy + (rnd() - 0.5) * r * 0.5), 2 + Math.floor(rnd() * 3), 1);
  }
  // hierbajos: matas de hierba alta
  for (const z of ob.zones.filter(z => z.kind === 'weeds')){
    seedN = Math.floor(z.seed * 1000) + 3;
    const cx = U(z.x), cy = U(z.y), r = z.r / PX;
    pixelEllipse(g, 'rgba(70,120,45,0.28)', cx, cy, Math.round(r * 0.95), Math.round(r * 0.8));
    const tufts = Math.round(r * 1.4);
    for (let k = 0; k < tufts; k++){
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.85;
      const tx = Math.round(cx + Math.cos(a) * d), ty = Math.round(cy + Math.sin(a) * d * 0.85);
      const greens = ['#3d6e2e', '#4f8a3a', '#6aa84f', '#7fbf5a'];
      for (let b = -1; b <= 1; b++){
        const h = 2 + Math.floor(rnd() * 4);
        px(g, greens[Math.floor(rnd() * greens.length)], tx + b * 1, ty - h + (b ? 1 : 0), 1, h);
      }
      px(g, 'rgba(0,0,0,0.15)', tx - 1, ty + 1, 3, 1);
    }
  }
  // sólidos
  for (const s of ob.solids){
    const cx = U(s.x), cy = U(s.y);
    if (s.kind === 'rock'){
      drawPixelRock(g, cx, cy, s.r / PX, s.pts.map(([a, b]) => [a / PX, b / PX]), s.crack.map(([a, b]) => [a / PX, b / PX]));
    } else if (s.kind === 'cone'){
      // cono de entrenamiento en píxeles: base cuadrada, cuerpo naranja con luz y banda reflectante
      const X = Math.round(cx), Y = Math.round(cy);
      px(g, 'rgba(0,0,0,0.3)', X - 5, Y + 4, 13, 3);
      px(g, '#1b1d26', X - 7, Y + 1, 14, 4); px(g, '#c2580b', X - 6, Y + 2, 12, 2); px(g, '#8a3d06', X - 6, Y + 3, 12, 1);
      for (let k = 0; k < 11; k++){
        const half = Math.floor(k / 2) + 1, yy = Y - 10 + k;
        const band = k === 5 || k === 6;
        px(g, '#1b1d26', X - half - 1, yy, half * 2 + 2, 1);
        px(g, band ? '#f4f1e8' : '#f08a1c', X - half, yy, half * 2, 1);
        px(g, band ? '#ffffff' : '#ffb35c', X - half, yy, 1, 1);                       // lado iluminado
        if (half > 1) px(g, band ? '#c9ced2' : '#c2600d', X + half - 1, yy, 1, 1);      // lado en sombra
      }
      px(g, '#1b1d26', X - 1, Y - 11, 2, 1);
    } else if (s.kind === 'tire'){
      drawPixelTire(g, Math.round(cx), Math.round(cy), Math.round(s.r / PX), s.rot || 0);
    }
  }
  // plátanos (dibujados con código, píxel a píxel)
  for (const b of ob.bananas){
    const cx = U(b.x), cy = U(b.y);
    px(g, 'rgba(0,0,0,0.22)', Math.round(cx) - 5, Math.round(cy) + 5, 12, 2);
    for (let k = 0; k <= 12; k++){
      const t = b.ang + (k / 12 - 0.5) * 2.3;
      const x = Math.round(cx + Math.cos(t) * 6), y = Math.round(cy + Math.sin(t) * 6);
      const tip = k === 0 || k === 12;
      px(g, tip ? '#5a3d1e' : '#b8962e', x - 1, y - 1, 3, 3);
      if (!tip) px(g, k % 4 === 1 ? '#fff3a0' : '#f2d34b', x - 1, y - 1, 2, 2);
    }
  }
}

/* ======================================================================
   CAMPO DEL DUELO (boss) — mismo estilo de píxeles que el campo de tierra
   Campo estándar con sus colores: césped oscuro teñido con el color del
   boss, líneas blancas, porterías amarillas, borde brillante del color del
   boss y rocas grises.
   - Capa fija (se pinta una vez por duelo): fondo, gradas con público,
     vallas bajas, focos, césped a bandas, líneas, porterías y rocas.
   - En vivo: haces de los focos, borde brillante y viñeta.
   ====================================================================== */
const ARENA_BORDER = 250;         // px de la hoja de decorado alrededor del campo del duelo
let arenaLayers = null;           // { color, rocks, tiles, base }

/* línea de píxeles (Bresenham) */
function pixelLine(g, color, x0, y0, x1, y1, t = 1){
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  g.fillStyle = color;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, h = Math.floor((t - 1) / 2);
  for (;;){
    g.fillRect(x0 - h, y0 - h, t, t);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy){ err += dy; x0 += sx; }
    if (e2 <= dx){ err += dx; y0 += sy; }
  }
}
function pixelEllipse(g, color, cx, cy, rx, ry){
  g.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++){
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
    g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
  }
}
function pointInPoly(x, y, pts){
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function buildArenaLayers(glow){
  const O = ARENA_BORDER, FW = Math.round(ARENA_W / PX), FH = Math.round(ARENA_H / PX);
  const CW = FW + 2 * O, CH = FH + 2 * O;
  const mk = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  const [base, g] = mk();
  const useTiles = citySheetReady;
  const dim = (c, t) => mixColor(c, glow, t);

  // 1) fondo muy oscuro con algo de textura
  px(g, '#07120d', 0, 0, CW, CH);
  for (let k = 0; k < 900; k++){
    const v = tileVar(k * 11, k * 19);
    px(g, k % 4 ? '#0b1a12' : dim('#0b1a12', 0.25), (v * 31 + k * 57) % CW, (v * 17 + k * 23) % CH, 2 + v % 3, 1);
  }

  // 2) gradas a los lados largos, con público (siluetas oscuras; algunos con bufanda del color del boss)
  const tiers = 5, tierW = 12, gap = 16;
  for (const side of [0, 1]){
    for (let t = 0; t < tiers; t++){
      const x = side ? O + FW + gap + t * tierW : O - gap - (t + 1) * tierW;
      const y = O - 40, h = FH + 80;
      px(g, t % 2 ? '#262d33' : '#2d353c', x, y, tierW, h);
      px(g, '#3c464e', side ? x : x + tierW - 1, y, 1, h);                       // borde del escalón
      for (let yy = y + 3; yy < y + h - 4; yy += 5){
        const v = tileVar(x + yy, yy * 3 + t);
        if (v % 7 === 0) continue;                                              // asiento vacío
        const fx = x + 3 + (v % 3), fy = yy;
        const body = v % 5 === 0 ? dim('#2b3239', 0.55) : (v % 2 ? '#1a1f24' : '#222830');
        px(g, body, fx, fy, 5, 3);
        px(g, v % 3 ? '#3a3330' : '#4a3f39', fx + 1, fy - 1, 3, 2);            // cabeza
        if (v % 11 === 1) px(g, glow, fx - 1, fy + 1, 7, 1);                    // bufanda
      }
    }
    // pasillos de las gradas
    for (let k = 1; k < 4; k++){
      const y = O - 40 + Math.round(k * (FH + 80) / 4);
      const x0 = side ? O + FW + gap : O - gap - tiers * tierW;
      px(g, '#3a434b', x0, y, tiers * tierW, 3);
    }
  }

  // 3) muros detrás de las porterías con pancartas del color del boss
  for (const side of [0, 1]){
    const y = side ? O + FH + 30 : O - 42;
    px(g, '#1d2328', O - gap - tiers * tierW, y, FW + 2 * (gap + tiers * tierW), 12);
    px(g, '#2f383f', O - gap - tiers * tierW, side ? y : y + 11, FW + 2 * (gap + tiers * tierW), 1);
    for (let k = 0; k < 5; k++){
      if (k === 2) continue;                                                    // hueco detrás de la portería
      const bx = O + Math.round(k * FW / 5) + 6, bw = Math.round(FW / 5) - 12;
      px(g, dim('#3a1f2a', 0.6), bx, y + 2, bw, 8);
      px(g, glow, bx, y + 2, bw, 1); px(g, glow, bx, y + 9, bw, 1);
      for (let s = 4; s < bw - 3; s += 6) px(g, 'rgba(255,255,255,0.35)', bx + s, y + 5, 3, 2);
    }
  }

  // 4) pista oscura y vallas bajas alrededor del campo (abiertas en las porterías)
  px(g, '#141c19', O - 12, O - 12, FW + 24, FH + 24);
  const block = (x, y, w, h) => {
    px(g, 'rgba(0,0,0,0.35)', x + 2, y + h, w, 2);
    px(g, '#4f4b43', x, y, w, h); px(g, '#7d776a', x + 1, y, w - 2, h - 3); px(g, '#625d53', x + 1, y + h - 3, w - 2, 2);
  };
  for (let s = 2; s + 10 < FW; s += 24){
    const mid = Math.abs(s + 9 - FW / 2) < 40;
    if (!mid){ block(O + s, O - 11, 18, 6); block(O + s, O + FH + 5, 18, 6); }
  }
  for (let s = 2; s + 10 < FH; s += 24){ block(O - 11, O + s, 6, 18); block(O + FW + 5, O + s, 6, 18); }

  // 5) focos en las esquinas
  for (const [fx, fy] of [[O - 34, O - 34], [O + FW + 26, O - 34], [O - 34, O + FH + 26], [O + FW + 26, O + FH + 26]]){
    px(g, 'rgba(0,0,0,0.4)', fx + 2, fy + 3, 10, 10);
    px(g, '#59626a', fx + 3, fy + 3, 4, 4);
    px(g, '#2b3136', fx - 2, fy - 2, 14, 6);
    for (let k = 0; k < 3; k++) px(g, '#fff6c8', fx - 1 + k * 4, fy - 1, 3, 3);
  }

  // 6) césped del duelo: casillas de Kenney oscurecidas, a bandas horizontales
  g.save(); g.beginPath(); g.rect(O, O, FW, FH); g.clip();
  if (useTiles){
    for (let ty = 0; ty < Math.ceil(FH / TILE_SRC); ty++) for (let tx = 0; tx < Math.ceil(FW / TILE_SRC); tx++){
      const [c, r] = CT.grass[tileVar(tx, ty) % CT.grass.length];
      putTile(g, c, r, O + tx * TILE_SRC, O + ty * TILE_SRC);
    }
  }
  const bandH = 110 / PX;
  for (let by = 0, i = 0; by < FH; by += bandH, i++){
    const col = i % 2 === 0 ? mixColor('#183a26', glow, 0.42) : mixColor('#153321', glow, 0.36);
    g.globalAlpha = useTiles ? 0.82 : 1;
    px(g, col, O, O + Math.round(by), FW, Math.round(Math.min(bandH, FH - by)) + 1);
  }
  g.globalAlpha = 1;
  for (let k = 0; k < 500; k++){                                               // briznas y calvas
    const v = tileVar(k * 7 + 3, k * 13 + 5);
    px(g, k % 3 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)', O + (v * 29 + k * 37) % FW, O + (v * 41 + k * 11) % FH, 1 + v % 3, 1);
  }
  g.restore();

  // 7) líneas del campo (en vertical) y porterías amarillas con red
  const L = 'rgba(234,255,243,0.7)', cx = O + Math.round(FW / 2), cy = O + Math.round(FH / 2);
  pixelFrame(g, L, O, O, FW, FH);
  px(g, L, O, cy, FW, 1);
  pixelArc(g, L, cx, cy, Math.round(80 / PX));
  px(g, L, cx - 1, cy - 1, 3, 3);
  const bw = Math.round(340 / PX), bh = Math.round(150 / PX);
  pixelFrame(g, L, cx - Math.round(bw / 2), O, bw, bh);
  pixelFrame(g, L, cx - Math.round(bw / 2), O + FH - bh, bw, bh);
  const gw = Math.round(140 / PX);
  for (const side of [0, 1]){
    const gy = side ? O + FH : O - 5, gx = cx - Math.round(gw / 2);
    px(g, 'rgba(235,240,244,0.35)', gx, gy, gw, 5);
    for (let k = 2; k < gw; k += 3) px(g, 'rgba(0,0,0,0.25)', gx + k, gy, 1, 5);
    pixelFrame(g, '#f2b705', gx, gy, gw, 5);
    px(g, '#f2b705', gx - 1, side ? gy : gy + 4, gw + 2, 1);
  }

  // 8) rocas rotas, píxel a píxel (gris)
  for (const r of match.rocks)
    drawPixelRock(g, O + r.x / PX, O + r.y / PX, r.r / PX, r.pts.map(([a, b]) => [a / PX, b / PX]), r.crack.map(([a, b]) => [a / PX, b / PX]));

  arenaLayers = { color: glow, rocks: match.rocks, tiles: useTiles, base };
}

/* copia la parte visible de una capa (hecha a resolución de la hoja) ampliada ×3 */
function blitPixelLayer(cv, O, camX, camY){
  const u0 = Math.max(0, Math.floor(O - camX / PX)), v0 = Math.max(0, Math.floor(O - camY / PX));
  const u1 = Math.min(cv.width, Math.ceil(O + (W - camX) / PX)), v1 = Math.min(cv.height, Math.ceil(O + (H - camY) / PX));
  if (u1 <= u0 || v1 <= v0) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, u0, v0, u1 - u0, v1 - v0,
                Math.round(camX + (u0 - O) * PX), Math.round(camY + (v0 - O) * PX), (u1 - u0) * PX, (v1 - v0) * PX);
  ctx.imageSmoothingEnabled = true;
}

/* ---- campo del duelo: pequeño, vertical, agrietado y con rocas ---- */
function drawArena(camX, camY){
  const left = camX, top = camY;
  const glow = match.arenaColor || '#b377e0';
  const t = match.elapsed;

  ctx.fillStyle = '#07120d';
  ctx.fillRect(0, 0, W, H);

  const L = arenaLayers;
  if (!L || L.color !== glow || L.rocks !== match.rocks || L.tiles !== citySheetReady) buildArenaLayers(glow);
  blitPixelLayer(arenaLayers.base, ARENA_BORDER, camX, camY);

  ctx.globalCompositeOperation = 'lighter';
  // haces de los focos (luz suave desde las cuatro esquinas)
  ctx.globalAlpha = 1;
  for (const [fx, fy] of [[-90, -90], [ARENA_W + 90, -90], [-90, ARENA_H + 90], [ARENA_W + 90, ARENA_H + 90]]){
    const sx = left + fx, sy = top + fy;
    const gr = ctx.createRadialGradient(sx, sy, 10, sx, sy, 520);
    gr.addColorStop(0, 'rgba(255,246,200,0.09)');
    gr.addColorStop(1, 'rgba(255,246,200,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(sx - 520, sy - 520, 1040, 1040);
  }
  ctx.globalCompositeOperation = 'source-over';

  // borde que brilla con el color del boss (en escalones de píxel)
  const pulse = 0.5 + 0.2 * Math.sin(t * 3);
  ctx.fillStyle = glow;
  for (const [a, w] of [[pulse * 0.35, 12], [pulse, 6]]){
    ctx.globalAlpha = a;
    ctx.fillRect(left - w, top - w, ARENA_W + 2 * w, w);
    ctx.fillRect(left - w, top + ARENA_H, ARENA_W + 2 * w, w);
    ctx.fillRect(left - w, top, w, ARENA_H);
    ctx.fillRect(left + ARENA_W, top, w, ARENA_H);
  }
  ctx.globalAlpha = 1;

  // viñeta: oscurece los bordes de la pantalla con un toque del color del boss
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.7, mixColor('#000000', glow, 0.12) + '66');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

/* el cuaderno está fusionado con la supertécnica que usas (círculo permanente) */
function nbFusedActive(kind){
  const t = activeTech();
  const ps = techParts(t);
  return !!t && !!t.fused && ps.some(q => q.kind === kind) && ps.some(q => !isBuffKind(q.kind));
}
/* círculos de los cuadernos alrededor del jugador:
   cargando (arco que se llena), cargado (círculo completo que late),
   en marcha tras cambiar (se va vaciando) y fusionado (permanente) */
function drawNotebookRings(){
  const ring = (k, frac, R, width, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    // estilo arcade: el anillo va por bloques (16 segmentos) con contorno oscuro
    const SEG = 16, on = Math.floor(frac * SEG + 0.001), gap = 0.06;
    for (let s = 0; s < on; s++){
      const a0 = -Math.PI / 2 + s * Math.PI * 2 / SEG + gap, a1 = a0 + Math.PI * 2 / SEG - gap * 2;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#1b1d26'; ctx.lineWidth = width + 4;
      ctx.beginPath(); ctx.arc(W/2, H/2, R, a0 - 0.02, a1 + 0.02); ctx.stroke();
      ctx.strokeStyle = TECH_KINDS[k].color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(W/2, H/2, R, a0, a1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1, width * 0.3);
      ctx.beginPath(); ctx.arc(W/2, H/2, R - width * 0.25, a0, a1); ctx.stroke();
    }
    ctx.restore();
  };
  const t = activeTech();
  if (t && isBuffKind(t.kind) && !t.fused){
    const c = t.nbCharge || 0;
    ring(t.kind, 1, 34, 3, 0.18);                                  // fondo del círculo
    if (c >= 1){
      ring(t.kind, 1, 34 + Math.sin(match.elapsed * 8) * 2, 5, 0.95);
      ctx.save(); ctx.globalAlpha = 0.12 + 0.06 * Math.sin(match.elapsed * 8);
      ctx.fillStyle = TECH_KINDS[t.kind].color; ctx.beginPath(); ctx.arc(W/2, H/2, 34, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else ring(t.kind, c, 34, 4, 0.85);
  }
  // mejora en marcha: el MISMO círculo de cuando estaba cargado, que se va vaciando
  let r = 34;
  for (const k of Object.keys(NOTEBOOK_TECHS)){
    if (!nbBonus(k)) continue;
    if (nbFusedActive(k)){ ring(k, 1, r, 4, 0.8); r += 7; continue; }
    const frac = Math.max(0, (match.nbUntil[k] - match.elapsed) / (match.nbDurs[k] || 1));
    ring(k, 1, r, 3, 0.18);                                        // fondo
    ring(k, frac, r, 5, 0.95);                                     // lo que queda
    ctx.save(); ctx.globalAlpha = 0.12 * frac;
    ctx.fillStyle = TECH_KINDS[k].color; ctx.beginPath(); ctx.arc(W/2, H/2, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    r += 7;
  }
}


/* ======================================================================
   EFECTOS VISUALES DE LAS SUPERTÉCNICAS (solo dibujo: no cambian daño ni hitbox)
   - Disparo normal: balón blanco y negro sin colores.
   - Supertécnicas de FUEGO: balones rojizos con estela y aura de brasas,
     golpe cercano en llamas, meteoritos, triángulo ardiente, pájaro de fuego,
     suelo en llamas y alas del fénix.
   ====================================================================== */
/* paletas de las animaciones por afinidad (solo visual)
   kind = partícula decorativa: fuego → brasas y llamitas, aire → ráfagas de viento,
   bosque → hojas, montaña → piedrecitas */
const FX_PAL = {
  // accent = color de detalle (partículas secundarias); kind2 = partícula secundaria
  fire:      { core:'#fff3b0', mid:'#ffb02e', hot:'#ff4a1a', deep:'#c81e0c', tint:'#ffe0c0', ink:'#6a1004', ground:'#3a1206', blend:'lighter',     kind:'ember', accent:'#ffe14a', kind2:'flame' },
  air:       { core:'#ffffff', mid:'#e6f4ff', hot:'#8fcfff', deep:'#3f7fd0', tint:'#ffffff', ink:'#2a5a8a', ground:'#9fb8cc', blend:'source-over', kind:'wind',  accent:'#b9c3cf', kind2:'gust' },
  forest:    { core:'#efffc8', mid:'#a6e36e', hot:'#3fbf45', deep:'#1f6e26', tint:'#f1e6ff', ink:'#4a1f7a', ground:'#2a1a40', blend:'source-over', kind:'leaf',  accent:'#b56ae6', accent2:'#7a2fb8', kind2:'spark', mix:0.6 },   // planta: verde con MUCHO morado
  mountain:  { core:'#f0d8a8', mid:'#c9894a', hot:'#9a5c26', deep:'#5e3612', tint:'#efd8b8', ink:'#4a2c12', ground:'#4a2e14', blend:'source-over', kind:'rock',  accent:'#7a5a3a', kind2:'dust' },
  dragon:    { core:'#c9d4ff', mid:'#6f7fe8', hot:'#3a46c8', deep:'#1a1f6e', tint:'#dfe4ff', ink:'#141a5a', ground:'#141a4a', blend:'lighter',     kind:'scale', accent:'#a24de0', kind2:'spark' },
  celestial: { core:'#ffffff', mid:'#fff6c0', hot:'#ffe04a', deep:'#d8a81a', tint:'#fffbe6', ink:'#a8780a', ground:'#c9921a', blend:'source-over', kind:'holy',  accent:'#ffffff', kind2:'ray' },
};
let FIRE = FX_PAL.fire;                       // paleta en uso (la fija isFireFx justo antes de dibujar)
function hexA(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
const fxState = { embers: [], lastT: 0 };
function isFireFx(el){ const P = FX_PAL[el]; if (P) FIRE = P; return !!P; }
/* brasas: partículas que suben y se apagan (aura que deja el fuego) */
function emitEmber(x, y, o = {}){
  if (fxState.embers.length > 500) return;
  fxState.embers.push({ x, y, vx: (o.vx || 0) + (Math.random() - 0.5) * (o.spread || 30), vy: (o.vy || 0) - 20 - Math.random() * 40,
    life: o.life || 0.5 + Math.random() * 0.4, dur: 0, r: o.r || 2 + Math.random() * 3, P: FIRE, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 8 });
  const e = fxState.embers[fxState.embers.length - 1];
  if (FIRE.kind === 'leaf'){ e.vy = 10 + Math.random() * 20; e.vx += (Math.random() - 0.5) * 30; e.life += 0.4; }
  if (FIRE.kind === 'rock'){ e.vy = -40 - Math.random() * 40; e.g = 260; }
  if (FIRE.kind === 'wind'){ e.vx += (Math.random() < 0.5 ? -1 : 1) * 40; e.vy *= 0.3; e.life += 0.2; }
  if (FIRE.kind === 'scale'){ e.vy *= 0.5; e.life += 0.2; }
  if (FIRE.kind === 'holy'){ e.vy = -10 - Math.random() * 25; e.vx *= 0.4; e.life += 0.3; }
  // detalle secundario de la afinidad (llamitas, rafaguitas, chispas moradas, polvo, rayos de luz)
  if (!o.noAccent && Math.random() < 0.35 + (FIRE.mix || 0) * 0.55 && fxState.embers.length < 500){
    const s = { ...e, kind2: FIRE.kind2, r: 1.5 + Math.random() * 2, vx: e.vx * 0.6 + (Math.random() - 0.5) * 30, vy: e.vy * 0.6 - 10, life: e.life * 0.8, dur: 0, g: FIRE.kind2 === 'dust' ? 60 : 0 };
    fxState.embers.push(s);
  }
}
function updateDrawEmbers(camX, camY){
  const dt = Math.max(0, Math.min(0.1, match.elapsed - (fxState.lastT || match.elapsed)));
  fxState.lastT = match.elapsed;
  ctx.save();
  for (const e of fxState.embers){
    if (e.dur === 0) e.dur = e.life;
    e.life -= dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.96; e.rot += e.spin * dt;
    if (e.g) e.vy += e.g * dt;
    const k = Math.max(0, e.life / e.dur), P = e.P, x = e.x + camX, y = e.y + camY;
    ctx.globalAlpha = k;
    ctx.globalCompositeOperation = P.blend;
    if (e.kind2){                                               // partículas secundarias de detalle
      const s = Math.max(1, Math.round(e.r * (0.6 + k * 0.4)));
      if (e.kind2 === 'flame'){ flameTongue(x, y, -Math.PI / 2 + Math.sin(e.rot) * 0.3, 5 + 6 * k, 1.8, k > 0.5 ? P.accent : P.hot); }
      else if (e.kind2 === 'gust'){ ctx.fillStyle = P.accent; ctx.fillRect(Math.round(x - s * 2), Math.round(y), s * 4, 1); ctx.fillRect(Math.round(x), Math.round(y - 2), s * 2, 1); }
      else if (e.kind2 === 'spark'){ ctx.fillStyle = P.accent; ctx.fillRect(Math.round(x - s), Math.round(y), s * 2 + 1, 1); ctx.fillRect(Math.round(x), Math.round(y - s), 1, s * 2 + 1); }
      else if (e.kind2 === 'dust'){ ctx.fillStyle = P.accent; ctx.fillRect(Math.round(x), Math.round(y), s, s); }
      else if (e.kind2 === 'ray'){ ctx.fillStyle = P.accent; ctx.fillRect(Math.round(x), Math.round(y - s * 3), 1, s * 6); ctx.fillStyle = P.hot; ctx.fillRect(Math.round(x - s), Math.round(y), s * 2 + 1, 1); }
      continue;
    }
    if (P.kind === 'scale'){                                    // escama de dragón: rombo azul oscuro con borde morado
      const s = 2 + e.r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(e.rot);
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath();
      ctx.fillStyle = k > 0.5 ? P.mid : P.hot; ctx.fill(); ctx.strokeStyle = P.accent; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore(); continue;
    }
    if (P.kind === 'holy'){                                     // luz divina: destello en cruz blanco y dorado
      const s = 2 + e.r * 1.2;
      ctx.fillStyle = P.hot; ctx.fillRect(Math.round(x - s), Math.round(y), Math.round(s * 2), 2); ctx.fillRect(Math.round(x), Math.round(y - s), 2, Math.round(s * 2));
      ctx.fillStyle = P.core; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 3, 3);
      continue;
    }
    if (P.kind === 'ember'){                                    // brasa + llamita
      ctx.fillStyle = k > 0.6 ? P.core : k > 0.3 ? P.mid : P.deep;
      const s = Math.max(1, e.r * (0.5 + k * 0.5));
      ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      if (e.r > 3) flameTongue(x, y, -Math.PI / 2 + Math.sin(e.rot) * 0.3, 6 + 6 * k, 2, P.hot);
    } else if (P.kind === 'wind'){                              // rafaguita: trazo curvo blanco
      ctx.strokeStyle = k > 0.5 ? P.core : P.hot; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      const r = 5 + e.r * 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, e.rot, e.rot + 2.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r * 1.6, y + r * 0.6); ctx.lineTo(x + r * 0.2, y + r * 0.6); ctx.stroke();
    } else if (P.kind === 'leaf'){                              // hojita que cae girando
      ctx.save(); ctx.translate(x, y); ctx.rotate(e.rot);
      const s = 3 + e.r;
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = k > 0.5 ? P.hot : P.deep; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.strokeStyle = P.core; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.restore();
    } else if (P.kind === 'rock'){                              // piedrecita que salta y cae
      ctx.save(); ctx.translate(x, y); ctx.rotate(e.rot);
      const s = 2 + e.r;
      ctx.fillStyle = P.hot; ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = P.core; ctx.fillRect(-s / 2, -s / 2, s / 2, s / 3);
      ctx.fillStyle = P.deep; ctx.fillRect(0, 0, s / 2, s / 2);
      ctx.restore();
    }
  }
  ctx.restore();
  fxState.embers = fxState.embers.filter(e => e.life > 0);
}
/* balón de fútbol: pentágono central + 5 manchas alrededor, girando
   tint = color de la parte blanca, ink = color de las manchas */
function drawSoccerBall(x, y, r, rot = 0, tint = '#ffffff', ink = '#1b1d26'){
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = tint; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const pent = (cx, cy, s, a0) => { ctx.beginPath(); for (let k = 0; k < 5; k++){ const a = a0 + k * Math.PI * 2 / 5; const px = cx + Math.cos(a) * s, py = cy + Math.sin(a) * s; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = ink;
  pent(x, y, r * 0.34, rot - Math.PI / 2);                                  // pentágono central
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.8, r * 0.08);
  for (let k = 0; k < 5; k++){                                                // costuras y pentágonos del borde
    const a = rot - Math.PI / 2 + k * Math.PI * 2 / 5;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36); ctx.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); ctx.stroke();
    pent(x + Math.cos(a + Math.PI / 5) * r * 1.02, y + Math.sin(a + Math.PI / 5) * r * 1.02, r * 0.26, a + Math.PI / 5);
  }
  // brillo y sombra para que parezca una esfera
  const sh = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  sh.addColorStop(0, 'rgba(255,255,255,0.45)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = sh; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 1.2; ctx.strokeStyle = ink; ctx.stroke();
}
/* balón básico (blanco y negro) */
function drawPlainBall(x, y, r, crit){
  if (crit){ ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(242,183,5,0.45)'; ctx.fill(); }
  drawSoccerBall(x, y, Math.max(8, r + 3), match.elapsed * 12 + x * 0.05);
}
/* bola de fuego: estela en llamas detrás + halo + núcleo */
function drawFireBall(x, y, r, vx, vy, trail = 4, flick = 0){
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp;
  const t = match.elapsed * 30 + flick;
  ctx.save(); ctx.globalCompositeOperation = FIRE.blend;
  // estela: círculos que se encogen hacia atrás, con parpadeo
  const L = sp * trail;
  for (let i = 6; i >= 1; i--){
    const f = i / 6, wob = Math.sin(t + i * 1.7) * r * 0.25;
    const tx = x - ux * L * f - uy * wob, ty = y - uy * L * f + ux * wob;
    ctx.globalAlpha = 0.55 * (1 - f) + 0.1;
    ctx.fillStyle = FIRE.mix && i % 2 ? (f > 0.5 ? FIRE.accent2 : FIRE.accent) : (f > 0.6 ? FIRE.deep : f > 0.3 ? FIRE.hot : FIRE.mid);
    ctx.beginPath(); ctx.arc(tx, ty, r * (1.15 - f * 0.75), 0, Math.PI * 2); ctx.fill();
  }
  // halo
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  gr.addColorStop(0, hexA(FIRE.mid, 0.9)); gr.addColorStop(0.5, hexA(FIRE.mix ? FIRE.accent : FIRE.hot, 0.45)); gr.addColorStop(1, hexA(FIRE.mix ? FIRE.accent2 : FIRE.deep, 0));
  ctx.globalAlpha = 1; ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // detalle: dos chispas del color de acento que giran alrededor del balón
  for (let k = 0; k < 2; k++){
    const a = match.elapsed * 9 + flick + k * Math.PI;
    ctx.fillStyle = FIRE.accent || FIRE.core;
    ctx.fillRect(Math.round(x + Math.cos(a) * r * 1.5 - 1.5), Math.round(y + Math.sin(a) * r * 1.5 - 1.5), 3, 3);
  }
  // núcleo: balón de fútbol al rojo vivo (gira mientras vuela)
  drawSoccerBall(x, y, Math.max(8, r * 1.25), match.elapsed * 14 + flick, FIRE.tint, FIRE.ink);
  ctx.save(); ctx.globalCompositeOperation = FIRE.blend; ctx.globalAlpha = 0.15;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = FIRE.hot; ctx.fill(); ctx.restore();
}
/* lengua de fuego (gota alargada) orientada con el ángulo a */
function flameTongue(x, y, a, len, w, color){
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a + Math.PI / 2) * w, y + Math.sin(a + Math.PI / 2) * w);
  ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + Math.cos(a + Math.PI / 2) * w, y + Math.sin(a) * len * 0.5 + Math.sin(a + Math.PI / 2) * w, x + Math.cos(a) * len, y + Math.sin(a) * len);
  ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - Math.cos(a + Math.PI / 2) * w, y + Math.sin(a) * len * 0.5 - Math.sin(a + Math.PI / 2) * w, x - Math.cos(a + Math.PI / 2) * w, y - Math.sin(a + Math.PI / 2) * w);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
/* puño en llamas (mirando hacia +x en coordenadas locales) */
function drawFirePunch(x, y, ang, s, k){
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  // estela de fuego detrás del puño
  ctx.globalCompositeOperation = FIRE.blend;
  for (let i = 0; i < 3; i++) flameTongue(-14, (i - 1) * 6, Math.PI + (i - 1) * 0.25 + Math.sin(match.elapsed * 30 + i) * 0.1, 26 + 8 * Math.sin(match.elapsed * 25 + i), 5, i === 1 ? FIRE.mid : FIRE.deep);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
  gr.addColorStop(0, hexA(FIRE.mid, 0.7)); gr.addColorStop(1, hexA(FIRE.deep, 0));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const rr = (x0, y0, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#4a1204'; ctx.stroke(); };
  rr(-20, -9, 7, 18, 2, FIRE.deep);                                 // muñequera
  rr(-14, -11, 16, 22, 6, '#ffb36b');                               // palma
  for (let f = 0; f < 4; f++) rr(-1, -11 + f * 5.5, 12, 5.5, 2.5, f % 2 ? '#ffc488' : '#ffb36b');   // dedos doblados (nudillos delante)
  rr(-10, 4, 13, 6, 3, '#ffa95c');                                  // pulgar
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(4, -10, 5, 2);   // brillo en los nudillos
  ctx.restore();
}
/* golpe cercano en llamas (Despeje de fuego / Puño vengativo) */
/* ===== golpes cuerpo a cuerpo: estela de golpe rápida (estilo arcade) + chispazos en cada rival golpeado =====
   fuego: estela de llamas · aire: corte de viento con rayas · bosque: barrido de hojas moradas · montaña: golpe con piedras
   dragón: tres arañazos de garra · celestial: arco de luz con destellos */
const easeOut3 = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
function meleeStar(x, y, size, c1, c2){                                         // chispazo de impacto en cruz/estrella
  ctx.fillStyle = '#1b1d26';
  ctx.beginPath(); ctx.moveTo(x, y - size - 2); ctx.lineTo(x + size * 0.32 + 1.5, y - size * 0.32 - 1.5); ctx.lineTo(x + size + 2, y); ctx.lineTo(x + size * 0.32 + 1.5, y + size * 0.32 + 1.5);
  ctx.lineTo(x, y + size + 2); ctx.lineTo(x - size * 0.32 - 1.5, y + size * 0.32 + 1.5); ctx.lineTo(x - size - 2, y); ctx.lineTo(x - size * 0.32 - 1.5, y - size * 0.32 - 1.5); ctx.closePath(); ctx.fill();
  const st = (sz, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.lineTo(x + sz * 0.3, y - sz * 0.3); ctx.lineTo(x + sz, y); ctx.lineTo(x + sz * 0.3, y + sz * 0.3);
    ctx.lineTo(x, y + sz); ctx.lineTo(x - sz * 0.3, y + sz * 0.3); ctx.lineTo(x - sz, y); ctx.lineTo(x - sz * 0.3, y - sz * 0.3); ctx.closePath(); ctx.fill(); };
  st(size, c1); st(size * 0.55, c2);
}
function smearArc(cx, cy, R, b0, b1, th, fill, outline){                       // media luna afilada: fina en la cola, gruesa en la cabeza
  const N = 16, dir = b1 >= b0 ? 1 : -1;
  ctx.beginPath();
  for (let i = 0; i <= N; i++){ const t = i / N, a = b0 + (b1 - b0) * t, w = th * Math.pow(t, 0.7) * (t > 0.88 ? 1 - (t - 0.88) / 0.12 * 0.6 : 1); ctx.lineTo(cx + Math.cos(a) * (R + w * 0.55), cy + Math.sin(a) * (R + w * 0.55)); }
  for (let i = N; i >= 0; i--){ const t = i / N, a = b0 + (b1 - b0) * t, w = th * Math.pow(t, 0.7) * (t > 0.88 ? 1 - (t - 0.88) / 0.12 * 0.6 : 1); ctx.lineTo(cx + Math.cos(a) * (R - w * 0.45), cy + Math.sin(a) * (R - w * 0.45)); }
  ctx.closePath();
  if (outline){ ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1d26'; ctx.stroke(); }
  ctx.fillStyle = fill; ctx.fill();
}
function drawMeleeSlash(sl){
  const el = sl.fx, P = FIRE, s = 1 - sl.life / sl.dur, cx = W / 2, cy = H / 2;
  const a0 = sl.ang - sl.arc / 2, a1 = sl.ang + sl.arc / 2, spin = (sl.seed = sl.seed ?? (Math.random() < 0.5 ? 1 : -1));
  const [from, to] = spin > 0 ? [a0, a1] : [a1, a0];                             // alterna el sentido del golpe
  const head = from + (to - from) * easeOut3(s / 0.5), tail = from + (to - from) * easeOut3((s - 0.18) / 0.7);
  const fade = s > 0.55 ? 1 - (s - 0.55) / 0.45 : 1, big = sl.big ? 1.2 : 1, R = sl.range * 0.62;
  ctx.save();
  if (!sl.flurry){
    if (el === 'dragon'){                                                          // tres arañazos de garra
      for (let j = -1; j <= 1; j++){
        const rr = R + j * 15, hh = head - j * 0.06 * spin;
        ctx.globalAlpha = fade;
        smearArc(cx, cy, rr, tail, hh, 9 * big, P.deep, true);
        smearArc(cx, cy, rr + 1, tail + (hh - tail) * 0.25, hh, 5 * big, P.hot, false);
        smearArc(cx, cy, rr + 2, tail + (hh - tail) * 0.55, hh, 2 * big, P.core, false);
      }
    } else {
      const th = (el === 'mountain' ? 30 : 24) * big;
      ctx.globalAlpha = fade;
      smearArc(cx, cy, R, tail, head, th, P.mix ? P.accent2 : P.deep, true);
      smearArc(cx, cy, R + th * 0.12, tail + (head - tail) * 0.2, head, th * 0.62, P.mix ? P.accent : P.hot, false);
      smearArc(cx, cy, R + th * 0.32, tail + (head - tail) * 0.5, head, th * 0.2, P.core, false);
      // rayas de velocidad detrás de la estela
      ctx.lineCap = 'round'; ctx.strokeStyle = el === 'air' ? '#ffffff' : P.core;
      const nl = el === 'air' ? 4 : 2;
      for (let k = 0; k < nl; k++){
        const rr = R + (k % 2 ? 1 : -1) * th * (0.8 + 0.3 * k), span = (head - tail) * (0.55 - 0.08 * k);
        ctx.globalAlpha = 0.7 * fade; ctx.lineWidth = el === 'air' ? 2.5 : 2;
        ctx.beginPath(); ctx.arc(cx, cy, rr, Math.min(head - span, head), Math.max(head - span, head)); ctx.stroke();
      }
    }
    if (s < 0.5){                                                                  // destello en la punta del golpe
      ctx.globalAlpha = 1 - s * 2;
      meleeStar(cx + Math.cos(head) * R, cy + Math.sin(head) * R, 9 * big * (1 - s), '#ffffff', P.core);
    }
  }
  // chispazos sobre cada rival golpeado
  if (sl.hits && s < 0.8){
    ctx.globalAlpha = 1 - s / 0.8;
    for (const [hx, hy] of sl.hits){ const z = (sl.flurry ? 8 : 12) * (1.15 - s); meleeStar(cx + hx, cy + hy - 10, z, P.mix ? P.accent : P.hot, '#ffffff'); }
  }
  ctx.restore();
  if (!sl.embered){ sl.embered = true;                                            // partículas de su afinidad (hojas, piedras, brasas, viento, escamas, luz)
    for (const [hx, hy] of (sl.hits || [])) for (let k = 0; k < (sl.flurry ? 1 : 3); k++) emitEmber(match.x + hx, match.y + hy - 8, { spread: el === 'mountain' ? 160 : 90 });
    if (!sl.flurry) for (let k = 0; k < 3; k++){ const a = sl.ang + (Math.random() - 0.5) * sl.arc; emitEmber(match.x + Math.cos(a) * R, match.y + Math.sin(a) * R, { spread: 50 }); }
  }
}
/* escudo esfera del color de la afinidad mientras golpea (y toda la definitiva) */
function drawMeleeShield(){
  if (!techLvl('melee')) return;
  const el = techElement('melee'); if (!isFireFx(el)) return;
  const P = FIRE, since = match.elapsed - (match.meleeShieldT ?? -99), dur = match.meleeShieldDur || 0.4;
  let a = 0, grow = 1;
  if (match.flurry){ const left = match.flurry.until - match.elapsed, t = match.elapsed - (match.flurry.start ?? match.elapsed); a = Math.min(1, left / 0.25); grow = easeOut3(t / 0.15); }   // solo en la definitiva
  if (a <= 0) return;
  const range = match.flurry ? match.flurry.range : meleeStats(techLvl('melee')).range;   // la pompa ocupa todo el alcance del golpe
  const cx = W / 2, cy = H / 2 - ((fenixState() || {}).h || 0), R = range * 0.78 * (0.55 + 0.45 * grow);
  const c1 = P.mix ? P.accent : P.hot, c2 = P.mix ? P.accent2 : P.deep;
  ctx.save();
  // burbuja translúcida
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, hexA(P.core, 0.05 * a)); g.addColorStop(0.75, hexA(c1, 0.1 * a)); g.addColorStop(1, hexA(c1, 0.34 * a));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.fill();
  // borde: contorno oscuro + color + brillo, con un pulso
  const pulse = 1 + 0.04 * Math.sin(match.elapsed * 18);
  ctx.globalAlpha = 0.75 * a; ctx.lineWidth = 5; ctx.strokeStyle = c2; ctx.beginPath(); ctx.arc(cx, cy, R * pulse, 0, 6.28); ctx.stroke();
  ctx.globalAlpha = 0.9 * a; ctx.lineWidth = 2.5; ctx.strokeStyle = c1; ctx.stroke();
  // hexágonos que giran por la superficie
  ctx.globalAlpha = 0.35 * a; ctx.lineWidth = 1.5; ctx.strokeStyle = P.core;
  for (let k = 0; k < 6; k++){
    const ang = match.elapsed * 1.6 + k * Math.PI / 3, z = Math.cos(ang); if (z < 0) continue;
    const hx = cx + Math.sin(ang) * R * 0.62, hy = cy + (k % 2 ? -1 : 1) * R * 0.28, hr = R * 0.11 * (0.5 + 0.5 * z);
    ctx.beginPath(); for (let j = 0; j <= 6; j++){ const b = j * Math.PI / 3; ctx.lineTo(hx + Math.cos(b) * hr, hy + Math.sin(b) * hr); } ctx.stroke();
  }
  // reflejo de cristal arriba a la izquierda
  ctx.globalAlpha = 0.7 * a; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, Math.PI * 1.08, Math.PI * 1.38); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(cx - R * 0.42), Math.round(cy - R * 0.7), 5, 5);
  ctx.restore();
}
/* definitiva cuerpo a cuerpo: torbellino de golpes girando a su alrededor */
function drawFlurryRing(){
  const f = match.flurry, P = FIRE, cx = W / 2, cy = H / 2, R = f.range * 0.62;
  const left = f.until - match.elapsed, fade = Math.min(1, left / 0.25), a = match.elapsed * 15;
  ctx.save();
  ctx.globalAlpha = 0.16 * fade; ctx.fillStyle = P.hot; ctx.beginPath(); ctx.arc(cx, cy, R + 26, 0, 6.28); ctx.fill();   // zona
  ctx.globalAlpha = 0.5 * fade; ctx.lineWidth = 2; ctx.strokeStyle = P.core; ctx.setLineDash([8, 10]); ctx.lineDashOffset = -match.elapsed * 120;
  ctx.beginPath(); ctx.arc(cx, cy, R + 26, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
  for (let k = 0; k < 3; k++){                                                     // tres estelas girando
    const h = a + k * Math.PI * 2 / 3, rr = R + (k - 1) * 12;
    ctx.globalAlpha = 0.95 * fade;
    smearArc(cx, cy, rr, h - 1.6, h, 22, P.mix ? P.accent2 : P.deep, true);
    smearArc(cx, cy, rr + 3, h - 1.1, h, 13, P.mix ? P.accent : P.hot, false);
    smearArc(cx, cy, rr + 6, h - 0.6, h, 4, P.core, false);
  }
  ctx.restore();
  if (Math.random() < 0.7){ const b = Math.random() * 6.28; emitEmber(match.x + Math.cos(b) * R, match.y + Math.sin(b) * R, { spread: 120 }); }
}
function drawFireSlash(sl){
  // muralla de fuego del color de la afinidad: sale pequeñita junto al jugador y crece hasta el borde del abanico
  const k = sl.life / sl.dur, s = 1 - k;
  const step = Math.min(4, Math.floor((1 - (1 - s) * (1 - s)) * 4) + 1), p = step / 4;   // 4 fotogramas a saltos, como en arcade
  const r = sl.range, cx = W / 2, cy = H / 2;
  const a0 = sl.ang - sl.arc / 2, a1 = sl.ang + sl.arc / 2;
  const fade = step === 4 ? Math.min(1, k * 3) : 1;
  // media luna: grosor máximo en el centro y punta fina en los extremos
  const crescent = (R, th, span, fill, outline) => {
    const N = 14, b0 = sl.ang - span / 2;
    ctx.beginPath();
    for (let i = 0; i <= N; i++){ const t = i / N, a = b0 + span * t; ctx.lineTo(cx + Math.cos(a) * (R + th * 0.35 * Math.sin(Math.PI * t)), cy + Math.sin(a) * (R + th * 0.35 * Math.sin(Math.PI * t))); }
    for (let i = N; i >= 0; i--){ const t = i / N, a = b0 + span * t; ctx.lineTo(cx + Math.cos(a) * (R - th * 0.65 * Math.sin(Math.PI * t)), cy + Math.sin(a) * (R - th * 0.65 * Math.sin(Math.PI * t))); }
    ctx.closePath();
    if (outline){ ctx.lineWidth = 3; ctx.strokeStyle = '#1b1d26'; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.fillStyle = fill; ctx.fill();
  };
  // llama ondulada que va por detrás de cada muro
  const wavy = (R, amp, span, color, width, seed) => {
    const N = 18, b0 = sl.ang - span / 2;
    ctx.beginPath();
    for (let i = 0; i <= N; i++){
      const t = i / N, a = b0 + span * t, w = Math.sin(t * 14 + seed + match.elapsed * 22) * amp * Math.sin(Math.PI * t);
      ctx.lineTo(cx + Math.cos(a) * (R + w), cy + Math.sin(a) * (R + w));
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = width + 2.5; ctx.strokeStyle = 'rgba(27,29,38,0.55)'; ctx.stroke();   // contorno para que se vea en cualquier suelo
    ctx.globalCompositeOperation = op; ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
  };
  ctx.save();
  // zona de alcance del golpe: el mismo abanico (triángulo) que el latigazo
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
  ctx.globalAlpha = 0.22 * k; ctx.fillStyle = FIRE.hot; ctx.fill();
  ctx.globalAlpha = 0.6 * k; ctx.lineWidth = 3; ctx.strokeStyle = '#1b1d26'; ctx.stroke();
  ctx.globalAlpha = 0.8 * k; ctx.lineWidth = 1.5; ctx.strokeStyle = FIRE.core; ctx.stroke();
  // muros: el delantero es el más grande; detrás quedan los de los fotogramas anteriores, más pequeños
  const big = sl.big ? 1.3 : 1;
  for (let j = step; j >= 1; j--){
    const q = j / 4, R = r * (0.22 + 0.78 * q), span = sl.arc * (0.35 + 0.65 * q);
    const front = j === step, age = step - j;
    const th = (5 + 13 * q) * big * (front ? 1 : 0.7);
    const alpha = fade * (front ? 1 : Math.max(0.25, 0.75 - age * 0.2));
    // llama ondulada justo detrás del muro (crece con él)
    ctx.globalCompositeOperation = FIRE.blend;
    ctx.globalAlpha = alpha * 0.9;
    if (j > 1) wavy(R - th * 0.9 - 4, 3 + 5 * q, span * 0.85, FIRE.mix && j % 2 ? FIRE.accent : FIRE.hot, 2 + 1.5 * q * big, j * 2.3);
    if (front && j > 2) wavy(R - th * 0.9 - 14 - 6 * q, 2 + 3 * q, span * 0.45, FIRE.mid, 2, j * 4.1);
    // muro
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    crescent(R, th, span, FIRE.mix && !front ? FIRE.accent2 : FIRE.deep, true);
    crescent(R, th * 0.62, span * 0.92, front ? FIRE.hot : FIRE.mid, false);
    if (front) crescent(R + th * 0.08, th * 0.22, span * 0.7, FIRE.core, false);
  }
  ctx.restore();
  if (!sl.embered){ sl.embered = true;
    for (let i = 0; i < (sl.big ? 10 : 6); i++){ const a = a0 + (a1 - a0) * Math.random(); emitEmber(match.x + Math.cos(a) * r, match.y + Math.sin(a) * r, { vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 }); } }
}
/* suelo en llamas (Pájaro de fuego) */
function drawFirePatch(pa, camX, camY){
  const k = Math.min(1, (pa.life / pa.dur) * 3), x = pa.x + camX, y = pa.y + camY, r = pa.r;
  ctx.save();
  ctx.globalAlpha = 0.3 * k;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fillStyle = FIRE.ground; ctx.fill();      // suelo marcado (quemado, helado, con hierba o agrietado)
  ctx.globalCompositeOperation = FIRE.blend;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, hexA(FIRE.mid, 0.55)); gr.addColorStop(0.6, hexA(FIRE.hot, 0.35)); gr.addColorStop(1, hexA(FIRE.deep, 0));
  ctx.globalAlpha = k * (0.85 + 0.15 * Math.sin(match.elapsed * 12 + pa.x));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  // llamas que bailan
  for (let i = 0; i < 7; i++){
    const a = i * 0.9 + pa.x * 0.01, d = r * (0.2 + 0.55 * ((i * 37) % 10) / 10);
    const fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d * 0.8;
    const h = (14 + 10 * Math.sin(match.elapsed * 14 + i * 1.9)) * k;
    flameTongue(fx, fy + 6, -Math.PI / 2 + Math.sin(match.elapsed * 6 + i) * 0.2, h + 8, 5, FIRE.deep);
    flameTongue(fx, fy + 6, -Math.PI / 2 + Math.sin(match.elapsed * 6 + i) * 0.2, h, 3.5, FIRE.mix && i % 2 ? FIRE.accent : FIRE.hot);
    flameTongue(fx, fy + 6, -Math.PI / 2, h * 0.5, 2, FIRE.core);
  }
  ctx.restore();
  if (Math.random() < 0.35) emitEmber(pa.x + (Math.random() - 0.5) * r * 1.4, pa.y + (Math.random() - 0.5) * r, { spread: 20 });
}
/* Pájaro de fuego: balón en llamas con alas que se baten */
function drawFireBird(p, camX, camY){
  const x = p.x + camX, y = p.y + camY, a = Math.atan2(p.vy, p.vx);
  drawFireBall(x, y, p.r, p.vx, p.vy, 6);
  ctx.save(); ctx.globalCompositeOperation = FIRE.blend;
  const flap = Math.sin(match.elapsed * 22) * 0.35;
  for (const s of [-1, 1]){
    const wa = a + Math.PI + s * (1.0 + flap);
    for (const [len, w, c] of [[p.r * 3.2, p.r * 0.9, FIRE.deep], [p.r * 2.6, p.r * 0.6, FIRE.hot], [p.r * 1.8, p.r * 0.35, FIRE.core]])
      flameTongue(x + Math.cos(a + s * Math.PI / 2) * p.r * 0.5, y + Math.sin(a + s * Math.PI / 2) * p.r * 0.5, wa, len, w, c);
  }
  // cola larga de plumas de fuego
  for (let i = 0; i < 3; i++) flameTongue(x - Math.cos(a) * p.r, y - Math.sin(a) * p.r, a + Math.PI + (i - 1) * 0.25 + Math.sin(match.elapsed * 15 + i) * 0.1, p.r * (3.5 - Math.abs(i - 1)), p.r * 0.4, i === 1 ? FIRE.mid : FIRE.deep);
  ctx.restore();
  for (let i = 0; i < 3; i++) emitEmber(p.x - p.vx * 2 * Math.random(), p.y - p.vy * 2 * Math.random(), { spread: 50, r: 3 + Math.random() * 3 });
}
/* Fénix: dos alas de fuego que se abren hacia donde dispara la bocanada */
function drawPhoenixWings(br){
  const a = br.ang ?? Math.atan2(match.aim.y, match.aim.x), cx = W / 2, cy = H / 2 - ((fenixState() || {}).h || 0) * 0.6;
  const left = Math.max(0, br.until - match.elapsed);
  const open = Math.min(1, left * 3, (match.elapsed - (br.start ?? (br.start = match.elapsed))) * 4 + 0.15);
  const flap = Math.sin(match.elapsed * 14) * 0.1;
  ctx.save();
  for (const s of [-1, 1]){
    // ala: plumas largas en abanico, de dentro (cortas) a fuera (largas)
    for (let f = 6; f >= 0; f--){
      // las plumas salen hacia los lados y se curvan hacia atrás, como unas alas abiertas
      const fa = a + s * (Math.PI / 2 - 0.55 + f * 0.17 + flap) * (0.55 + 0.45 * open);
      const len = (70 + (6 - Math.abs(f - 2)) * 18) * open * (0.92 + 0.08 * Math.sin(match.elapsed * 26 + f));
      const bx = cx + Math.cos(a) * 18 + Math.cos(a + s * Math.PI / 2) * 8, by = cy + Math.sin(a) * 18 + Math.sin(a + s * Math.PI / 2) * 8;
      ctx.globalAlpha = 0.9;
      flameTongue(bx, by, fa, len, 13 - f * 0.9, FIRE.deep);
      flameTongue(bx, by, fa, len * 0.82, 8.5 - f * 0.6, FIRE.mix && f % 2 ? FIRE.accent : FIRE.hot);
      ctx.globalAlpha = 0.85;
      flameTongue(bx, by, fa, len * 0.5, 4, FIRE.mix ? FIRE.accent2 : FIRE.mid);
    }
  }
  // cuerpo y cabeza del fénix hacia delante
  ctx.globalAlpha = 0.95;
  flameTongue(cx, cy, a, 70 * open, 10, FIRE.deep);
  flameTongue(cx, cy, a, 58 * open, 6, FIRE.hot);
  flameTongue(cx, cy, a, 40 * open, 3, FIRE.core);
  ctx.globalCompositeOperation = FIRE.blend;
  const hx = cx + Math.cos(a) * 62 * open, hy = cy + Math.sin(a) * 62 * open;
  const gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, 26);
  gr.addColorStop(0, hexA(FIRE.core, 0.8)); gr.addColorStop(1, hexA(FIRE.hot, 0));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hx, hy, 26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (Math.random() < 0.6) emitEmber(match.x + Math.cos(a) * 60, match.y + Math.sin(a) * 60, { spread: 120 });
}
/* Triángulo Z en llamas: bordes de fuego, vértices ardiendo y brillo en el centro */
function drawFireTriangle(tr, camX, camY){
  const k = Math.min(1, tr.life / 0.4), t = match.elapsed;
  const pts = tr.pts.map(([x, y]) => [x + camX, y + camY]);
  ctx.save();
  ctx.globalAlpha = 0.18 * k;
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = FIRE.mix ? FIRE.accent2 : FIRE.deep; ctx.fill();
  ctx.globalCompositeOperation = FIRE.blend;
  for (const [w, c, a] of [[22, FIRE.mix ? FIRE.accent2 : FIRE.deep, 0.5], [12, FIRE.hot, 0.8], [6, FIRE.mix ? FIRE.accent : FIRE.core, 0.9], [2, FIRE.core, 1]]){
    ctx.globalAlpha = a * k;
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.strokeStyle = c; ctx.lineWidth = w + Math.sin(t * 20) * 2; ctx.lineJoin = 'round'; ctx.stroke();
  }
  // chispas que recorren los lados
  ctx.globalAlpha = k;
  for (let s = 0; s < 3; s++){
    const [ax, ay] = pts[s], [bx, by] = pts[(s + 1) % 3];
    for (let j = 0; j < 3; j++){
      const f = ((t * 0.9 + j / 3 + s * 0.17) % 1);
      const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 18);
      gr.addColorStop(0, hexA(FIRE.core, 1)); gr.addColorStop(1, hexA(FIRE.mix && j % 2 ? FIRE.accent : FIRE.hot, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
    }
  }
  // vértices: columnas de fuego
  for (const [x, y] of pts){
    const h = 40 + 10 * Math.sin(t * 18 + x);
    flameTongue(x, y + 8, -Math.PI / 2, h, 12, FIRE.mix ? FIRE.accent2 : FIRE.deep);
    flameTongue(x, y + 8, -Math.PI / 2, h * 0.75, 8, FIRE.mix ? FIRE.accent : FIRE.hot);
    flameTongue(x, y + 8, -Math.PI / 2, h * 0.45, 4, FIRE.core);
  }
  // centro: núcleo que crece (donde cae el remate)
  if (tr.c){
    const cx = tr.c[0] + camX, cy = tr.c[1] + camY, rr = 30 + 25 * (1 - tr.life / tr.dur);
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 2);
    gr.addColorStop(0, hexA(FIRE.core, 0.9)); gr.addColorStop(0.4, hexA(FIRE.mix ? FIRE.accent : FIRE.hot, 0.5)); gr.addColorStop(1, hexA(FIRE.mix ? FIRE.accent2 : FIRE.deep, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rr * 2, 0, Math.PI * 2); ctx.fill();
    // la Z dibujada con fuego en el centro (solo Triángulo Z, el de fuego)
    if (FIRE === FX_PAL.fire){
    ctx.lineWidth = 6; ctx.strokeStyle = FIRE.core; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy - 16); ctx.lineTo(cx - 16, cy + 16); ctx.lineTo(cx + 16, cy + 16); ctx.stroke(); }
  }
  ctx.restore();
  if (Math.random() < 0.6){ const s = Math.floor(Math.random() * 3), f = Math.random(); const [ax, ay] = tr.pts[s], [bx, by] = tr.pts[(s + 1) % 3]; emitEmber(ax + (bx - ax) * f, ay + (by - ay) * f); }
}
/* meteorito que cae (Chut granada / Triángulo Z de fuego) */
function drawFireMeteor(b, camX, camY){
  const k = Math.min(1, b.t / b.dur), bx = b.x + camX, by = b.y + camY;
  // zona de impacto: anillo de fuego que se cierra
  ctx.save();
  ctx.globalAlpha = 0.12 + 0.2 * k;
  ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.fillStyle = FIRE.mix ? FIRE.accent2 : FIRE.deep; ctx.fill();
  ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.strokeStyle = FIRE.mix ? FIRE.accent : FIRE.hot; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -match.elapsed * 40; ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(bx, by, b.r * (1 - k), 0, Math.PI * 2); ctx.strokeStyle = FIRE.core; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  // bola de fuego bajando en diagonal
  const h = (1 - k) * (1 - k) * 320, mx = bx - h * 0.35, my = by - h;
  drawFireBall(mx, my, b.big ? 18 : 13, 0.35, 1, 34, b.x);
}

/* ======================================================================
   TEMPORALES: desde el minuto 4:30, cada 3 minutos llega uno que dura 1 minuto.
   La afinidad del temporal pega más (+25 %) y su contraria pega menos (−20 %),
   tanto en tus ataques como en los disparos de los rivales.
   Lo visual es solo decorado: los relámpagos no hacen daño.
   ====================================================================== */
const WEATHER = {
  firstAt: 270, every: 180, dur: 60, boost: 1.25, nerf: 0.8,
  types: {
    heat:   { name:'Ola de calor',        el:'fire',      weak:'forest',    emoji:'🔥', color:'#ff6b3c' },
    wind:   { name:'Fuertes vientos',     el:'air',       weak:'mountain',  emoji:'🌬️', color:'#9fd8ff' },
    leaves: { name:'Hojarasca',           el:'forest',    weak:'air',       emoji:'🍂', color:'#7fd66f' },
    sand:   { name:'Tormenta de arena',   el:'mountain',  weak:'fire',      emoji:'🏜️', color:'#d9a35f' },
    storm:  { name:'Tormenta eléctrica',  el:'celestial', weak:'dragon',    emoji:'⛈️', color:'#ffe04a' },
    drake:  { name:'Aliento draco',       el:'dragon',    weak:'celestial', emoji:'🐉', color:'#8f7dff' },
  },
};
function weatherMult(el){
  const w = match && match.weather;
  if (!w || !el) return 1;
  const T = WEATHER.types[w.key];
  return el === T.el ? WEATHER.boost : el === T.weak ? WEATHER.nerf : 1;
}
function updateWeather(dt){
  if (match.nextWeatherAt === undefined) match.nextWeatherAt = WEATHER.firstAt;
  const w = match.weather;
  if (w && !clockRunning()) w.until += dt;                 // el clima se congela con el reloj de partido
  if (w && match.elapsed >= w.until){ match.weather = null; }
  if (!match.weather && !match.inArena && matchClock() >= match.nextWeatherAt){
    const keys = Object.keys(WEATHER.types).filter(k => k !== match.lastWeather);
    const key = keys[Math.floor(Math.random() * keys.length)];
    match.lastWeather = key;
    match.weather = { key, start: match.elapsed, until: match.elapsed + WEATHER.dur, parts: [], bolts: [], nextBolt: match.elapsed + 1.5 };
    match.nextWeatherAt += WEATHER.every;
    const T = WEATHER.types[key];
  }
  const hud = document.getElementById('hud-weather');
  if (hud){
    if (match.weather){
      const T = WEATHER.types[match.weather.key];
      hud.classList.remove('hidden'); hud.style.setProperty('--c', T.color);
      hud.innerHTML = `${T.emoji} ${T.name} <b>${Math.ceil(match.weather.until - match.elapsed)}s</b>`;
      hud.title = `${getElement(T.el).name} +25% · ${getElement(T.weak).name} −20%`;
    } else hud.classList.add('hidden');
    const bb = document.getElementById('boss-bar'); if (bb) bb.classList.toggle('with-weather', !!match.weather);   // la barra del boss baja para no tapar el temporal
  }
}
/* dibujo del temporal: tinte del mapa + partículas en píxeles (a pantalla completa) */
function drawWeather(){
  const w = match.weather;
  if (!w) return;
  const t = match.elapsed, k = Math.min(1, (t - w.start) / 2, (w.until - t) / 2);   // entra y sale suave
  if (k <= 0) return;
  const P = w.parts, rnd = Math.random, S = FX_PIXEL;          // S: tamaño de un píxel de la capa arcade
  const spawn = (n, f) => { while (P.length < n) P.push(f()); };
  const dt = Math.max(0, Math.min(0.1, t - (w.lastT ?? t))); w.lastT = t;
  pxBegin();
  ctx.save();
  const tint = (col, a) => { ctx.globalAlpha = a * k; ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; };
  const vignette = (col, a) => { const g = ctx.createRadialGradient(W/2, H/2, Math.min(W, H) * 0.25, W/2, H/2, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col); ctx.globalAlpha = a * k; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; };
  switch (w.key){
    case 'heat': {                                                    // mapa rojizo, calima que sube y brasas
      tint('#ff3a10', 0.10 + 0.03 * Math.sin(t * 2));
      vignette('rgba(160,20,0,0.9)', 0.35);
      ctx.globalAlpha = 0.10 * k; ctx.fillStyle = '#ffe2a0';
      for (let y = 0; y < H; y += 30){ const ox = Math.sin(t * 3 + y * 0.05) * 12; ctx.fillRect(ox, ((y - t * 30) % H + H) % H, W, S); }
      ctx.globalAlpha = 1;
      spawn(70, () => ({ x: rnd() * W, y: H + rnd() * H, v: 30 + rnd() * 50, s: 2 + rnd() * 3, ph: rnd() * 6 }));
      for (const p of P){ p.y -= p.v * dt; p.x += Math.sin(t * 2 + p.ph) * 10 * dt; if (p.y < -10){ p.y = H + 10; p.x = rnd() * W; }
        ctx.fillStyle = p.s > 3.5 ? '#ffe14a' : p.s > 2.6 ? '#ff8a2a' : '#d42a0f'; ctx.globalAlpha = 0.85 * k; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s * S, p.s * S); }
      // sol abrasador en la esquina
      const sg = ctx.createRadialGradient(W - 40, 40, 10, W - 40, 40, 260); sg.addColorStop(0, 'rgba(255,230,140,0.55)'); sg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.globalAlpha = k; ctx.fillStyle = sg; ctx.fillRect(W - 320, -240, 560, 560);
      break;
    }
    case 'wind': {                                                    // rachas de viento blancas, polvo y hojas volando de lado
      tint('#b9d6ea', 0.07);
      const gust = 1 + 1.5 * Math.max(0, Math.sin(t * 1.3)) ** 2;
      spawn(110, () => ({ x: rnd() * W, y: rnd() * H, v: 400 + rnd() * 400, l: 20 + rnd() * 60, kind: rnd() < 0.7 ? 'line' : rnd() < 0.5 ? 'leaf' : 'dust', ph: rnd() * 6 }));
      for (const p of P){ p.x += p.v * gust * dt; p.y += Math.sin(t * 4 + p.ph) * 30 * dt; if (p.x > W + 80){ p.x = -80; p.y = rnd() * H; }
        if (p.kind === 'line'){ ctx.globalAlpha = 0.7 * k; ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.l * 1.5, S); ctx.fillStyle = '#b9c3cf'; ctx.fillRect(Math.round(p.x + p.l * 0.4), Math.round(p.y + S * 1.5), p.l * 0.7, S); }
        else if (p.kind === 'leaf'){ ctx.globalAlpha = 0.95 * k; ctx.fillStyle = '#9bbf4a'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 4 * S, 2 * S); ctx.fillStyle = '#6a8a2a'; ctx.fillRect(Math.round(p.x) + S, Math.round(p.y) + S, 2 * S, S); }
        else { ctx.globalAlpha = 0.7 * k; ctx.fillStyle = '#d8c8a8'; ctx.fillRect(Math.round(p.x), Math.round(p.y), S, S); } }
      break;
    }
    case 'leaves': {                                                  // hojarasca: hojas verdes, ocres y moradas cayendo y girando
      tint('#2f7a2a', 0.07); vignette('rgba(40,10,60,0.8)', 0.2);
      const cols = ['#4fbf45', '#86e06a', '#c9a03a', '#b56ae6', '#7a2fb8', '#e07b2a'];
      spawn(80, () => ({ x: rnd() * W, y: rnd() * H, v: 40 + rnd() * 60, s: (3 + rnd() * 2) * S, rot: rnd() * 6, spin: (rnd() - 0.5) * 6, c: cols[Math.floor(rnd() * cols.length)], ph: rnd() * 6 }));
      for (const p of P){ p.y += p.v * dt; p.x += (Math.sin(t * 1.5 + p.ph) * 50 + 20) * dt; p.rot += p.spin * dt; if (p.y > H + 10){ p.y = -10; p.x = rnd() * W; }
        ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(Math.round(p.rot * 4) / 4); ctx.globalAlpha = 0.95 * k;
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-p.s / 2, 0, p.s, 1); ctx.restore(); }
      break;
    }
    case 'sand': {                                                    // tormenta de arena: neblina marrón y arena en diagonal
      tint('#b8864a', 0.17 + 0.03 * Math.sin(t * 1.7)); vignette('rgba(90,55,20,0.95)', 0.3);
      spawn(160, () => ({ x: rnd() * W, y: rnd() * H, v: 250 + rnd() * 250, s: 1, c: rnd() < 0.5 ? '#e2c08c' : rnd() < 0.5 ? '#b58a55' : '#8a6a3a' }));
      for (const p of P){ p.x += p.v * dt; p.y += p.v * 0.35 * dt; if (p.x > W + 10 || p.y > H + 10){ p.x = rnd() * W - W * 0.3; p.y = -10 + rnd() * H * 0.3; }
        ctx.globalAlpha = 0.8 * k; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2 * S, S); }
      // bancos de polvo que pasan
      for (let i = 0; i < 3; i++){ const bx = ((t * 120 + i * W / 3) % (W + 400)) - 200, by = H * (0.2 + 0.3 * i);
        const g = ctx.createRadialGradient(bx, by, 10, bx, by, 220); g.addColorStop(0, 'rgba(200,160,100,0.35)'); g.addColorStop(1, 'rgba(200,160,100,0)'); ctx.globalAlpha = k; ctx.fillStyle = g; ctx.fillRect(bx - 220, by - 220, 440, 440); }
      break;
    }
    case 'storm': {                                                   // tormenta eléctrica: oscuro, lluvia y relámpagos (solo visuales)
      tint('#1a2238', 0.17); vignette('rgba(0,0,20,0.85)', 0.2);
      spawn(150, () => ({ x: rnd() * W, y: rnd() * H, v: 700 + rnd() * 400, l: 14 + rnd() * 18 }));
      ctx.globalAlpha = 0.6 * k; ctx.fillStyle = '#9fc4ff';
      for (const p of P){ p.y += p.v * dt; p.x -= p.v * 0.25 * dt; if (p.y > H){ p.y = -20; p.x = rnd() * (W + 200); }
        ctx.fillRect(Math.round(p.x), Math.round(p.y), S, p.l); }
      if (t >= w.nextBolt){                                           // nuevo relámpago
        w.nextBolt = t + 1.2 + rnd() * 2.5;
        const x0 = 60 + rnd() * (W - 120), pts = [[x0, -10]]; let x = x0, y = -10;
        while (y < H * (0.5 + rnd() * 0.4)){ x += (rnd() - 0.5) * 60; y += 20 + rnd() * 30; pts.push([x, y]); }
        w.bolts.push({ pts, life: 0.35, dur: 0.35 });
      }
      for (const b of w.bolts){ b.life -= dt;
        const a = Math.max(0, b.life / b.dur);
        tint('#ffffff', 0.35 * a * a);                                // destello en toda la pantalla
        for (const [lw, col] of [[7 * S, 'rgba(255,240,140,0.5)'], [3 * S, '#fff6c0'], [S, '#ffffff']]){
          ctx.globalAlpha = a * k; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'miter';
          ctx.beginPath(); b.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
        const [ex, ey] = b.pts[b.pts.length - 1];                    // salpicadura de luz donde cae
        ctx.globalAlpha = a * k; ctx.fillStyle = '#fff6c0'; ctx.fillRect(ex - 10, ey - 2, 20, 4); ctx.fillRect(ex - 2, ey - 10, 4, 20);
      }
      w.bolts = w.bolts.filter(b => b.life > 0);
      break;
    }
    case 'drake': {                                                   // aliento draco: se oscurece, tono azulado y niebla morada
      tint('#0a1a3a', 0.15); ctx.globalCompositeOperation = 'overlay'; tint('#2a5fa8', 0.15); ctx.globalCompositeOperation = 'source-over';
      vignette('rgba(0,8,30,0.9)', 0.22);
      for (let i = 0; i < 4; i++){ const bx = ((t * 40 + i * W / 4) % (W + 500)) - 250, by = H * (0.15 + 0.23 * i) + Math.sin(t + i) * 30;
        const g = ctx.createRadialGradient(bx, by, 10, bx, by, 260); g.addColorStop(0, i % 3 === 1 ? 'rgba(140,80,210,0.18)' : 'rgba(40,90,190,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = k; ctx.fillStyle = g; ctx.fillRect(bx - 260, by - 260, 520, 520); }
      spawn(90, () => ({ x: rnd() * W, y: rnd() * H, v: 15 + rnd() * 30, s: 2 + rnd() * 3, ph: rnd() * 6, c: rnd() < 0.25 ? '#a24de0' : rnd() < 0.5 ? '#5fa8ff' : '#2f6fd8' }));
      for (const p of P){ p.y -= p.v * dt; p.x += Math.sin(t + p.ph) * 15 * dt; if (p.y < -10){ p.y = H + 10; p.x = rnd() * W; }
        const s = p.s; ctx.globalAlpha = (0.5 + 0.4 * Math.sin(t * 3 + p.ph)) * k; ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y - s * S), S, (s * 2 + 1) * S); ctx.fillRect(Math.round(p.x - s * S), Math.round(p.y), (s * 2 + 1) * S, S); }
      break;
    }
  }
  ctx.restore();
  pxEnd();
}

/* ---- render ---- */
/* cámara más cerca (estilo PokeSurvivor): el mundo se dibuja ampliado x4/3.
   Con ese zoom, los píxeles de la capa arcade (3) pasan a 4 y los cuerpos
   (dibujados a x2,25) quedan a 3 píxeles de pantalla: todo sigue siendo píxel exacto */
const CAM_ZOOM = 4 / 3;
const BODY_SCALE = 1.6;          // cuerpo nuevo (22x35): misma altura en pantalla que antes
function render(){
  const RW = W, RH = H;
  W = RW / CAM_ZOOM; H = RH / CAM_ZOOM;
  ctxMain.setTransform(CAM_ZOOM, 0, 0, CAM_ZOOM, 0, 0);
  try { renderWorld(); }
  finally { W = RW; H = RH; ctxMain.setTransform(1, 0, 0, 1, 0, 0); }
}
function renderWorld(){
  ctx.clearRect(0,0,W,H);
  const camX = W/2 - match.x, camY = H/2 - match.y;
  const elColor = getElement(match.element).color;
  if (match.inArena) drawArena(camX, camY); else { drawPitch(camX, camY); drawOutsideAmbient(camX, camY, 1 / 60); drawFieldAmbient(camX, camY); drawThemeAura(); }

  // gemas
  ctx.font = '16px sans-serif';
  for (const g of match.gems){
    if (g.big){
      const s = 30, bob = Math.sin(match.elapsed * 4 + g.x) * 2;
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#f2b705'; ctx.beginPath(); ctx.arc(g.x+camX, g.y+camY+bob, s * 0.75, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.drawImage(PE_SPRITES.big, Math.round(g.x+camX-s/2), Math.round(g.y+camY-s/2+bob), s, s);
    }
    else if (g.kind === 'coin'){ ctx.imageSmoothingEnabled = false; ctx.drawImage(COIN_SPRITE, Math.round(g.x+camX-11), Math.round(g.y+camY-11), 22, 22); }
    else if (g.kind === 'bag' || g.kind === 'ticket'){
      const bob = Math.sin(match.elapsed * 5) * 3, gx = g.x+camX, gy = g.y+camY + bob - 4;
      ctx.beginPath(); ctx.ellipse(g.x+camX, g.y+camY + 16, 17 - bob * 0.5, 6, 0, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(PX_ICONS[g.kind === 'bag' ? 'bag' : g.purple ? 'ticketP' : 'ticketY'], Math.round(gx - 20), Math.round(gy - 22), 40, 40);
      ctx.imageSmoothingEnabled = true;
    }
    else { ctx.imageSmoothingEnabled = false; ctx.drawImage(PE_SPRITES[gemTier(g.xp)], Math.round(g.x+camX-11), Math.round(g.y+camY-11), 22, 22); }
  }

  ctx.imageSmoothingEnabled = true;
  // cuaderno de talentos en el suelo
  if (match.notebook){
    const nb = match.notebook, nx = nb.x+camX, ny = nb.y+camY + Math.sin(match.elapsed * 4) * 4;
    ctx.beginPath();
    ctx.arc(nx, ny, 24 + Math.sin(match.elapsed * 6) * 3, 0, Math.PI*2);
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#b377e0'; ctx.fill(); ctx.globalAlpha = 1;
    ctx.lineWidth = 3; ctx.strokeStyle = '#b377e0'; ctx.stroke();
    ctx.font = '30px sans-serif';
    ctx.fillText('📓', nx-15, ny+10);
  }

  drawInazumaTower(camX, camY);
  // cofres
  for (const c of (match.inArena ? [] : (match.chests || []))){   // en la arena del boss no hay cofres
    const cx = c.x+camX, cy = c.y+camY;
    ctx.beginPath(); ctx.arc(cx, cy, 30 + Math.sin(match.elapsed * 4) * 3, 0, Math.PI*2);
    ctx.globalAlpha = 0.18; ctx.fillStyle = POINTER_COLORS.chest; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy + 20, 22, 6, 0, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.imageSmoothingEnabled = false;
    const shake = c.prog > 0 ? Math.sin(match.elapsed * 40) * 1.5 : 0;
    ctx.drawImage(CHEST_SPRITE, Math.round(cx - 22 + shake), Math.round(cy - 24), 44, 44);
    ctx.imageSmoothingEnabled = true;
    if (c.prog > 0){
      ctx.beginPath(); ctx.arc(cx, cy, 38, -Math.PI/2, -Math.PI/2 + Math.PI*2 * Math.min(1, c.prog / CHESTS.openTime));
      ctx.strokeStyle = POINTER_COLORS.chest; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.font = '700 12px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const lbl = c.prog > 0 ? 'Abriendo…' : `Cofre · ${Math.max(0, Math.ceil(c.until - match.elapsed))}s`;
    ctx.strokeText(lbl, cx, cy - 44); ctx.fillStyle = '#7cc4ff'; ctx.fillText(lbl, cx, cy - 44);
    ctx.textAlign = 'start';
  }
  // Hillman
  if (match.hillman){
    const hx = match.hillman.x+camX, hy = match.hillman.y+camY;
    ctx.beginPath();
    ctx.arc(hx, hy, 30 + Math.sin(match.elapsed * 4) * 4, 0, Math.PI*2);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#d29a5a'; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#d29a5a'; ctx.lineWidth = 3; ctx.stroke();
    let hTop = drawNpcSheet(match.hillman, NPC_SHEETS.hillman, hx, hy);
    if (hTop == null){ ctx.font = '34px sans-serif'; ctx.fillText('👴', hx-17, hy+12); hTop = hy - 30; }
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const left = Math.max(0, Math.ceil(match.hillman.until - match.elapsed));
    ctx.strokeText(`Hillman · ${left}s`, hx, hTop - 6);
    ctx.fillStyle = '#f2d6a8';
    ctx.fillText(`Hillman · ${left}s`, hx, hTop - 6);
    ctx.textAlign = 'start';
    drawHeadMarker(hx, hTop, NPC_SHEETS.hillman, POINTER_COLORS.hillman);
  }
  // árbitro
  if (match.referee){
    const rx = match.referee.x+camX, ry = match.referee.y+camY;
    ctx.beginPath();
    ctx.arc(rx, ry, 30 + Math.sin(match.elapsed * 5) * 4, 0, Math.PI*2);
    ctx.strokeStyle = '#f2b705'; ctx.lineWidth = 3; ctx.stroke();
    let rTop = drawNpcSheet(match.referee, NPC_SHEETS.referee, rx, ry);
    if (rTop == null) rTop = drawBodyAt(npcBodyFrame(match.referee, 'referee', 'standard'), rx, ry, 'referee', match.referee._face8);
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    const refLeft = Math.max(0, Math.ceil((match.referee.until ?? match.elapsed) - match.elapsed));
    const refTxt = `Árbitro · ${refLeft}s`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(refTxt, rx, rTop - 4);
    ctx.fillStyle = refLeft <= 10 && Math.floor(match.elapsed * 4) % 2 ? '#ff4a3a' : '#f2b705';
    ctx.fillText(refTxt, rx, rTop - 4);
    ctx.textAlign = 'start';
    drawHeadMarker(rx, rTop, NPC_SHEETS.referee, POINTER_COLORS.referee);
  }
  // aviso del boss que va a salir
  if (match.bossSpawn){
    const s = match.bossSpawn, k = 1 - s.t / s.dur;
    ctx.beginPath();
    ctx.arc(s.x+camX, s.y+camY, 70 * (1 - k) + 20, 0, Math.PI*2);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '28px sans-serif';
    ctx.fillText('❗', s.x+camX-14, s.y+camY+10);
  }

  // objetos en el suelo (parpadean cuando van a desaparecer)
  ctx.font = '22px sans-serif';
  for (const it of match.items){
    if (it.life < 5 && Math.floor(it.life * 6) % 2) continue;
    const bob = Math.sin(match.elapsed * 4 + it.x) * 3;
    const ix = it.x+camX, iy = it.y+camY + bob - 4;
    // sombra redonda en el suelo (se encoge un poco cuando el objeto sube)
    ctx.beginPath();
    ctx.ellipse(it.x+camX, it.y+camY + 16, 18 - bob * 0.6, 6 - bob * 0.2, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    if (ITEM_SPRITES[it.key]){ ctx.imageSmoothingEnabled = false; ctx.drawImage(ITEM_SPRITES[it.key], Math.round(ix - 22), Math.round(iy - 26), 44, 44); ctx.imageSmoothingEnabled = true; }
    else ctx.fillText(ITEMS[it.key].emoji, ix-11, iy+8);
  }

  drawBounceTrail(camX, camY);                                    // llamitas pixel que deja el rebote (hacen daño)
  // proyectiles
  pxBegin();
  for (const p of match.projectiles){
    const px = p.x+camX, py = p.y+camY;
    if (p.ultBounce && isFireFx(p.fx)){ drawFireBird(p, camX, camY); continue; }
    if (p.style === 'breath' && isFireFx(p.fx)){                 // plumas del fénix
      drawFireBall(px, py, p.r * 0.9, p.vx, p.vy, 2.5, p.x);
      if (Math.random() < 0.15) emitEmber(p.x, p.y, { spread: 40 });
      continue;
    }
    if ((p.style === 'pierce' || p.style === 'bounce') && isFireFx(p.element)){   // Tornado de fuego / Ataque meteorito
      drawFireBall(px, py, p.crit ? p.r + 2 : p.r, p.vx, p.vy, p.style === 'pierce' ? 5 : 4, p.x * 0.1);
      if (Math.random() < 0.3) emitEmber(p.x, p.y, { spread: 25 });
      continue;
    }
    if (!p.style && !p.ult){ drawPlainBall(px, py, p.r + 1, p.crit); continue; }   // disparo normal: balón sin colores
    if (p.ultBounce){                               // balón que rebota (definitiva de rebote)
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - p.vx*4, py - p.vy*4);
      ctx.strokeStyle = elColor; ctx.globalAlpha = 0.6; ctx.lineWidth = 14; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI*2);
      ctx.fillStyle = elColor; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.font = '24px sans-serif';
      ctx.fillText(getElement(match.element).orb, px-12, py+8);
      continue;
    }
    if (p.ult){                                     // balón gigante de la definitiva
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(px, py, p.r * 1.6, 0, Math.PI*2);
      ctx.fillStyle = elColor; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI*2);
      ctx.fillStyle = elColor; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.font = '34px sans-serif';
      ctx.fillText('⚽', px-17, py+12);
      continue;
    }
    if (p.style){                                   // estela de las supertécnicas
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - p.vx*3, py - p.vy*3);
      ctx.strokeStyle = elColor;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = p.r + 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(px, py, p.crit ? p.r + 2 : p.r, 0, Math.PI*2);
    ctx.fillStyle = p.crit ? '#f2b705' : elColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.crit ? '#ffffff' : 'rgba(255,255,255,0.8)';
    ctx.stroke();
  }

  pxEnd();

  if (match.inArena && (match.towers || []).length){ pxBegin(); drawByronArena(camX, camY); pxEnd(); }   // Aphrodite: Hora celestial y torres
  if (match.mark) drawMark(camX, camY);                                       // Mark Evans
  drawPBallsGround(camX, camY);                                               // balones de poder en el suelo

  // enemigos
  for (const e of match.enemies){
    const ex = e.x+camX, ey = e.y+camY;
    const el = getElement(e.element);
    if (e.miniBoss){                                     // mini boss: cuerpo grande con la equipación de su equipo, nombre y vida en amarillo
      let top = drawEnemySheet(e, ex, ey + 14, SHEET_BUILD_SCALE.big);
      if (top == null) top = drawBodyAt(enemyBodyFrame(e), ex, ey, e.kit, e._face8);
      drawElIcon(e.element, ex + 26, top - 14, 16);
      ctx.font = '700 12px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(e.name, ex, top - 12);
      ctx.fillStyle = '#ffffff'; ctx.fillText(e.name, ex, top - 12); ctx.textAlign = 'start';
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ex - 24, top - 8, 48, 5);
      ctx.fillStyle = '#f2d21f'; ctx.fillRect(ex - 24, top - 8, 48 * Math.max(0, e.hp / e.maxHp), 5);
      drawBossMark(ex, top - 26);
      continue;
    }
    if (e.boss){
      if (bossInvisible(e)){ ctx.globalAlpha = 0.07; if (drawBossSprite(e, ex, ey) == null){ ctx.font = '44px sans-serif'; ctx.rawEmoji = true; ctx.fillText(e.emoji, ex-22, ey+15); ctx.rawEmoji = false; } ctx.globalAlpha = 1; continue; }
      if (e.warnT > 0){                                    // Chicken avisa antes de abalanzarse
        ctx.save(); ctx.globalAlpha = 0.4 + 0.4 * Math.sin(match.elapsed * 40);
        ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 10; ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(e.dashAng) * 360, ey + Math.sin(e.dashAng) * 360); ctx.stroke(); ctx.restore();
      }
      if (e.special === 'byron' && e.towerShield){        // escudo dorado mientras haya una torre encendida
        ctx.save(); const pr = 48 + Math.sin(match.elapsed * 8) * 2;
        ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(ex, ey - 18, pr, 0, 6.28); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.lineWidth = 4; ctx.strokeStyle = '#7a5208'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff3a0'; ctx.stroke(); ctx.restore();
      }
      if (e.special === 'royal'){                          // balones de Jude
        for (const o of royalOrbs(e)){
          ctx.beginPath(); ctx.arc(o.x+camX, o.y+camY, 13, 0, Math.PI*2);
          ctx.fillStyle = 'rgba(59,79,168,0.6)'; ctx.fill();
          ctx.font = '20px sans-serif'; ctx.fillText('⚽', o.x+camX-10, o.y+camY+7);
        }
      }
      // boss: sprite del jugador que lo representa, con la equipación de su club
      ctx.save(); ctx.globalAlpha *= 0.22; ctx.fillStyle = el.color; ctx.beginPath(); ctx.ellipse(ex, ey + 13, 30, 10, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
      if (e.ult){
        if (e.ult.kind === 'pierce' && !e.ult.fired){        // aviso: cono rojo hacia donde va a disparar
          ctx.save(); ctx.globalAlpha = 0.18 + 0.12 * Math.sin(match.elapsed * 30); ctx.fillStyle = '#ff2d2d';
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.arc(ex, ey, 520, e.ult.ang - 0.36, e.ult.ang + 0.36); ctx.closePath(); ctx.fill(); ctx.restore();
        }
        pxBegin(); drawBossUltAura(e, ex, ey, false); pxEnd();
      }
      let bTop = drawBossSprite(e, ex, ey);
      if (e.ult){ pxBegin(); drawBossUltAura(e, ex, ey, true); pxEnd(); }
      if (bTop == null){
        ctx.beginPath(); ctx.arc(ex, ey, 30, 0, Math.PI*2);
        ctx.globalAlpha = 0.3; ctx.fillStyle = el.color; ctx.fill(); ctx.globalAlpha = 1;
        ctx.lineWidth = 3; ctx.strokeStyle = el.color; ctx.stroke();
        ctx.font = '44px sans-serif'; ctx.rawEmoji = true; ctx.fillText(e.emoji, ex-22, ey+15); ctx.rawEmoji = false;
        bTop = ey - 30;
      }
      if (e.shieldUntil > match.elapsed){                  // escudo (Artist rosa, Walters verde)
        const sc = e.shieldColor || '#e45fa8';
        ctx.save(); ctx.beginPath(); ctx.arc(ex, ey - 20, 52 + Math.sin(match.elapsed * 10) * 2, 0, Math.PI*2);
        ctx.globalAlpha = 0.22; ctx.fillStyle = sc; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = sc; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      }
      drawElIcon(e.affEl || e.element, ex+22, bTop - 10, 24);
      ctx.font = '700 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(e.name, ex, bTop - 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(e.name, ex, bTop - 8);
      ctx.textAlign = 'start';
      drawBossMark(ex, bTop - 24);
      continue;
    }
    if (e.special){                                     // Willy Glass y Kappah: halo + nombre
      ctx.beginPath();
      ctx.arc(ex, ey, 22 + (e.fleeing ? Math.sin(match.elapsed * 14) * 3 : 0), 0, Math.PI*2);
      ctx.globalAlpha = 0.28; ctx.fillStyle = e.color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 2; ctx.strokeStyle = e.color; ctx.stroke();
      let sTop = drawNpcSheet(e, NPC_SHEETS[e.special], ex, ey);
      if (sTop == null) sTop = drawBodyAt(npcBodyFrame(e, e.special === 'kappah' ? 'kappah' : 'willy', 'small'), ex, ey, e.special === 'kappah' ? 'kappah' : 'willy', e._face8);
      ctx.font = '700 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(e.name, ex, sTop - 10);
      ctx.fillStyle = e.color;
      ctx.fillText(e.name, ex, sTop - 10);
      ctx.textAlign = 'start';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(ex-16, sTop-6, 32, 4);
      ctx.fillStyle = e.color;
      ctx.fillRect(ex-16, sTop-6, 32*Math.max(0, e.hp/e.maxHp), 4);
      continue;
    }
    if (e.variant === 'dasher' && e.warnT > 0){           // aviso de embestida
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(match.elapsed * 40);
      ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 6; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(ex, ey);
      const L = ENEMY_VARIANTS.dasher.dashSpeed * 60 * ENEMY_VARIANTS.dasher.dashTime;
      ctx.lineTo(ex + e.dashDir.x * L, ey + e.dashDir.y * L); ctx.stroke();
      ctx.restore();
    }
    // rival con el cuerpo común y la equipación de su equipo (los grandes, a x3)
    const feet = ey + 14 + Math.max(0, e.size || 0) * 0.5;
    let top = drawEnemySheet(e, ex, feet, SHEET_BUILD_SCALE[e.build] || 1), bw = 30;
    if (top == null){                                     // sin hoja (o aún cargando): cuerpo común + cabeza
      const fr = enemyBodyFrame(e), sc = BODY_SCALE;
      bw = fr.width * sc; const bh = fr.height * sc, bodyTop = feet - bh;
      ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(ex, feet - 1, bw * 0.36, sc * 1.6, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fr, ex - bw / 2, bodyTop, bw, bh);
      ctx.imageSmoothingEnabled = true;
      top = drawHead(e.kit, fr, ex, bodyTop, e._face8);
    }
    drawElIcon(e.element, ex + bw * 0.42, top - 6, 16);
    if (e.lobber && !(e.lobT > 0)){ const ready = e.shotCd < 0.7; drawSoccerBall(ex, top - 16 - (ready ? 4 + Math.sin(match.elapsed * 20) * 2 : 0), 7, 0, '#ffffff', shadeHex(getElement(e.element).color, -0.45)); }   // el lanzador lleva el balón en alto
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(ex-14, top-8, 28, 4);
    ctx.fillStyle = (e.poison || e.aPoison > 0) ? '#8be28f' : e.burn ? '#ff9a2a' : e.slowUntil > match.elapsed ? '#7fe3ff' : '#ff6b5e';   // veneno / quemado / ralentizado
    ctx.fillRect(ex-14, top-8, 28*Math.max(0, e.hp/e.maxHp), 4);
  }

  pxBegin();
  // proyectiles que caen del cielo: zona de impacto + proyectil bajando
  for (const b of match.bombs){
    if (b.pal){ FIRE = b.pal; drawFireMeteor(b, camX, camY); continue; }
    if (isFireFx(b.fx || b.element)){ drawFireMeteor(b, camX, camY); continue; }
    const k = Math.min(1, b.t / b.dur);
    const bx = b.x+camX, by = b.y+camY;
    ctx.beginPath();
    ctx.arc(bx, by, b.r, 0, Math.PI*2);
    ctx.globalAlpha = 0.08 + 0.14*k;
    ctx.fillStyle = elColor;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = elColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const br = b.big ? 16 : 12, fy = by - (1-k)*(1-k)*320;
    ctx.beginPath(); ctx.arc(bx, fy, br + 6, 0, Math.PI*2); ctx.globalAlpha = 0.35; ctx.fillStyle = getElement(b.element).color; ctx.fill(); ctx.globalAlpha = 1;
    drawSoccerBall(bx, fy, br, match.elapsed * 10 + b.x);
  }


  // suelo ardiendo
  for (const pa of match.patches){
    if (isFireFx(pa.fx)){ drawFirePatch(pa, camX, camY); continue; }
    const k = pa.life / pa.dur;
    ctx.beginPath();
    ctx.arc(pa.x+camX, pa.y+camY, pa.r * (0.9 + 0.1 * Math.sin(match.elapsed * 10 + pa.x)), 0, Math.PI*2);
    ctx.globalAlpha = 0.35 * Math.min(1, k * 3);
    ctx.fillStyle = elColor;
    ctx.fill();
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.font = '22px sans-serif';
    ctx.fillText(getElement(match.element).orb, pa.x+camX-11, pa.y+camY+8);
    ctx.globalAlpha = 1;
  }

  // triángulo de la definitiva de lluvia
  for (const tr of match.triangles){
    if (tr.pal){ FIRE = tr.pal; drawFireTriangle(tr, camX, camY); continue; }
    if (isFireFx(tr.fx)){ drawFireTriangle(tr, camX, camY); continue; }
    ctx.globalAlpha = Math.min(1, tr.life / 0.4);
    ctx.beginPath();
    tr.pts.forEach(([x, y], k) => k ? ctx.lineTo(x+camX, y+camY) : ctx.moveTo(x+camX, y+camY));
    ctx.closePath();
    ctx.fillStyle = tr.color; ctx.globalAlpha *= 0.12; ctx.fill();
    ctx.globalAlpha = Math.min(1, tr.life / 0.4);
    ctx.strokeStyle = tr.color; ctx.lineWidth = 4; ctx.setLineDash([14, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // golpes cercanos (abanicos que se desvanecen)
  if (match.flurry && isFireFx(techElement('melee'))) drawFlurryRing();
  for (const sl of match.slashes){
    if (isFireFx(sl.fx)){ drawMeleeSlash(sl); continue; }
    const k = sl.life / sl.dur, r = sl.range * (0.75 + 0.25 * (1 - k));
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.25 * k;
    ctx.beginPath(); ctx.moveTo(W/2, H/2); ctx.arc(W/2, H/2, r, sl.ang - sl.arc / 2, sl.ang + sl.arc / 2); ctx.closePath();
    ctx.fillStyle = sl.color || elColor; ctx.fill();
    ctx.globalAlpha = 0.9 * k;
    ctx.beginPath(); ctx.arc(W/2, H/2, r, sl.ang - sl.arc / 2, sl.ang + sl.arc / 2);
    ctx.strokeStyle = sl.color || elColor; ctx.lineWidth = sl.big ? 10 : 7; ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H/2, r - 3, sl.ang - sl.arc / 2.6, sl.ang + sl.arc / 2.6);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // balones orbitando
  const orbs = orbPositions();
  if (orbs.length && orbitBoosted()){
    // zona peligrosa mientras dura la definitiva de órbita
    const far = orbs.reduce((m, o) => Math.max(m, Math.hypot(o.x - match.x, o.y - match.y)), 0);
    ctx.beginPath();
    ctx.arc(W/2, H/2, far + 18, 0, Math.PI*2);
    ctx.globalAlpha = 0.1 + 0.04 * Math.sin(match.elapsed * 8);
    ctx.fillStyle = elColor; ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (orbs.length && isFireFx(techElement('orbit'))){         // Corte flamígero / Potenciación
    const big = orbitBoosted();
    if (big){                                                   // anillo de fuego mientras dura la definitiva
      const far = orbs.reduce((m, o) => Math.max(m, Math.hypot(o.x - match.x, o.y - match.y)), 0);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(match.elapsed * 10);
      ctx.beginPath(); ctx.arc(W/2, H/2, far + 14, 0, Math.PI*2); ctx.strokeStyle = FIRE.hot; ctx.lineWidth = 6; ctx.stroke();
      ctx.restore();
    }
    if (big && (match.orbitBoostEl || techElement('orbit')) === 'celestial'){               // Hora celestial: el tiempo se para y los balones dejan estela gris
      const tr = match.orbTrail = match.orbTrail || [];
      tr.unshift(orbs.map(o => [o.x - match.x, o.y - match.y])); if (tr.length > 24) tr.length = 24;
      ctx.save();
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#7d828e'; ctx.fillRect(-W, -H, W * 3, H * 3);   // velo gris de pausa
      for (let i = 0; i < orbs.length; i++){
        for (let k = 1; k < tr.length; k++){
          const a = tr[k - 1][i], b = tr[k][i]; if (!a || !b) continue;
          ctx.globalAlpha = 0.75 * (1 - k / tr.length); ctx.strokeStyle = k % 2 ? '#b9bcc6' : '#8e929c'; ctx.lineWidth = (orbs[i].outer ? 10 : 14) * (1 - k / tr.length * 0.7); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(W/2 + a[0], H/2 + a[1]); ctx.lineTo(W/2 + b[0], H/2 + b[1]); ctx.stroke();
        }
      }
      // ecos grises congelados de cada balón (como si el tiempo se hubiera parado)
      for (const k of [6, 12, 18]){ const fr = tr[k]; if (!fr) continue;
        for (let i = 0; i < fr.length; i++){ const r = orbs[i] && orbs[i].outer ? 10 : 13;
          ctx.globalAlpha = 0.5 * (1 - k / 24); ctx.fillStyle = '#d4d7de'; ctx.beginPath(); ctx.arc(W/2 + fr[i][0], H/2 + fr[i][1], r, 0, 6.28); ctx.fill();
          ctx.globalAlpha *= 0.8; ctx.strokeStyle = '#6e727c'; ctx.lineWidth = 2; ctx.stroke(); } }
      // esfera de reloj: marcas alrededor del jugador
      const far = orbs.reduce((m, o) => Math.max(m, Math.hypot(o.x - match.x, o.y - match.y)), 0) + 26;
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#e8eaf0';
      for (let k = 0; k < 12; k++){ const a = k * Math.PI / 6; ctx.fillRect(W/2 + Math.cos(a) * far - 2, H/2 + Math.sin(a) * far - 2, k % 3 ? 4 : 7, k % 3 ? 4 : 7); }
      const hand = match.elapsed * 0.8; ctx.strokeStyle = '#e8eaf0'; ctx.lineWidth = 3; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(W/2, H/2); ctx.lineTo(W/2 + Math.cos(hand) * far * 0.8, H/2 + Math.sin(hand) * far * 0.8); ctx.stroke();
      ctx.restore();
    } else match.orbTrail = null;
    for (const o of orbs){
      const dx = o.x - match.x, dy = o.y - match.y, sgn = o.outer ? -1 : 1;
      drawFireBall(o.x+camX, o.y+camY, (big ? 14 : 10) * orbScale() * (o.outer ? 0.8 : 1), -dy * sgn, dx * sgn, big ? 0.4 : 0.3, o.x);
      if (Math.random() < 0.12) emitEmber(o.x, o.y, { spread: 20 });
    }
  } else if (orbs.length){
    const big = orbitBoosted();
    const orbEl = getElement(techElement('orbit')), orbEmoji = orbEl.orb;
    for (const o of orbs){
      ctx.beginPath();
      ctx.arc(o.x+camX, o.y+camY, (big ? 18 : 13) * orbScale(), 0, Math.PI*2);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = orbEl.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      const size = Math.round((big ? 28 : 22) * orbScale());
      ctx.font = `${size}px sans-serif`;
      ctx.fillText(orbEmoji, o.x+camX-size/2, o.y+camY+size/3);
    }
  }

  // cadena de la definitiva de rebote
  for (const b of match.bolts){
    if (b.pts.length < 2) continue;
    ctx.globalAlpha = Math.max(0, b.life / b.dur);
    for (const [w, c] of [[9, b.color], [3, '#ffffff']]){
      ctx.beginPath();
      ctx.moveTo(b.pts[0][0]+camX, b.pts[0][1]+camY);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0]+camX, b.pts[i][1]+camY);
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // alas del fénix mientras dura la bocanada de fuego
  if (match.breath && isFireFx(techElement('pierce'))) drawPhoenixWings(match.breath);
  updateDrawEmbers(camX, camY);

  // ondas y explosiones
  for (const f of match.effects){
    const progress = 1 - f.life / f.dur;
    const alpha = f.life / f.dur;
    const cx = f.fixed ? f.x+camX : match.x+camX;
    const cy = f.fixed ? f.y+camY : match.y+camY;
    ctx.beginPath();
    ctx.arc(cx, cy, f.maxR * (f.fill ? Math.min(1, progress*2.5) : progress), 0, Math.PI*2);
    ctx.globalAlpha = alpha;
    if (f.fill){ ctx.fillStyle = f.color; ctx.globalAlpha = alpha * 0.45; ctx.fill(); ctx.globalAlpha = alpha; }
    ctx.strokeStyle = f.color || '#f2b705';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  pxEnd();

  // proyectiles de los rivales: sprite arcade según su afinidad, orientado hacia donde va
  ctx.imageSmoothingEnabled = false;
  const shotFrame = Math.floor(match.elapsed * 8) % 2;
  // balones que giran alrededor de un boss (Potenciación de Cloak, Muralla infinita…): bolas de su afinidad en estilo pixel
  { const orb = match.enemyShots.filter(s => s.orbit && !s.penguin);
    if (orb.length){
      pxBegin();
      const owners = new Set(orb.map(s => s.orbit.owner));
      for (const o of owners){ const rr = orb.find(s => s.orbit.owner === o).orbit.R; if (!isFireFx(o.element)) continue;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(match.elapsed * 10);
        ctx.beginPath(); ctx.arc(o.x + camX, o.y + camY, rr + 14, 0, 6.28); ctx.strokeStyle = FIRE.hot; ctx.lineWidth = 6; ctx.stroke(); ctx.restore(); }
      for (const s of orb){ if (!isFireFx(s.element)) continue; const o = s.orbit, dx = s.x - o.owner.x, dy = s.y - o.owner.y;
        drawFireBall(s.x + camX, s.y + camY, 13, -dy, dx, 0.4, s.x); if (Math.random() < 0.12) emitEmber(s.x, s.y, { spread: 20 }); }
      pxEnd();
    } }
  for (const s of match.enemyShots){
    if (s.orbit && !s.penguin && FX_PAL[s.element]) continue;   // ya dibujado arriba
    if (s.penguin && PINGUINO.ok){                        // pingüino emperador: se desliza de barriga hacia ti
      const sx = s.x + camX, sy = s.y + camY, sc = FX_PIXEL * 0.8, w = 16 * sc, h = 18 * sc;
      ctx.save(); ctx.translate(Math.round(sx), Math.round(sy));
      if (s.orbit){ ctx.scale(Math.sin(s.orbit.ang) > 0 ? 1 : -1, 1); ctx.drawImage(PINGUINO.img, (Math.floor(match.elapsed * 10) % 2) * 16, 0, 16, 18, -w / 2, -h / 2, w, h); }
      else { const a = Math.atan2(s.vy, s.vx); ctx.rotate(a + Math.PI / 2); ctx.scale(Math.cos(a) >= 0 ? 1 : -1, 1); ctx.drawImage(PINGUINO.img, 0, 0, 16, 18, -w / 2, -h / 2, w, h); }
      ctx.restore(); continue;
    }
    const spr = enemyShotSprite(s.element, shotFrame), size = Math.max(16, Math.round(s.r * 3.4 / 2) * 2);
    const sx = Math.round(s.x + camX), sy = Math.round(s.y + camY), sp = Math.hypot(s.vx || 0, s.vy || 0) || 1;
    ctx.globalAlpha = 0.45; ctx.fillStyle = (SHOT_COLS[s.element] || SHOT_COLS.neutral)[0];            // estela
    for (let t = 1; t <= 2; t++){ const q = Math.round(size * (0.32 - t * 0.08)); ctx.fillRect(Math.round(sx - s.vx / sp * size * 0.45 * t) - q, Math.round(sy - s.vy / sp * size * 0.45 * t) - q, q * 2, q * 2); }
    ctx.globalAlpha = 1;
    ctx.drawImage(spr, sx - size / 2, sy - size / 2, size, size);
  }
  ctx.imageSmoothingEnabled = true;

  drawWeather();

  // flechas en el borde hacia el árbitro / boss fuera de pantalla
  if (match.referee) drawPointer(match.referee.x+camX, match.referee.y+camY, sheetHead(NPC_SHEETS.referee) || PX_ICONS.ref_cards, POINTER_COLORS.referee);
  if (match.hillman) drawPointer(match.hillman.x+camX, match.hillman.y+camY, sheetHead(NPC_SHEETS.hillman) || '👴', POINTER_COLORS.hillman);
  if (match.inArena && (match.towers || []).length) drawTowerLabels(camX, camY);   // % de carga de la torre, nítido y por encima de todo
  if (match.mark) drawPointer(match.mark.x+camX, match.mark.y+camY, '⚽', '#ffd84a');
  for (const c of (match.inArena ? [] : (match.chests || []))) drawPointer(c.x+camX, c.y+camY, CHEST_SPRITE, POINTER_COLORS.chest);

  // aura cuando la definitiva está lista
  const at = activeTech();
  if (at && canUlt(at) && at.charge >= chargeNeeded()){
    ctx.beginPath();
    ctx.arc(W/2, H/2, 26 + Math.sin(match.elapsed * 6) * 3, 0, Math.PI*2);
    ctx.strokeStyle = elColor; ctx.lineWidth = 3;
    ctx.stroke();
  }

  pxBegin(); drawNotebookRings(); pxEnd();                                  // círculos de los cuadernos
  if (match.shield > 0.5){                              // escudo de la Cinta de Mark
    ctx.beginPath(); ctx.arc(W/2, H/2, 24, 0, Math.PI*2);
    ctx.globalAlpha = 0.2 + 0.25 * (match.shield / (match.maxHp * 0.15)); ctx.fillStyle = '#7fe3ff'; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // estela del agua isotónica / brillo del néctar
  if (buffActive('water') || buffActive('nectar')){
    ctx.beginPath();
    ctx.arc(W/2, H/2, 22, 0, Math.PI*2);
    ctx.fillStyle = buffActive('nectar') ? 'rgba(255,122,46,0.3)' : 'rgba(94,200,242,0.25)';
    ctx.fill();
    if (buffActive('nectar')){                        // aura de Furia
      ctx.beginPath();
      ctx.arc(W/2, H/2, 26 + Math.sin(match.elapsed * 14) * 3, 0, Math.PI*2);
      ctx.strokeStyle = '#ff7a2e'; ctx.lineWidth = 3; ctx.stroke();
    }
  }

  // misiles del cielo (Feldt): sombra que crece y diana
  for (const m of (match.bossMarks || [])){
    const k = m.t / m.dur, mx = m.x+camX, my = m.y+camY;
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, m.r, 0, Math.PI*2);
    ctx.globalAlpha = 0.10 + 0.25 * k; ctx.fillStyle = m.kind === 'rock' ? '#b07a3a' : (m.kind === 'ult' || m.kind === 'lob') ? m.color : '#ff2d2d'; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = m.kind === 'rock' ? '#7a4a1a' : m.kind === 'lob' ? shadeHex(m.color, -0.3) : '#ff2d2d'; ctx.lineWidth = m.big ? 3 : 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(mx, my, m.r * k, 0, Math.PI*2); ctx.stroke();
    if (m.wave){ ctx.setLineDash([6, 6]); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(mx, my, m.wave, 0, Math.PI*2); ctx.stroke(); }
    ctx.restore();
    if (m.kind === 'rock' && ROCA.ok){                      // roca pixel que cae girando sobre su marca
      const h = (1 - k) * (1 - k) * 340, sc = 3.2, w = 30 * sc, hh = 26 * sc;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(mx), Math.round(my - hh * 0.4 - h)); ctx.rotate((1 - k) * 4);
      ctx.drawImage(ROCA.img, -w / 2, -hh / 2, w, hh); ctx.restore();
      continue;
    }
    if (m.kind === 'missile' && COHETE.ok){                 // cohete pixel cayendo + señal de alerta en el suelo
      const h = (1 - k) * (1 - k) * 340, fr = Math.floor(match.elapsed * 14) % 2, sc = m.big ? 3 : 2.5, w = 16 * sc, hh = 32 * sc;
      const blink = Math.sin(match.elapsed * (10 + 26 * k)) > -0.2;
      if (blink){                                        // triángulo amarillo con "!"
        const ty = my - 4, S = 13 + 3 * k;
        ctx.save(); ctx.lineJoin = 'round';
        ctx.fillStyle = '#1b1d26'; ctx.beginPath(); ctx.moveTo(mx, ty - S - 4); ctx.lineTo(mx + S + 5, ty + S * 0.75 + 2); ctx.lineTo(mx - S - 5, ty + S * 0.75 + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd21e'; ctx.beginPath(); ctx.moveTo(mx, ty - S); ctx.lineTo(mx + S, ty + S * 0.7); ctx.lineTo(mx - S, ty + S * 0.7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff9a1e'; ctx.fillRect(mx - S * 0.85, ty + S * 0.45, S * 1.7, S * 0.25);
        ctx.fillStyle = '#1b1d26'; ctx.fillRect(mx - 2, ty - S * 0.45, 4, S * 0.6); ctx.fillRect(mx - 2, ty + S * 0.3, 4, 4);
        ctx.restore();
      }
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(COHETE.img, fr * 16, 0, 16, 32, Math.round(mx - w / 2), Math.round(my - hh + 6 - h), w, hh);
      ctx.restore();
      continue;
    }
    if (m.kind === 'lob'){                                 // balón del lanzador: parábola desde él hasta la zona, con su sombra
      const sx = (m.fromX ?? m.x) + camX, sy = (m.fromY ?? m.y) + camY;
      const bx = sx + (mx - sx) * k, gy = sy + (my - sy) * k, h = Math.sin(Math.PI * k) * 170 + (1 - k) * 20;
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(bx, gy, 9 * (0.6 + 0.4 * k), 3.5 * (0.6 + 0.4 * k), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      drawSoccerBall(bx, gy - h, 10, match.elapsed * 9, '#ffffff', shadeHex(m.color, -0.45));
      continue;
    }
    if (m.kind === 'ult' && isFireFx(m.el)){ const h = (1 - k) * (1 - k) * 300; drawFireBall(mx - h * 0.3, my - h, m.big ? 18 : 12, 0.3, 1, 30, m.x); continue; }
    const ico = m.kind === 'fist' ? '👊' : m.kind === 'rock' ? '🪨' : '🚀', sz = m.big ? 34 : 26;
    ctx.font = `${sz}px sans-serif`; ctx.fillText(ico, mx - sz / 2, my - 30 - (1 - k) * 220);
  }
  // Talisman y Cloak oscurecen el mapa: solo ves un círculo alrededor de tu jugador
  // borde rojo de la pantalla cuando te quitan vida
  if (match.hurtFx > 0.01){
    const k = Math.min(1, match.hurtFx), gr = ctx.createRadialGradient(W/2, H/2, Math.min(W, H) * 0.32, W/2, H/2, Math.max(W, H) * 0.7);
    gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(220,10,10,${0.7 * k})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  const darkBoss = match.inArena && (match.bossGroup || []).find(b => !b.dead && BOSS_DARK[b.special]);
  if (darkBoss){
    const R = BOSS_DARK[darkBoss.special];
    const gr = ctx.createRadialGradient(W/2, H/2, R * 0.55, W/2, H/2, R);
    gr.addColorStop(0, 'rgba(5,0,12,0)'); gr.addColorStop(1, 'rgba(5,0,12,0.94)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }

  // jugador
  // cuerpo común (chándal con rayo) + cabeza, con los pies en H/2+14
  ctx.save();
  { const jh = (fenixState() || {}).h || 0, sk = 1 - Math.min(0.6, jh / 130);
    ctx.globalAlpha *= 0.35 * sk; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(W/2, H/2 + 13, 13 * sk, 4 * sk, 0, 0, Math.PI*2); ctx.fill(); }
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  // si el jugador tiene hoja de sprites se dibuja con ella; si no (o aún no ha cargado), cuerpo común + cabeza
  if (match.ultAnim){ pxBegin(); drawFenixTornado(false); pxEnd(); }   // auras del salto en estilo pixel (como el resto de técnicas)
  if (orbitBoosted()){ pxBegin(); drawOrbitAura(false); pxEnd(); }      // aura de la definitiva de órbita
  if (match.rainUlt){ pxBegin(); drawRainAura(false); pxEnd(); }       // aura de la definitiva de lluvia
  let pTop = drawPlayerSheet(W/2, H/2);
  if (match.pb){ pxBegin(); drawPBallAuras(W/2, H/2 + 14 - ((fenixState() || {}).h || 0)); pxEnd(); }   // efectos de los balones de poder
  if (orbitBoosted()){ pxBegin(); drawOrbitAura(true); pxEnd(); }
  if (match.rainUlt){ pxBegin(); drawRainAura(true); pxEnd(); }
  if (techLvl('melee')){ pxBegin(); drawMeleeShield(); pxEnd(); }      // escudo esfera de las supertécnicas cuerpo a cuerpo
  if (match.rainUlt && match.rainUlt.el === 'mountain'){ pxBegin(); drawSumoFoot(camX, camY); pxEnd(); }
  if (match.bossStomp){ if (match.elapsed - match.bossStomp.start > match.bossStomp.hit + 1) match.bossStomp = null; else { pxBegin(); drawSumoFoot(camX, camY, match.bossStomp); pxEnd(); } }   // Pisotón de sumo de Walters   // Pisotón de sumo, por encima de todo
  if (match.ultAnim){ pxBegin(); drawFenixTornado(true); pxEnd(); }
  if (match.char && match.char.shiny && pTop != null){              // cromático: destellos alrededor del jugador
    ctx.save();
    for (let k = 0; k < 3; k++){
      const t = match.elapsed * 1.6 + k * 2.1, a = (Math.sin(t * 2.3) + 1) / 2;
      const sx = W/2 + Math.cos(t) * 26, sy = (pTop + H/2 + 14) / 2 + Math.sin(t * 1.3) * 30, r = 2 + a * 3;
      ctx.globalAlpha = 0.35 + a * 0.6; ctx.fillStyle = ['#ffffff', '#ffe14a', '#9fdcff'][k];
      ctx.fillRect(sx - r, sy - 0.75, r * 2, 1.5); ctx.fillRect(sx - 0.75, sy - r, 1.5, r * 2);
    }
    ctx.restore();
  }
  if (pTop == null){
    const pFr = playerBodyFrame(), pBodyTop = H/2 + 14 - pFr.height * BODY_SCALE;
    ctx.drawImage(pFr, W/2 - pFr.width * BODY_SCALE / 2, pBodyTop, pFr.width * BODY_SCALE, pFr.height * BODY_SCALE);
    pTop = drawHead(match.char && match.char.id, pFr, W/2, pBodyTop, match.face8 || match.facing);
  }
  ctx.imageSmoothingEnabled = false;
  // indicador verde encima del jugador (una "v" sin rabillo que sube y baja)
  ctx.drawImage(PLAYER_MARK, 0, 0, 9, 6, W/2 - 10.125, pTop - 17 + (Math.floor(match.elapsed * 3) % 2 ? 0 : -1.5), 20.25, 13.5);
  ctx.imageSmoothingEnabled = true;
  // vida bajo el jugador
  const hpPct = Math.max(0, match.hp / match.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W/2-16, H/2+17, 32, 4);
  ctx.fillStyle = hpPct > 0.3 ? '#ff6b5e' : '#ff2d2d';
  ctx.fillRect(W/2-16, H/2+17, 32 * hpPct, 4);

  // textos flotantes (críticos y regates)
  ctx.font = '700 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (const t of match.texts){
    ctx.globalAlpha = Math.min(1, t.life / 0.35);
    ctx.font = t.small ? '700 13px Inter, sans-serif' : '700 16px Inter, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(t.text, t.x+camX, t.y+camY);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x+camX, t.y+camY);
  }
  ctx.globalAlpha = 1;

  // fundido al teletransportarse
  if (match.fade > 0){
    ctx.globalAlpha = Math.min(1, match.fade / 0.5);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // rayo de entrada/salida del duelo (por encima del fundido)
  drawStrike();

  // nombre de la supertécnica en grande
  if (match.banner){
    const b = match.banner;
    const a = Math.min(1, b.life / 0.3, (b.dur - b.life) / 0.12 + 0.2);
    ctx.globalAlpha = Math.max(0, a);
    let by = b.big ? H*0.24 : H*0.2, fs = b.big ? Math.min(28, W / 26) : Math.min(18, W / 40);   // (más pequeños)
    if (b.bottom){                                     // nombre de la definitiva: justo encima del HUD de supertécnicas
      const tb = document.getElementById('tech-bar'), cr = canvas.getBoundingClientRect();
      const top = tb && !tb.classList.contains('hidden') ? tb.getBoundingClientRect().top : cr.bottom - 120;
      fs = Math.min(24, W / 30);
      by = (top - cr.top) * (H / cr.height) - 14;
    }
    ctx.font = `${fs}px InazumaFont, Bangers, Teko, sans-serif`;
    // estilo Inazuma: letras blancas con borde negro grueso y un brillo del color del aviso
    ctx.lineJoin = 'round';
    ctx.lineWidth = b.big ? 6 : 4;
    ctx.strokeStyle = '#000';
    ctx.shadowColor = b.color; ctx.shadowBlur = b.big ? 10 : 6;
    ctx.strokeText(b.text, W/2, by);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.fillText(b.text, W/2, by);
    ctx.lineJoin = 'miter';
    if (b.sub){
      const sy = by + (b.big ? 18 : 14);
      ctx.font = b.big ? '600 11px Inter, sans-serif' : '600 10px Inter, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(b.sub, W/2, sy);
      ctx.fillStyle = '#eafff3';
      ctx.fillText(b.sub, W/2, sy);
    }
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'start';
}

/* flecha en el borde de la pantalla hacia algo que queda fuera de la vista */
/* punta de flecha en píxeles (11x11) para 8 direcciones, con contorno, brillo y sombra */
const _ptrCache = {};
function pointerSprite(color, dir){
  const key = color + dir;
  if (_ptrCache[key]) return _ptrCache[key];
  const a = dir * Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
  const c = 5.5, tri = [[c + ux * 5, c + uy * 5], [c - ux * 3.5 + px * 4.6, c - uy * 3.5 + py * 4.6], [c - ux * 3.5 - px * 4.6, c - uy * 3.5 - py * 4.6]];
  const inside = (x, y) => x >= 0 && y >= 0 && x < 11 && y < 11 && pointInPoly(x + 0.5, y + 0.5, tri);
  const light = shadeHex(color, 0.45), dark = shadeHex(color, -0.35);
  return (_ptrCache[key] = pixelSprite(11, (x, y) => {
    if (!inside(x, y)) return (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) ? '#1b1d26' : null;
    const side = (x + 0.5 - c) * px + (y + 0.5 - c) * py;           // a qué lado del eje está el píxel
    return side < -1.2 ? light : side > 1.2 ? dark : color;
  }));
}
function drawPointer(sx, sy, emoji, color){
  if (typeof color !== 'string' || color[0] !== '#') color = '#f2b705';    // seguridad: siempre un color válido
  // solo si el objetivo está fuera de la pantalla
  const mx = 30, mTop = 80, mBottom = 140;
  if (sx > mx && sx < W - mx && sy > mTop && sy < H - mBottom) return;
  const cx = W / 2, cy = H / 2, ang = Math.atan2(sy - cy, sx - cx);
  const dir = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;         // 8 direcciones, como en las recreativas
  const bob = Math.floor(match.elapsed * 4) % 2 ? 3 : 0;               // vaivén a saltos
  const d = 70 + bob, S = 3;                                            // 1 píxel del sprite = 3 px de pantalla
  const snap = v => Math.round(v / S) * S;
  const ax = snap(cx + Math.cos(ang) * d), ay = snap(cy + Math.sin(ang) * d);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pointerSprite(color, dir), ax - 16, ay - 16, 33, 33);
  // icono de lo que señala en una casilla cuadrada, detrás de la flecha
  const ix = snap(cx + Math.cos(ang) * (d - 30)), iy = snap(cy + Math.sin(ang) * (d - 30));
  ctx.fillStyle = '#1b1d26'; ctx.fillRect(ix - 12, iy - 12, 24, 24);
  ctx.fillStyle = color; ctx.fillRect(ix - 10, iy - 10, 20, 20);
  ctx.fillStyle = '#0c2052'; ctx.fillRect(ix - 8, iy - 8, 16, 16);
  if (typeof emoji === 'string'){ ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(emoji, ix, iy + 4); ctx.textAlign = 'start'; }
  else ctx.drawImage(emoji, ix - 8, iy - 8, 16, 16);
  ctx.imageSmoothingEnabled = true;
}

/* los avisos van solo con texto (sin emojis ni iconos) y en tamaño pequeño;
   big = true para el nombre de una supertécnica, que sigue saliendo en grande */
const STRIP_EMO_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D\u20E3]/gu;
function stripEmoji(t){ return typeof t === 'string' ? t.replace(STRIP_EMO_RE, '').replace(/\s{2,}/g, ' ').replace(/\s+([·,.!])/g, ' $1').trim() : t; }
function showBanner(text, sub, color, big = false, bottom = false){
  match.banner = { text: stripEmoji(text), sub: sub ? stripEmoji(sub) : sub, color: color || '#f2b705', life: 1.6, dur: 1.6, big, bottom };
}

/* aviso breve "Ventaja / Resiste" sobre un enemigo (no más de uno cada 0.7 s por enemigo) */
function showElementHint(e, mult){
  if (mult === 1 || (e.hintCd || 0) > match.elapsed) return;
  e.hintCd = match.elapsed + 0.7;
  if (mult > 1) addFloatText(e.x, e.y - 30, '▲ Ventaja', '#8be28f');
  else          addFloatText(e.x, e.y - 30, '▼ Resiste', '#9fc8ad');
}
/* número de daño pequeño (blanco) en cada golpe; se agrupan si golpeas muy seguido al mismo rival */
function addDamageText(e, hit){
  const t = e._dmgText;
  if (t && t.life > 0.55 && match.texts.includes(t)){ t.sum += hit; t.text = String(Math.round(t.sum)); return; }
  if (match.texts.length > 90) return;
  const nt = { x: e.x + (Math.random() - 0.5) * 16, y: e.y - 44, text: String(Math.round(hit)), color: '#ffffff', life: 0.7, sum: hit, small: true };
  match.texts.push(nt); e._dmgText = nt;
}
function addFloatText(x, y, text, color){
  text = stripEmoji(String(text));
  if (!text) return;
  match.texts.push({ x, y, text, color, life: 0.8 });
}

/* ---- fin de partida ---- */
/* won = true cuando se llega al minuto 30 (aquí irá el boss final, Aphrodite) */
function endMatch(won = false, reason = null){
  if (match.over) return;
  match.over = true;
  match.revivable = DEV_ULTS && match.hp <= 0;   // botón de revivir solo con las herramientas de prueba activadas
  match.coinsBefore = match.coinsEarned;
  cancelAnimationFrame(rafId);
  window.onkeydown = null; window.onkeyup = null;
  if (won) match.coinsEarned += 100;          // premio por aguantar el partido entero
  const markBonus = reason === 'mark' && match.mark ? 25 * Math.floor((match.elapsed - match.mark.start) / 30) : 0;   // +25 por cada 30 s contra Mark
  match.coinsEarned += markBonus;
  const fortune = Math.round(match.coinsEarned * ((match.coinMult || 1) - 1));   // mejora Fortuna
  match.coinsEarned += fortune;
  const amulet = hasRelic('amuleto') ? Math.round(match.coinsEarned * 0.5) : 0;    // Amuleto de oro
  match.coinsEarned += amulet;
  state.coins += match.coinsEarned;
  state.tickets += match.ticketsEarned;
  state.ticketsEpic += match.ticketsEpicEarned || 0;
  match.awarded = { coins: match.coinsEarned, tickets: match.ticketsEarned, epic: match.ticketsEpicEarned || 0 };
  saveState();
  refreshCoinBadges();
  updateHud();
  document.getElementById('boss-bar').classList.add('hidden');
  document.getElementById('gameover-title').textContent = won ? '¡Final del partido!' : (reason === 'timeout' || reason === 'referee') ? '¡Pitido final!' : 'Fin del partido';
  document.getElementById('gameover-stats').innerHTML =
    (reason === 'timeout' ? 'El árbitro ha pitado el final: no venciste al boss en 1:30<br>' : '') +
    (reason === 'referee' ? 'El árbitro ha pitado el final: no llegaste a tiempo al duelo<br>' : '') +
    `Aguantaste ${String(Math.floor(matchClock() / 60)).padStart(2, '0')}:${String(Math.floor(matchClock() % 60)).padStart(2, '0')} · Nivel ${match.level}<br>` +
    (reason === 'mark' && match.mark ? `Contra Mark Evans: ${Math.floor((match.elapsed - match.mark.start) / 60)}:${String(Math.floor((match.elapsed - match.mark.start) % 60)).padStart(2, '0')} (poder ×${markStats().dmg.toFixed(1)}) · +${markBonus} ${COIN_HTML}<br>` : '') +
    `Bosses vencidos: ${match.bossesBeaten} / ${BOSSES.length}<br>` +
    `Monedas ganadas: ${match.coinsEarned} ${COIN_HTML}` + (won ? ' (incluye 100 por terminar)' : '') + (fortune ? ` (+${fortune} por Fortuna)` : '') + (amulet ? ` (+${amulet} por el Amuleto de oro)` : '') +
    (match.ticketsEarned ? `<br>Tickets amarillos: ${match.ticketsEarned} ${pxImg('ticketY', 18)}` : '') + (match.ticketsEpicEarned ? `<br>Tickets morados: ${match.ticketsEpicEarned} ${pxImg('ticketP', 18)}` : '');
  document.getElementById('btn-revive').classList.toggle('hidden', !match.revivable);
  document.getElementById('gameover-overlay').classList.remove('hidden');
}

/* PRUEBA: revivir al morir. Devuelve lo cobrado (se cobra otra vez al acabar de verdad),
   vida al máximo y 3 s invulnerable con el escudo verde, y sigue el partido donde estaba */
function revivePlayer(){
  if (!match || !match.over || !match.revivable) return;
  const A = match.awarded || { coins:0, tickets:0, epic:0 };
  state.coins -= A.coins; state.tickets -= A.tickets; state.ticketsEpic -= A.epic;
  match.coinsEarned = match.coinsBefore; match.awarded = null;
  saveState(); refreshCoinBadges();
  match.over = false; match.revivable = false; match.paused = false; match.menuOpen = false; match.dying = null; canvas.classList.remove('dead-bw'); document.getElementById('screen-game').classList.remove('dead-bw');
  match.hp = match.maxHp;
  pbInit().until.green = match.elapsed + 3;
  document.getElementById('gameover-overlay').classList.add('hidden');
  if (match.inArena && bossAlive()) document.getElementById('boss-bar').classList.remove('hidden');
  bindControls();
  updateHud();
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
}
document.getElementById('btn-revive').onclick = revivePlayer;
