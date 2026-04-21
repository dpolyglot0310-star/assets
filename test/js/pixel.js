// ---- Pixel Indexer ----
    let pixelApp = null;
    let p5Loaded = false;
    
    let showGuide = false; // ガイド表示のON/OFF
    let originCol = 0; // 基準となる列(X)
    let originRow = 0; // 基準となる行(Y)


    let guideOrigin = { x: 0, y: 0 };

    // 以下20260406追加

    let usedPresetColors = new Set();

    // --- 仮想キャンバス（論理データ） ---
    let rawImg = null;       // ユーザーがアップロードした「加工前」のオリジナル画像
    let virtualCanvas = null; // pxUpdateが生成した「1px=1ドット」のデータ
    let displayScale = 1.0;    // 画面に表示する際の拡大率

    // --- 状態管理 ---
    let dotWidth  = 0; // ドット化された後の横幅 (px)
    let dotHeight = 0; // ドット化された後の縦幅 (px)

    // --- パレット・処理用 ---
    let currentPalette = []; // 現在の画像から抽出された全色 (#hex)
    let swapMap = {};        // { [元の色]: [変更後の色] }


    // --- ゲームのカラープリセット（後で中身を差し替え） ---
    const gameMasterPalette = {
        "0　白黒系統": [[],[4,22,22],[64,68,69],[128,130,129],[191,193,192],[255,255,255]],
        "1　赤系統": [[],[208, 52, 76],[239,110,114],[166,38,61],[245,172,166],[202,132,132],[163,93,95],[105,49,60],[232,214,214],[192,172,171],[116,95,94]],
        "2　橙系統": [[],[234,94,43],[250,131,88],[171,66,37],[253,186,159],[218,147,125],[175,107,88],[116,59,48],[233,214,208],[191,172,166],[115,94,89]],
        "3　うす橙系統": [[],[244,158,21],[254,179,59],[177,110,23],[255,207,145],[219,167,109],[179,129,76],[120,81,38],[245,227,207],[206,188,168],[128,111,95]],
        "4　黄系統": [[],[238,201,22],[251,217,57],[179,148,23],[250,230,143],[211,190,109],[171,149,74],[117,98,39],[239,230,199],[198,191,162],[120,114,90]],
        "5　黄緑系統": [[],[167,188,21],[182,201,49],[116,134,22],[216,223,146],[172,183,107],[133,144,75],[84,94,42],[229,233,200],[188,193,163],[111,116,94]],
        "6　緑系統": [[],[5,162,93],[65,185,123],[5,117,71],[156,217,173],[118,178,140],[80,137,104],[37,86,64],[196,223,204],[156,183,166],[84,104,93]],
        "7　青緑系統": [[],[4,135,129],[5,171,161],[5,103,102],[125,205,192],[87,164,156],[45,126,120],[5,75,75],[191,223,218],[152,183,178],[77,106,102]],
        "8　青系統":[[],[6,94,166],[45,131,192],[5,69,130],[132,168,202],[93,128,160],[55,91,127],[25,59,86],[192,205,214],[156,166,176],[76,90,103]],
        "9　青紫系統": [[],[85,77,162],[115,118,189],[62,56,126],[162,160,200],[120,122,161],[87,86,126],[51,52,83],[201,203,215],[161,163,176],[89,88,104]],
        "10　紫系統": [[],[129,62,141],[160,104,169],[95,43,107],[184,155,185],[145,115,149],[108,78,116],[67,46,75],[208,201,209],[171,161,172],[97,86,102]],
        "11　赤紫系統": [[],[174,52,111],[208,106,143],[134,37,88],[218,161,180],[180,121,139],[140,82,104],[96,52,75],[226,214,218],[189,173,176],[114,94,103]]
    };

    // 選択されているRGBを管理するSet（文字列化して保持）
    let activeMasterColors = new Set();

    // ここまで20260406


    function initPixel() {
        if (pixelApp) return; // 初期化済み
        if (!p5Loaded) {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js';
            s.onload = () => { p5Loaded = true; _buildPixelApp(); };
            document.head.appendChild(s);
        } else {
            _buildPixelApp();
        }
    }

    function toHexStr(r, g, b) {
        return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,v|0)).toString(16).padStart(2,'0')).join('');
    }

    function _buildPixelApp() {
        const container = document.getElementById('pixel-app-container');
        pixelApp = new p5(function(p) {
            let sourceImg = null, rawImg = null, selectedHex = null, swapMap = {};
            let history = [], historyMax = 20;
            let gridSize = 10, quantizeStep = 32, useDither = true, useQuant = true, quantMethod = 'uniform', rawMode = false, bgColor = '#ff00ff';
            let gridLine = false, gridLineColor = '#333333', gridLineWeight = 1;
            let maxColors = 256, useMaxColors = true;
            let paintMode = null; // 'cell' | 'rect' | null
            let paintPendingCells = new Set(); // セル選択モードで選択中のセル

            p.generateVirtualCanvas = (img, gridSize) => {
                if (!img) return;

                // 1. ドット数の計算 (例: 400px / Grid 8 = 50ドット)
                dotWidth  = Math.floor(img.width / gridSize);
                dotHeight = Math.floor(img.height / gridSize);

                // 2. 仮想キャンバスの作成 (1px = 1ドットの実サイズ)
                let temp = img.get();
                temp.resize(dotWidth, dotHeight); // ここで「低解像度化」を確定させる
                
                virtualCanvas = temp;
                p.redraw();
            };

            p.setup = () => {
                const w = container.parentElement.clientWidth || 640;
                p.createCanvas(w, 400, p.P2D);
                p.clear(); // 初期状態を透明にする
                p.noSmooth();
                p.noLoop();
                new ResizeObserver(() => {
                    const nw = container.parentElement.clientWidth;
                    if (nw > 0 && nw !== p.width) {
                        p.resizeCanvas(nw, p.height);
                        p.clear(); // ★リサイズ直後も透明にリセット
                        // クロップ矩形表示中なら中央に再配置
                        if (document.getElementById('crop-rect').style.display !== 'none') showCropRect();
                        p.redraw();
                    }
                }).observe(container.parentElement);

                // マウス/タッチイベント
                const getPos = (e) => {
                    const rect = p.canvas.getBoundingClientRect();
                    const zoom = rect.width / p.canvas.offsetWidth || 1;
                    const cx = e.touches ? e.touches[0].clientX : e.clientX;
                    const cy = e.touches ? e.touches[0].clientY : e.clientY;
                    return { x: Math.max(0, Math.min(p.width, (cx-rect.left)/zoom)), y: Math.max(0, Math.min(p.height, (cy-rect.top)/zoom)) };
                };
                const handleCellPaint = (pos) => {
                    const cols = p.floor(p.width/gridSize);
                    const cx = p.floor(pos.x/gridSize), cy = p.floor(pos.y/gridSize);
                    const key = cx+','+cy;
                    paintPendingCells.add(key);
                    p.redraw();
                };
                p.canvas.addEventListener('mousedown', (e) => {
                    const pos = getPos(e);
                    // 【追加】描画モードでないときは、クリックした場所を基準点(Origin)にする
                    if (paintMode !== 'cell') {
                        originCol = p.floor(pos.x / gridSize);
                        originRow = p.floor(pos.y / gridSize);
                        p.redraw(); // 連番表示を更新するために再描画
                    }
                    // 既存の描画処理
                    if (paintMode === 'cell') {
                        e.preventDefault();
                        handleCellPaint(pos);
                        return;
                    }
                });
                p.canvas.addEventListener('mousemove', (e) => {
                    if (paintMode==='cell' && e.buttons===1) { e.preventDefault(); handleCellPaint(getPos(e)); return; }
                });
                p.canvas.addEventListener('touchstart', (e) => {
                    if (paintMode==='cell') { e.preventDefault(); handleCellPaint(getPos(e)); return; }
                }, {passive:false});
                p.canvas.addEventListener('touchmove', (e) => {
                    if (paintMode==='cell') { e.preventDefault(); handleCellPaint(getPos(e)); return; }
                }, {passive:false});
            };

            // コントロールのイベント
            p.draw = () => {
                p.clear();
                const target = window.virtualCanvas || virtualCanvas;
                if (!target) return;

                const zoom = parseFloat(document.getElementById('px-zoom').value) || 1;
                const baseGrid = window.gridSize || 10;
                const currentStep = baseGrid * zoom;
                const showGuide = document.getElementById('px-show-guide').checked;
                const bgColor = document.getElementById('px-bg').value;
                const selectedHex = window.selectedHex;
                const showAllNumbers = document.getElementById('px-show-all-numbers')?.checked;

                // --- 1. ドット絵本体の描画 ---
                p.noSmooth();
                p.image(target, 0, 0, target.width * currentStep, target.height * currentStep);

                // --- 2. ハイライト・減光処理 ---
                if (selectedHex && currentStep > 4) {
                    p.push();
                    p.noStroke();
                    p.fill(0, 140); 
                    p.rect(0, 0, target.width * currentStep, target.height * currentStep);

                    const selC = p.color(selectedHex);
                    const sr = p.red(selC), sg = p.green(selC), sb = p.blue(selC);
                    
                    let targetLoc = "";
                    const masterNodes = document.querySelectorAll(`#px-preset-table input[data-rgb]`);
                    for (const input of masterNodes) {
                        const rgb = input.dataset.rgb.split(',').map(Number);
                        if (Math.abs(rgb[0]-sr) + Math.abs(rgb[1]-sg) + Math.abs(rgb[2]-sb) < 10) {
                            targetLoc = input.dataset.location;
                            break;
                        }
                    }

                    target.loadPixels();
                    p.textAlign(p.CENTER, p.CENTER);
                    p.textSize(currentStep * 0.5);
                    
                    for (let y = 0; y < target.height; y++) {
                        for (let x = 0; x < target.width; x++) {
                            const i = (y * target.width + x) * 4;
                            if (target.pixels[i+3] < 10) continue;

                            if (target.pixels[i] === sr && target.pixels[i+1] === sg && target.pixels[i+2] === sb) {
                                const dx = x * currentStep;
                                const dy = y * currentStep;
                                p.fill(sr, sg, sb);
                                p.noStroke();
                                p.rect(dx, dy, currentStep, currentStep);

                                p.noFill();
                                p.stroke('#00ffcc'); 
                                p.strokeWeight(1);
                                p.rect(dx, dy, currentStep, currentStep);

                                if (targetLoc && currentStep > 8) {
                                    const lum = 0.299*sr + 0.587*sg + 0.114*sb;
                                    p.fill(lum > 128 ? 0 : 255);
                                    p.noStroke(); 
                                    p.text(targetLoc, dx + currentStep/2, dy + currentStep/2);
                                }
                            }
                        }
                    }
                    p.pop();
                }

                // --- 🌟 追加：全色の番号表示 (ハイライト中以外も表示) ---
                // ハイライト（selectedHex）がない時、かつスイッチがONの時のみ全表示
                if (window.isAllNumbersMode && currentStep > 12) {
                        p.push();
                        p.textAlign(p.CENTER, p.CENTER);
                        p.textSize(currentStep * 0.4);
                        p.noStroke();

                        const masterMap = new Map();
                        document.querySelectorAll(`#px-preset-table input[data-rgb]`).forEach(input => {
                            masterMap.set(input.dataset.rgb, input.dataset.location);
                        });

                        target.loadPixels();
                        for (let y = 0; y < target.height; y++) {
                            for (let x = 0; x < target.width; x++) {
                                const i = (y * target.width + x) * 4;
                                if (target.pixels[i+3] < 10) continue;
                                const r = target.pixels[i], g = target.pixels[i+1], b = target.pixels[i+2];
                                const loc = masterMap.get(`${r},${g},${b}`);
                                if (loc) {
                                    const lum = 0.299*r + 0.587*g + 0.114*b;
                                    p.fill(lum > 128 ? 0 : 255);
                                    p.text(loc, x * currentStep + currentStep/2, y * currentStep + currentStep/2);
                                }
                            }
                        }
                        p.pop();
                    }

                // --- 3. グリッドとガイド ---
                // （以下、提示された既存のグリッド・ガイド処理をそのまま継続）
                if (document.getElementById('px-gridline').checked) {
                    p.stroke(document.getElementById('px-gridline-color').value);
                    p.strokeWeight(parseInt(document.getElementById('px-gridline-w').value));
                    for (let x = 0; x <= target.width; x++) p.line(x * currentStep, 0, x * currentStep, target.height * currentStep);
                    for (let y = 0; y <= target.height; y++) p.line(0, y * currentStep, target.width * currentStep, y * currentStep);
                }
                
                if (showGuide && typeof guideOrigin !== 'undefined') {
                    p.push();
                    p.textAlign(p.CENTER, p.CENTER); p.noStroke();
                    const accent = p.color(255, 255, 0), sub = p.color(255, 255, 255), edge = p.color(bgColor);
                    const drawText = (val, dx, dy, isA) => {
                        const txt = (val === 0) ? "0" : (val % 10 === 0 ? val : val % 10);
                        p.textSize(isA ? Math.max(10, currentStep*0.5) : Math.max(8, currentStep*0.35));
                        p.fill(edge);
                        for(let ox=-1; ox<=1; ox++) for(let oy=-1; oy<=1; oy++) if(ox||oy) p.text(txt, dx+ox, dy+oy);
                        p.fill(isA ? accent : sub); p.text(txt, dx, dy);
                    };
                    const oxp = guideOrigin.x * currentStep + currentStep/2;
                    const oyp = guideOrigin.y * currentStep + currentStep/2;
                    for (let x = 0; x < target.width; x++) drawText(Math.abs(x-guideOrigin.x), x*currentStep+currentStep/2, oyp, Math.abs(x-guideOrigin.x)%10===0);
                    for (let y = 0; y < target.height; y++) if(y!==guideOrigin.y) drawText(Math.abs(y-guideOrigin.y), oxp, y*currentStep+currentStep/2, Math.abs(y-guideOrigin.y)%10===0);
                    p.pop();
                }
            };


            // モード切り替え時などに明示的に呼ぶ
            function applyMasterPreset() {
                const target = window.virtualCanvas || virtualCanvas;
                const quantMethod = document.getElementById('px-quant-method')?.value;
                if (!target || quantMethod !== 'preset') return;

                const masterNodes = document.querySelectorAll(`#px-preset-table input[data-rgb]`);
                const masterPalettes = Array.from(masterNodes).map(input => input.dataset.rgb.split(',').map(Number));
                if (masterPalettes.length === 0) return;

                target.loadPixels();
                for (let i = 0; i < target.pixels.length; i += 4) {
                    if (target.pixels[i + 3] < 10) continue;

                    const r = target.pixels[i], g = target.pixels[i+1], b = target.pixels[i+2];
                    let minD = Infinity;
                    let closest = masterPalettes[0];

                    for (const m of masterPalettes) {
                        // 🔴 ここです！この計算式を「重み付き」に変えます
                        const d = Math.pow((r - m[0]) * 0.299, 2) + 
                                Math.pow((g - m[1]) * 0.587, 2) + 
                                Math.pow((b - m[2]) * 0.114, 2);
                                
                        if (d < minD) { 
                            minD = d; 
                            closest = m; 
                        }
                    }
                    // ピクセル値を完全に上書き
                    target.pixels[i]     = closest[0];
                    target.pixels[i + 1] = closest[1];
                    target.pixels[i + 2] = closest[2];
                }
                target.updatePixels();
            }

            
            p.applyPaint = (x, y, hex) => {
                if (!window.virtualCanvas) return;
                
                window.virtualCanvas.loadPixels();
                const idx = (x + y * window.virtualCanvas.width) * 4;
                
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);

                window.virtualCanvas.pixels[idx] = r;
                window.virtualCanvas.pixels[idx+1] = g;
                window.virtualCanvas.pixels[idx+2] = b;
                window.virtualCanvas.pixels[idx+3] = 255;
                
                window.virtualCanvas.updatePixels();
                
                // 🌟 塗った色をパレットに反映させるために updatePalette を呼ぶ
                if (typeof updatePalette === 'function') updatePalette();
                p.redraw();
            };


            // ガイド表示用の関数（同階層に追加）
            function drawGuideOverlay() {
                if (gridLine) {
                    p.stroke(gridLineColor);
                    p.strokeWeight(gridLineWeight / (p.width / virtualCanvas.width)); // 倍率補正
                    // ...グリッド描画ロジック（必要なら）...
                }
                // ひとまず空でもエラーは消えます
            }

            function saveOriginalSize() {
                if (!virtualCanvas) return;
                // virtualCanvas はすでに 1px=1ドット のデータになっている
                p.save(virtualCanvas, "pixel_art_export.png");
            }

            paintMode = null; // 'cell', 'rect' など

            // p5.js内のクリックイベントを拡張
            p.mousePressed = () => {
                // Canvas内かチェック
                if (p.mouseX < 0 || p.mouseX > p.width || p.mouseY < 0 || p.mouseY > p.height) return;

                const zoom = parseFloat(document.getElementById('px-zoom').value) || 1;
                const currentStep = (window.gridSize || 10) * zoom;
                
                // クリックしたドット座標
                const dotX = Math.floor(p.mouseX / currentStep);
                const dotY = Math.floor(p.mouseY / currentStep);

                // --- 1. ペイントモード時 ---
                if (window.currentPaintMode === 'cell') {
                    const paintColor = document.getElementById('px-paint-color').value;
                    p.applyPaint(dotX, dotY, paintColor);
                    return; // ペイント時はここで終了
                }

                // --- 2. Shiftキー押下時：ガイドの移動 ---
                if (p.keyIsDown(p.SHIFT)) {
                    window.isAllNumbersMode = false; // 🌟 スポイト(色選択)したら全表示は終わり
                    if (typeof guideOrigin !== 'undefined') {
                        guideOrigin.x = dotX;
                        guideOrigin.y = dotY;
                        p.redraw();
                    }
                    console.log(`ガイド移動: ${dotX}, ${dotY}`);
                } 
                // --- 3. 通常クリック：Canvasから色を選択（スポイト機能） ---
                else {
                    const target = window.virtualCanvas || virtualCanvas;
                    if (!target) return;

                    target.loadPixels();
                    const i = (dotY * target.width + dotX) * 4;
                    const a = target.pixels[i+3];

                    // 透明ピクセル（a < 10）なら何もしない
                    if (a < 10) return;

                    const r = target.pixels[i];
                    const g = target.pixels[i+1];
                    const b = target.pixels[i+2];
                    
                    // RGBをHex形式に変換
                    const clickedHex = "#" + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toLowerCase();

                    // パレットから該当する色を探してクリックを発火
                    const allChips = document.querySelectorAll('#px-palette .px-chip');
                    let found = false;

                    allChips.forEach(chip => {
                        const box = chip.querySelector('.px-box');
                        if (!box) return;

                        // ブラウザが保持している背景色 (rgb(r, g, b)) を比較用に変換
                        if (rgbToHex(box.style.backgroundColor) === clickedHex) {
                            box.click(); // renderPxPaletteで設定した onclick ロジックを走らせる
                            found = true;
                        }
                    });

                    if (found) {
                        console.log(`色を選択しました: ${clickedHex}`);
                    }
                }
            };

            // ヘルパー：ブラウザの rgb(r, g, b) 文字列を #rrggbb に変換
            function rgbToHex(rgb) {
                if (!rgb || rgb.startsWith('#')) return rgb?.toLowerCase();
                const match = rgb.match(/\d+/g);
                if (!match) return "";
                return "#" + match.slice(0, 3).map(v => parseInt(v).toString(16).padStart(2, '0')).join('').toLowerCase();
            }

            // p5.jsのインスタンス内に追加
            p.applyRectPaint = (rx, ry, rw, rh, hex) => {
                if (!window.virtualCanvas) return;
                window.virtualCanvas.loadPixels();
                
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);

                for (let y = ry; y < ry + rh; y++) {
                    for (let x = rx; x < rx + rw; x++) {
                        if (x >= 0 && x < window.virtualCanvas.width && y >= 0 && y < window.virtualCanvas.height) {
                            const idx = (x + y * window.virtualCanvas.width) * 4;
                            window.virtualCanvas.pixels[idx] = r;
                            window.virtualCanvas.pixels[idx+1] = g;
                            window.virtualCanvas.pixels[idx+2] = b;
                            window.virtualCanvas.pixels[idx+3] = 255;
                        }
                    }
                }
                window.virtualCanvas.updatePixels();
                if (typeof updatePalette === 'function') updatePalette();
                p.redraw();
            };

            p.stopPaint = () => {
                window.currentPaintMode = null;
                p.redraw();
            };

            // 特定の1ドットを塗り替える関数
            function applySinglePixelPaint(x, y, hexColor) {
                if (!virtualCanvas) return;
                virtualCanvas.loadPixels();
                const idx = (x + y * virtualCanvas.width) * 4;
                
                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);

                virtualCanvas.pixels[idx] = r;
                virtualCanvas.pixels[idx+1] = g;
                virtualCanvas.pixels[idx+2] = b;
                virtualCanvas.pixels[idx+3] = 255;
                
                virtualCanvas.updatePixels();
                p.redraw();
            }

            function sp(buf,x,y,cols,rows,er,eg,eb,w){
                if(x<0||x>=cols||y>=rows)return;
                const i=(x+y*cols)*4;buf[i]+=er*w;buf[i+1]+=eg*w;buf[i+2]+=eb*w;
            }
            function lum(p,h){const c=p.color(h);return .299*p.red(c)+.587*p.green(c)+.114*p.blue(c);}

            function kmeansQuantize(buf, cols, rows, qs, dither) {
                // k = 256/qsをクラスタ数の目安に使用
                const k = Math.max(2, Math.min(64, Math.round(256 / qs)));
                const n = cols * rows;
                // 初期センター：ランダムサンプリング
                let centers = [];
                const used = new Set();
                while (centers.length < k) {
                    const idx = Math.floor(Math.random() * n);
                    if (!used.has(idx)) { used.add(idx); const i=idx*4; centers.push([buf[i],buf[i+1],buf[i+2]]); }
                }
                // イテレーション（10回）
                for (let iter=0; iter<10; iter++) {
                    const sums = centers.map(()=>[0,0,0,0]);
                    for (let j=0; j<n; j++) {
                        const i=j*4, r=buf[i],g=buf[i+1],b=buf[i+2];
                        let best=0, bestD=Infinity;
                        centers.forEach((c,ci)=>{ const d=(c[0]-r)**2+(c[1]-g)**2+(c[2]-b)**2; if(d<bestD){bestD=d;best=ci;} });
                        sums[best][0]+=r; sums[best][1]+=g; sums[best][2]+=b; sums[best][3]++;
                    }
                    centers = sums.map((s,ci)=> s[3]>0 ? [s[0]/s[3],s[1]/s[3],s[2]/s[3]] : centers[ci]);
                }
                // ピクセルを最近センターに置き換え（ディザあり）
                if (dither) {
                    for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
                        const i=(x+y*cols)*4, r=buf[i],g=buf[i+1],b=buf[i+2];
                        let best=0, bestD=Infinity;
                        centers.forEach((c,ci)=>{ const d=(c[0]-r)**2+(c[1]-g)**2+(c[2]-b)**2; if(d<bestD){bestD=d;best=ci;} });
                        const nr=Math.round(centers[best][0]), ng=Math.round(centers[best][1]), nb=Math.round(centers[best][2]);
                        buf[i]=nr; buf[i+1]=ng; buf[i+2]=nb;
                        const er=r-nr, eg=g-ng, eb=b-nb;
                        sp(buf,x+1,y,  cols,rows,er,eg,eb,7/16);
                        sp(buf,x-1,y+1,cols,rows,er,eg,eb,3/16);
                        sp(buf,x,  y+1,cols,rows,er,eg,eb,5/16);
                        sp(buf,x+1,y+1,cols,rows,er,eg,eb,1/16);
                    }
                } else {
                    for (let j=0; j<n; j++) {
                        const i=j*4, r=buf[i],g=buf[i+1],b=buf[i+2];
                        let best=0, bestD=Infinity;
                        centers.forEach((c,ci)=>{ const d=(c[0]-r)**2+(c[1]-g)**2+(c[2]-b)**2; if(d<bestD){bestD=d;best=ci;} });
                        buf[i]=Math.round(centers[best][0]); buf[i+1]=Math.round(centers[best][1]); buf[i+2]=Math.round(centers[best][2]);
                    }
                }
            }

            function medianCutQuantize(buf, cols, rows, qs, dither) {
                // k = 256/qs をパレット数の目安に使用
                const k = Math.max(2, Math.min(256, Math.round(256 / qs)));
                const n = cols * rows;
                // ピクセルをRGB配列として収集
                const pixels = [];
                for (let i = 0; i < n; i++) pixels.push([buf[i*4], buf[i*4+1], buf[i*4+2]]);

                // Median Cut: ボックスをチャンネル幅が最大の軸で分割
                let boxes = [pixels];
                while (boxes.length < k) {
                    // 最大ボックスを選択
                    let maxIdx = 0, maxRange = -1;
                    boxes.forEach((box, bi) => {
                        let rMin=255,rMax=0,gMin=255,gMax=0,bMin=255,bMax=0;
                        box.forEach(([r,g,b]) => {
                            if(r<rMin)rMin=r; if(r>rMax)rMax=r;
                            if(g<gMin)gMin=g; if(g>gMax)gMax=g;
                            if(b<bMin)bMin=b; if(b>bMax)bMax=b;
                        });
                        const range = Math.max(rMax-rMin, gMax-gMin, bMax-bMin);
                        if (range > maxRange) { maxRange = range; maxIdx = bi; }
                    });
                    if (maxRange === 0) break;
                    const box = boxes.splice(maxIdx, 1)[0];
                    // 最大レンジの軸を特定してソート・分割
                    let rMin=255,rMax=0,gMin=255,gMax=0,bMin=255,bMax=0;
                    box.forEach(([r,g,b]) => {
                        if(r<rMin)rMin=r; if(r>rMax)rMax=r;
                        if(g<gMin)gMin=g; if(g>gMax)gMax=g;
                        if(b<bMin)bMin=b; if(b>bMax)bMax=b;
                    });
                    const rR=rMax-rMin, gR=gMax-gMin, bR=bMax-bMin;
                    const axis = rR>=gR && rR>=bR ? 0 : gR>=bR ? 1 : 2;
                    box.sort((a,b) => a[axis]-b[axis]);
                    const mid = Math.floor(box.length / 2);
                    boxes.push(box.slice(0, mid), box.slice(mid));
                }
                // 各ボックスの平均色をパレットに
                const palette = boxes.map(box => {
                    const sum = box.reduce((a,c) => [a[0]+c[0],a[1]+c[1],a[2]+c[2]], [0,0,0]);
                    return sum.map(v => Math.round(v / box.length));
                });
                // 最近傍パレット色に置き換え（ディザあり）
                const nearest = (r,g,b) => {
                    let best=0, bestD=Infinity;
                    palette.forEach((c,ci) => { const d=(c[0]-r)**2+(c[1]-g)**2+(c[2]-b)**2; if(d<bestD){bestD=d;best=ci;} });
                    return palette[best];
                };
                if (dither) {
                    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
                        const i=(x+y*cols)*4, r=buf[i],g=buf[i+1],b=buf[i+2];
                        const [nr,ng,nb] = nearest(r,g,b);
                        buf[i]=nr; buf[i+1]=ng; buf[i+2]=nb;
                        const er=r-nr, eg=g-ng, eb=b-nb;
                        sp(buf,x+1,y,  cols,rows,er,eg,eb,7/16);
                        sp(buf,x-1,y+1,cols,rows,er,eg,eb,3/16);
                        sp(buf,x,  y+1,cols,rows,er,eg,eb,5/16);
                        sp(buf,x+1,y+1,cols,rows,er,eg,eb,1/16);
                    }
                } else {
                    for (let j=0;j<n;j++) {
                        const i=j*4;
                        const [nr,ng,nb] = nearest(buf[i],buf[i+1],buf[i+2]);
                        buf[i]=nr; buf[i+1]=ng; buf[i+2]=nb;
                    }
                }
            }

            const wrap = () => document.getElementById('pixel-app-container').closest('.px-canvas-wrap');

            p.setImage = (url) => p.loadImage(url, img => {
                console.log("画像読み込み成功:", img.width, "x", img.height); // ←これを入れる
                sourceImg = img;
                window.rawImg = img.get(); // ここで「生の画像」がセットされる
                swapMap={}; selectedHex=null; history=[];
                document.getElementById('px-img-info').textContent = '元画像: ' + img.width + ' × ' + img.height + ' px';
                document.getElementById('px-crop-btn').style.display='inline-block';
                document.getElementById('px-crop-confirm').style.display='none';
                document.getElementById('px-crop-reset').style.display='none';
                document.getElementById('px-undo').disabled=true;
                document.getElementById('px-paint-open').style.display='inline-block';
                document.getElementById('px-paint-bar').style.display='none';
                document.getElementById('px-source-bar').style.display='flex';
                switchImgView('current');
                hideCropRect();
                pxSelected.clear(); updateBulkBar();
                setTimeout(() => p.redraw(), 0);
                setTimeout(() => {
                    console.log("pxUpdateを呼び出します。rawImgの状態:", !!window.rawImg);
                    window.pxUpdate();
                }, 50);
            });
            // 元画像/加工中の切り替え
            p.viewOriginal = () => { if (sourceImg) { rawImg=sourceImg.get(); p.redraw(); } };
            p.getCanvasDataURL = () => p.canvas ? p.canvas.toDataURL() : null;
            p.cropConfirm = () => {
                const cr = document.getElementById('crop-rect');
                if (!cr || !rawImg) return;

                // 🌟 基準を Canvas の内部解像度に統一（これでズレを防ぐ）
                const scaleX = rawImg.width / p.width;
                const scaleY = rawImg.height / p.height;

                const rx = Math.round(parseInt(cr.style.left) * scaleX);
                const ry = Math.round(parseInt(cr.style.top) * scaleY);
                const rw = Math.round(parseInt(cr.style.width) * scaleX);
                const rh = Math.round(parseInt(cr.style.height) * scaleY);

                if (rw < 2 || rh < 2) return;

                p.pushHistory();

                // 🌟 rawImg を直接 get して更新する
                rawImg = rawImg.get(rx, ry, rw, rh);
                window.rawImg = rawImg; // グローバルも同期

                // 🌟 ドット絵再計算（これを忘れると見た目が変わらない）
                if (typeof pxUpdate === 'function') {
                    pxUpdate();
                }

                hideCropRect();
                document.getElementById('px-crop-confirm').style.display = 'none';
                document.getElementById('px-crop-reset').style.display = 'inline-block';
                p.redraw();
            };
            p.cropReset = () => {
                // 1. sourceImg（オリジナル）があるか確認
                if (!sourceImg) {
                    console.error("元画像が見つかりません");
                    return;
                }

                // 2. データを完全に初期状態に戻す
                rawImg = sourceImg.get(); 
                window.rawImg = rawImg;

                // 3. UIをリセット
                hideCropRect();
                document.getElementById('px-crop-confirm').style.display = 'none';
                document.getElementById('px-crop-reset').style.display = 'none';
                document.getElementById('px-crop-btn').style.display = 'inline-block';

                // 4. 重要：再計算して描画
                if (typeof pxUpdate === 'function') {
                    pxUpdate();
                }
                p.redraw();
            };

            /*
            p.pxUpdate = (gs,qs,uq,qm,dt,rm,bg,gl,glc,glw,mc,umc) => {
                gridSize=gs; quantizeStep=qs; useQuant=uq; quantMethod=qm;
                useDither=dt; rawMode=rm; bgColor=bg;
                gridLine=gl; gridLineColor=glc; gridLineWeight=glw;
                maxColors=mc; useMaxColors=umc;

                // 🌟 描画を予約
                p.redraw();

                // 🌟 少しだけ遅らせて（描画完了後など）パレットUIを更新する
                // もしくは直接ここでUI更新関数を呼ぶ
                if (typeof updateUsedColorsUI === 'function') {
                    // virtualCanvas の中身を集計して HTML を書き換える関数
                    setTimeout(updateUsedColorsUI, 50); 
                }
            };
            */
            
            p.pushHistory = () => {
                if (!rawImg) return;
                history.push(rawImg.get());
                if (history.length > historyMax) history.shift();
                document.getElementById('px-undo').disabled = false;
            };
            p.undo = () => {
                if (!history.length) return;
                rawImg = history.pop();
                if (!history.length) document.getElementById('px-undo').disabled = true;
                p.redraw();
            };
            p.highlight = hv => { selectedHex=(selectedHex===hv?null:hv); p.redraw(); };
            p.swap = (from,to) => {
                // 色変更時は減色・MaxColorsを自動オフにして正確な色で操作
                if (useQuant || useMaxColors) {
                    useQuant=false; useMaxColors=false;
                    document.getElementById('px-quant').checked=false;
                    document.getElementById('px-maxcol-on').checked=false;
                    pxUpdate();
                }
                if(from===to) delete swapMap[from]; else swapMap[from]=to;
                p.redraw();
            };
            p.resetSwap = hv => { delete swapMap[hv]; p.redraw(); };
            p.getSwapMap  = () => swapMap;
            p.getSourceImg= () => sourceImg;
            p.startPaint = (mode) => {
                paintMode=mode; paintPendingCells.clear();
                p.canvas.style.cursor = mode==='cell' ? 'crosshair' : 'default';
                p.redraw();
            };
            p.confirmPaint = (color) => {
                if (!color) return;
                const cols=p.floor(p.width/gridSize), rows=p.floor(p.height/gridSize);
                if (paintMode==='cell') {
                    // finalColorsを再計算して選択セルの色をswapMapに登録
                    paintPendingCells.forEach(key=>{
                        const [cx,cy]=key.split(',').map(Number);
                        if (cx<cols && cy<rows) {
                            // draw内と同じ計算でfinalColorを取得
                            const temp=rawImg.get(); temp.resize(cols,rows); temp.loadPixels();
                            const i=(cx+cy*cols)*4;
                            const fc=toHexStr(temp.pixels[i],temp.pixels[i+1],temp.pixels[i+2]);
                            swapMap[fc]=color;
                        }
                    });
                } else if (paintMode==='rect') {
                    const cr=document.getElementById('crop-rect');
                    const cv=p.canvas;
                    const sx=rawImg.width/cv.offsetWidth, sy=rawImg.height/cv.offsetHeight;
                    const rl=parseInt(cr.style.left)||0, rt=parseInt(cr.style.top)||0;
                    const rw=parseInt(cr.style.width)||0, rh=parseInt(cr.style.height)||0;
                    const temp=rawImg.get(); temp.resize(cols,rows); temp.loadPixels();
                    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
                        const px=x*gridSize+gridSize/2, py=y*gridSize+gridSize/2;
                        if (px>=rl && px<=rl+rw && py>=rt && py<=rt+rh) {
                            const i=(x+y*cols)*4;
                            const fc=toHexStr(temp.pixels[i],temp.pixels[i+1],temp.pixels[i+2]);
                            swapMap[fc]=color;
                        }
                    }
                }
                paintPendingCells.clear();
                paintMode=null;
                p.canvas.style.cursor='default';
                p.redraw();
            };
            p.stopPaint = () => {
                paintMode=null; paintPendingCells.clear();
                p.canvas.style.cursor='default';
                p.redraw();
            };
            
                    // コントロールのイベント

            let colorCache = new Map();
            window.pxUpdate = function() {
                console.log("pxUpdate開始");
                
                // 画像のチェック
                const targetImg = window.rawImg;
                if (!targetImg) {
                    console.log("rawImgがありません");
                    return;
                }

                // --- 設定値の同期 ---
                const currentGridSize = parseInt(window.gridSize) || 10;
                const currentStep     = parseInt(window.quantizeStep) || 32;
                const currentMethod   = window.quantMethod || 'standard'; 
                const currentRawMode  = window.rawMode || false;
                const currentUseQuant = (window.useQuant !== undefined) ? window.useQuant : true;
                const currentUseDither = (window.useDither !== undefined) ? window.useDither : true;

                // 1. 論理サイズ（ドット数）の決定
                const cols = Math.floor(targetImg.width / currentGridSize);
                const rows = Math.floor(targetImg.height / currentGridSize);
                
                if (cols <= 0 || rows <= 0) {
                    console.log("サイズが不正です:", cols, rows);
                    return;
                }

                // 2. 仮想キャンバスとソースデータの作成
                let vCanvas = p.createImage(cols, rows);
                let source = p.createImage(cols, rows);
                
                // 🌟元画像の全範囲をドット数に合わせてきっちりコピー
                source.copy(targetImg, 0, 0, targetImg.width, targetImg.height, 0, 0, cols, rows);
                source.loadPixels();
                
                // 3. 量子化バッファの準備
                const buf = new Float32Array(source.pixels.length);
                for (let i = 0; i < source.pixels.length; i++) {
                    buf[i] = source.pixels[i];
                }

                // --- 4. 減色・量子化の実行 ---
                if (!currentRawMode && currentUseQuant) {
                    if (currentMethod === 'preset') {
                        const masterNodes = document.querySelectorAll(`#px-preset-table input[data-rgb]:checked`);
                        if (masterNodes.length === 0) {
                            console.log("選択されているマスターカラーがありません");
                            return; 
                        }
                        const masterPalettes = Array.from(masterNodes).map(input => input.dataset.rgb.split(',').map(Number));
                        colorCache.clear();
                        for (let i = 0; i < buf.length; i += 4) {
                            if (buf[i + 3] < 10) continue;
                            const key = `${buf[i]},${buf[i+1]},${buf[i+2]}`;
                            if (!colorCache.has(key)) {
                                let minD = Infinity;
                                let closest = masterPalettes[0];
                                for (const m of masterPalettes) {
                                    const d = Math.pow(buf[i]-m[0],2) + Math.pow(buf[i+1]-m[1],2) + Math.pow(buf[i+2]-m[2],2);
                                    if (d < minD) { minD = d; closest = m; }
                                }
                                colorCache.set(key, closest);
                            }
                            const finalColor = colorCache.get(key);
                            buf[i] = finalColor[0]; buf[i+1] = finalColor[1]; buf[i+2] = finalColor[2];
                        }
                    } else if (currentMethod === 'kmeans') {
                        kmeansQuantize(buf, cols, rows, currentStep, currentUseDither);
                    } else if (currentMethod === 'mediancut') {
                        medianCutQuantize(buf, cols, rows, currentStep, currentUseDither);
                    } else {
                        applyStandardQuantize(buf, cols, rows, currentStep, currentUseDither);
                    }
                }

                // --- 5. vCanvas への書き戻し ---
                vCanvas.loadPixels();
                usedPresetColors.clear();

                for (let i = 0; i < buf.length; i += 4) {
                    let r = buf[i], g = buf[i+1], b = buf[i+2], a = buf[i+3];
                    
                    // 透過の処理（10以下は完全に透明にする）
                    if (a < 10) {
                        vCanvas.pixels[i+3] = 0;
                        continue;
                    }

                    let fr, fg, fb, fa;
                    if (currentMethod === 'preset') {
                        // 🌟 マスタープリセット時：
                        // 1ピクセルの狂いも許さず、完全にベタ塗り（不透明）にする
                        fr = Math.round(r);
                        fg = Math.round(g);
                        fb = Math.round(b);
                        fa = 255; // アルファを最大に固定して影を消す
                    } else {
                        // 🌟 それ以外（Standard, K-means等）：
                        // 元の計算値（小数含む）やアルファ値を尊重し、階調を残す
                        if (currentMethod === 'standard' || currentMethod === 'kmeans' || currentMethod === 'mediancut') {
                            // 減色処理後の色
                            fr = r; fg = g; fb = b;
                            fa = a;
                        } else {
                            // SwapMapなどの処理
                            let hex = toHexStr(r, g, b);
                            let finalHex = currentRawMode ? hex : (swapMap[hex] || hex);
                            fr = parseInt(finalHex.slice(1, 3), 16);
                            fg = parseInt(finalHex.slice(3, 5), 16);
                            fb = parseInt(finalHex.slice(5, 7), 16);
                            fa = a;
                        }
                    }

                    vCanvas.pixels[i]   = fr;
                    vCanvas.pixels[i+1] = fg;
                    vCanvas.pixels[i+2] = fb;
                    vCanvas.pixels[i+3] = fa; // ここで出し分ける
                    
                    if (currentMethod === 'preset') {
                        usedPresetColors.add(`${fr},${fg},${fb}`);
                    }
                }
                vCanvas.updatePixels();
                window.virtualCanvas = vCanvas; 
                virtualCanvas = vCanvas; 

                // --- 🌟描画領域の同期とスクロールバーの強制更新 ---
                const zoomVal = parseFloat(window.pxZoom) || 1.0;
                
                // 内部描画解像度は「ドット数 × グリッドサイズ × ズーム」で計算
                const targetW = Math.floor(cols * currentGridSize * zoomVal);
                const targetH = Math.floor(rows * currentGridSize * zoomVal);

                // 1. p5.jsの解像度更新（これをやらないと中身が切れる）
                p.resizeCanvas(targetW, targetH);

                // 2. DOM要素の取得
                const actualCanvas = document.getElementById('defaultCanvas0');
                const container = document.getElementById('pixel-app-container');
                const wrapper = document.querySelector('.px-canvas-wrap');

                if (actualCanvas) {
                    // CSSでの表示サイズを強制。これで「32pxの檻」を壊す
                    actualCanvas.style.setProperty('width', targetW + 'px', 'important');
                    actualCanvas.style.setProperty('height', targetH + 'px', 'important');
                    actualCanvas.style.imageRendering = 'pixelated';

                    // 🌟親要素のサイズもCanvasに合わせる（これでスクロールバーが出る）
                    if (container) {
                        container.style.width = targetW + 'px';
                        container.style.height = targetH + 'px';
                    }
                    
                    if (wrapper) {
                        wrapper.style.overflow = 'auto'; 
                    }
                }

                // --- 6. UI更新と再描画 ---
                if (typeof updatePalette === 'function') updatePalette();
                if (typeof updatePresetUnderline === 'function') updatePresetUnderline();
                
                if (typeof renderPxPalette === 'function') {
                    let palette = [];
                    if (currentMethod === 'preset') {
                        const masterNodes = document.querySelectorAll(`#px-preset-table input[data-rgb]`);
                        masterNodes.forEach(input => {
                            const rgbStr = input.dataset.rgb;
                            if (usedPresetColors.has(rgbStr)) {
                                const rgb = rgbStr.split(',').map(Number);
                                palette.push(toHexStr(rgb[0], rgb[1], rgb[2]));
                            }
                        });
                    } else {
                        palette = getHexPaletteFromCanvas(window.virtualCanvas);
                    }
                    renderPxPalette(palette, window.selectedHex || "", swapMap || {});
                }

                // 🌟 Canvasサイズを計算して適用
                const target = window.virtualCanvas || (typeof virtualCanvas !== 'undefined' ? virtualCanvas : null);
                if (target && typeof p !== 'undefined') {
                    const zoom = parseFloat(document.getElementById('px-zoom').value) || 1;
                    const baseGrid = window.gridSize || 10;
                    const currentStep = baseGrid * zoom;
                    p.resizeCanvas(target.width * currentStep, target.height * currentStep);
                }

                p.redraw();
                console.log(`更新完了。解像度: ${targetW}x${targetH}, Zoom: ${zoomVal}`);
            };
        }, container);



        // 補助：プリセット近似処理の分離
        function applyPresetQuantize(buf, cols, rows) {
            // 1. アクティブなパレットを数値配列に変換
            const palette = Array.from(activeMasterColors).map(s => s.split(',').map(Number));
            
            // パレットが空なら何もしない（ここが重要）
            if (palette.length === 0) {
                console.warn("パレットが選択されていません");
                return;
            }

            for (let i = 0; i < buf.length; i += 4) {
                if (buf[i+3] < 10) continue; // 透明ピクセル無視

                let minD = Infinity;
                let closest = [palette[0][0], palette[0][1], palette[0][2]];

                for (const p of palette) {
                    // Lab色空間が理想ですが、まずは単純なRGB距離で
                    const d = Math.pow(buf[i] - p[0], 2) + 
                            Math.pow(buf[i+1] - p[1], 2) + 
                            Math.pow(buf[i+2] - p[2], 2);
                    if (d < minD) {
                        minD = d;
                        closest = p;
                    }
                }
                buf[i] = closest[0];
                buf[i+1] = closest[1];
                buf[i+2] = closest[2];
            }
        }

        // 補助：標準的な減色・ディザリング処理
        function applyStandardQuantize(buf, w, h, step, dither) {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = (y * w + x) * 4;
                    const oldR = buf[i], oldG = buf[i+1], oldB = buf[i+2];

                    // 1. 量子化 (単純な階調削減)
                    const newR = Math.round(oldR / step) * step;
                    const newG = Math.round(oldG / step) * step;
                    const newB = Math.round(oldB / step) * step;

                    buf[i] = newR; buf[i+1] = newG; buf[i+2] = newB;

                    // 2. 誤差拡散 (Floyd-Steinberg法)
                    if (dither) {
                        const errR = oldR - newR, errG = oldG - newG, errB = oldB - newB;
                        const distribute = (nx, ny, weight) => {
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                const ni = (ny * w + nx) * 4;
                                buf[ni] += errR * weight;
                                buf[ni+1] += errG * weight;
                                buf[ni+2] += errB * weight;
                            }
                        };
                        distribute(x + 1, y,     7 / 16);
                        distribute(x - 1, y + 1, 3 / 16);
                        distribute(x,     y + 1, 5 / 16);
                        distribute(x + 1, y + 1, 1 / 16);
                    }
                }
            }
        }

    function applyPresetToBuffer(buf, cols, rows) {
        const masterNodes = document.querySelectorAll(`#px-preset-table input[data-rgb]`);
        const masterPalettes = Array.from(masterNodes).map(input => input.dataset.rgb.split(',').map(Number));
        if (masterPalettes.length === 0) return;

        for (let i = 0; i < buf.length; i += 4) {
            if (buf[i + 3] < 10) continue; // 透明ドット

            const r = buf[i], g = buf[i+1], b = buf[i+2];
            let minD = Infinity;
            let closest = masterPalettes[0];

            for (const m of masterPalettes) {
                // 色の距離計算
                const d = Math.pow(r - m[0], 2) + Math.pow(g - m[1], 2) + Math.pow(b - m[2], 2);
                if (d < minD) {
                    minD = d;
                    closest = m;
                }
            }
            // バッファの値をマスターの色に強制書き換え
            buf[i]   = closest[0];
            buf[i+1] = closest[1];
            buf[i+2] = closest[2];
        }
    }

        // スライダ↔数値入力連動
        const syncNum = (rangeId, numId) => {
            const range = document.getElementById(rangeId);
            const num = document.getElementById(numId);

            // 数値の同期は「動かしている最中」に行う（リアルタイム反映）
            range.oninput = () => { num.value = range.value; };
            num.oninput   = () => { range.value = num.value; };

            // 実際の重い計算（pxUpdate）は「操作が終わった時」だけ行う
            range.onchange = () => { pxUpdate(); };
            num.onchange   = () => { pxUpdate(); };
        };

        // --- データ更新が必要（pxUpdate） ---
        syncNum('px-grid',   'px-grid-num');
        syncNum('px-color',  'px-color-num');
        syncNum('px-maxcol', 'px-maxcol-num');
        document.getElementById('px-quant').onchange = pxUpdate;
        document.getElementById('px-quant-method').onchange = pxUpdate;
        document.getElementById('px-dither').onchange = pxUpdate;
        document.getElementById('px-maxcol-on').onchange = pxUpdate;
        document.getElementById('px-raw').onchange = pxUpdate;

        // --- 見た目だけ更新（redraw） ---
        // 背景色やグリッド線の色は「仮想キャンバス」の中身を書き換えないので、描画だけでOK
        document.getElementById('px-bg').oninput = () => { 
            bgColor = document.getElementById('px-bg').value; 
            pixelApp.redraw(); 
        };
        document.getElementById('px-gridline').onchange = () => { 
            gridLine = document.getElementById('px-gridline').checked; 
            pixelApp.redraw(); 
        };
        document.getElementById('px-gridline-color').oninput = () => { 
            gridLineColor = document.getElementById('px-gridline-color').value; 
            pixelApp.redraw(); 
        };
        document.getElementById('px-gridline-w').oninput = () => { 
            gridLineWeight = parseFloat(document.getElementById('px-gridline-w').value); 
            pixelApp.redraw(); 
        };
        document.getElementById('px-show-guide').onchange = (e) => {
            showGuide = e.target.checked;
            pixelApp.redraw(); 
        };
        
        // JS側でIDを指定して紐付け
        const fileInput = document.getElementById('px-file');
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                const url = URL.createObjectURL(e.target.files[0]);
                // pixelApp または p.setImage を呼び出す
                pixelApp.setImage(url); 
            }
        });
        
    }

        function getHexPaletteFromCanvas(vcv) {
            if (!vcv) return [];
            const colors = new Set();
            vcv.loadPixels();
            for (let i = 0; i < vcv.pixels.length; i += 4) {
                if (vcv.pixels[i+3] < 10) continue; // 透明
                const r = vcv.pixels[i];
                const g = vcv.pixels[i+1];
                const b = vcv.pixels[i+2];
                const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                colors.add(hex);
            }
            return Array.from(colors);
        }

        function exportToSpreadsheet() {
            if (!virtualCanvas) return;

            virtualCanvas.loadPixels();
            let csvContent = "";

            for (let y = 0; y < virtualCanvas.height; y++) {
                let row = [];
                for (let x = 0; x < virtualCanvas.width; x++) {
                    const i = (x + y * virtualCanvas.width) * 4;
                    const r = virtualCanvas.pixels[i];
                    const g = virtualCanvas.pixels[i+1];
                    const b = virtualCanvas.pixels[i+2];
                    const a = virtualCanvas.pixels[i+3];

                    if (a < 10) {
                        row.push(""); // 透明は空欄
                    } else {
                        row.push(toHexStr(r, g, b)); // #ffffff 形式
                    }
                }
                csvContent += row.join("\t") + "\n"; // タブ区切り（スプレッドシートに貼り付けやすい）
            }

            // クリップボードにコピー
            navigator.clipboard.writeText(csvContent).then(() => {
                alert("スプレッドシート用データをクリップボードにコピーしました！\nExcelやGoogleシートに貼り付けてください。");
            });
        }

        // 3Dレンダラーや外部ツールに渡すための「生データ」抽出
        function getVoxelData() {
            if (!virtualCanvas) return null;

            const data = [];
            virtualCanvas.loadPixels();

            for (let y = 0; y < virtualCanvas.height; y++) {
                for (let x = 0; x < virtualCanvas.width; x++) {
                    const i = (x + y * virtualCanvas.width) * 4;
                    const a = virtualCanvas.pixels[i+3];
                    if (a < 10) continue; // 透明は除外

                    const r = virtualCanvas.pixels[i];
                    const g = virtualCanvas.pixels[i+1];
                    const b = virtualCanvas.pixels[i+2];

                    data.push({
                        x: x,
                        y: y,
                        z: 0, // 将来的にはここに輝度などを入れて凹凸にする
                        color: toHexStr(r, g, b)
                    });
                }
            }
            return data; 
        }

    let pxSelected = new Set();

    // 設定をUIに反映して再描画
    function applySettings(gs, qs, mc, label) {
        document.getElementById('px-grid').value    = gs;
        document.getElementById('px-grid-num').value = gs;
        document.getElementById('px-color').value   = qs;
        document.getElementById('px-color-num').value = qs;
        document.getElementById('px-maxcol').value  = mc;
        document.getElementById('px-maxcol-num').value = mc;
        if (label) document.getElementById('px-preset-label').textContent = label;
        pxUpdate();
        // 選択をリセット（同じ項目を再選できるように）
        setTimeout(() => document.getElementById('px-preset').value = '', 0);
    }

    function applyPreset(val) {
        if (!val) return;
        const presets = {
            dot:    { gs:8,  qs:32,  mc:16,  label:'Pixel Size 8 / Steps 32 / Colors 16' },
            mosaic: { gs:20, qs:16,  mc:32,  label:'Pixel Size 20 / Steps 16 / Colors 32' },
            retro:  { gs:16, qs:8,   mc:8,   label:'Pixel Size 16 / Steps 8 / Colors 8' },
            fine:   { gs:4,  qs:64,  mc:64,  label:'Pixel Size 4 / Steps 64 / Colors 64' },
            mono:   { gs:8,  qs:128, mc:2,   label:'Pixel Size 8 / Steps 128 / Colors 2' },
        };
        if (val === 'auto') { autoDetect(); return; }
        const p = presets[val];
        if (p) applySettings(p.gs, p.qs, p.mc, p.label);
    }

    function autoDetect() {
        if (!pixelApp || !pixelApp.canvas) return;
        // sourceImgのピクセルをサンプリングして画像特徴を分析
        const src = pixelApp.getSourceImg ? pixelApp.getSourceImg() : null;
        if (!src) { applySettings(8, 32, 16, '画像未読み込み'); return; }

        const sample = document.createElement('canvas');
        const size = 64;
        sample.width = sample.height = size;
        const ctx = sample.getContext('2d');
        // p5イメージを一度canvasに描画してピクセル取得
        ctx.drawImage(pixelApp.canvas, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // 色数・輝度分散・コントラストを計測
        const colorSet = new Set();
        let lumSum = 0, lumSqSum = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] < 128) continue;
            const r = data[i] >> 4, g = data[i+1] >> 4, b = data[i+2] >> 4;
            colorSet.add((r << 8) | (g << 4) | b);
            const l = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
            lumSum += l; lumSqSum += l*l; n++;
        }
        const uniqueColors = colorSet.size;
        const contrast = n > 0 ? Math.sqrt(lumSqSum/n - (lumSum/n)**2) : 0;
        const imgW = src.width || 64;

        // 判定ロジック
        let gs, qs, mc, reason;
        // Pixel Size: 画像幅に応じて
        gs = imgW > 400 ? 12 : imgW > 200 ? 8 : 6;
        // 色数が少ない（イラスト・ロゴ系）
        if (uniqueColors < 80) {
            qs = 16; mc = Math.min(uniqueColors + 4, 24);
            reason = `イラスト系 (${uniqueColors}色) → Steps ${qs} / Colors ${mc}`;
        // 色数が多い（写真系）
        } else if (uniqueColors > 300) {
            qs = 48; mc = 32;
            reason = `写真系 (${uniqueColors}色) → Steps ${qs} / Colors ${mc}`;
        // 中間
        } else {
            qs = 32; mc = 16;
            reason = `標準 (${uniqueColors}色) → Steps ${qs} / Colors ${mc}`;
        }
        // コントラストが高い場合はStepsを粗くしてもきれい
        if (contrast > 80 && qs > 16) { qs = Math.max(16, qs - 16); reason += ' +高コントラスト'; }

        applySettings(gs, qs, mc, `自動: Pixel ${gs} / Steps ${qs} / Colors ${mc} [${reason}]`);
    }
 // チェック選択中の色

    // ---- クロップ矩形（HTML要素方式）----
    function showCropRect() {
        const cv = pixelApp.canvas;
        const rect = document.getElementById('crop-rect');
        // キャンバスの中央に初期サイズで表示
        const w = Math.round(cv.offsetWidth * 0.6);
        const h = Math.round(cv.offsetHeight * 0.6);
        const x = Math.round((cv.offsetWidth - w) / 2);
        const y = Math.round((cv.offsetHeight - h) / 2);
        rect.style.left   = x + 'px';
        rect.style.top    = y + 'px';
        rect.style.width  = w + 'px';
        rect.style.height = h + 'px';
        rect.style.display = 'block';
    }

    function hideCropRect() {
        document.getElementById('crop-rect').style.display = 'none';
    }

    (function initCropRect() {
        const rect = document.getElementById('crop-rect');
        let mode = null; // 'move' | 'tl'|'tr'|'bl'|'br'
        let startX, startY, startL, startT, startW, startH;
        const MIN = 20;

        function getCV() { return pixelApp ? pixelApp.canvas : null; }

        function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

        function onStart(e) {
            e.stopPropagation();
            const t = e.touches ? e.touches[0] : e;
            startX = t.clientX; startY = t.clientY;
            startL = parseInt(rect.style.left)  || 0;
            startT = parseInt(rect.style.top)   || 0;
            startW = parseInt(rect.style.width) || 100;
            startH = parseInt(rect.style.height)|| 100;
            mode = e.target.dataset.h || 'move';
            e.preventDefault();
        }

        function onMove(e) {
            if (!mode) return;
            e.preventDefault();
            const t = e.touches ? e.touches[0] : e;
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            const cv = getCV();
            const maxW = cv ? cv.offsetWidth  : 9999;
            const maxH = cv ? cv.offsetHeight : 9999;
            let l=startL, top=startT, w=startW, h=startH;

            if (mode==='move') {
                l = clamp(startL+dx, 0, maxW-w);
                top = clamp(startT+dy, 0, maxH-h);
            } else {
                if (mode==='br'||mode==='tr') w = clamp(startW+dx, MIN, maxW-l);
                if (mode==='bl'||mode==='tl') { w = clamp(startW-dx, MIN, startL+startW); l = startL+startW-w; }
                if (mode==='br'||mode==='bl') h = clamp(startH+dy, MIN, maxH-top);
                if (mode==='tr'||mode==='tl') { h = clamp(startH-dy, MIN, startT+startH); top = startT+startH-h; }
            }
            rect.style.left=l+'px'; rect.style.top=top+'px';
            rect.style.width=w+'px'; rect.style.height=h+'px';
        }

        function onEnd() { mode = null; }

        rect.addEventListener('mousedown',  onStart);
        rect.addEventListener('touchstart', onStart, {passive:false});
        document.addEventListener('mousemove',  onMove);
        document.addEventListener('touchmove',  onMove, {passive:false});
        document.addEventListener('mouseup',    onEnd);
        document.addEventListener('touchend',   onEnd);
    })();

    function openPaintBar() {
        document.getElementById('px-paint-bar').style.display='flex';
        document.getElementById('px-paint-open').style.display='none';
    }

    function startPaintMode(mode) {
        window.currentPaintMode = mode;
        document.getElementById('px-paint-confirm').style.display = 'inline-block';
        // ガイド（十字）を一時的に消すと塗りやすいかもしれません
    }

    // JS側の confirmPaint を修正
    function confirmPaint() {
        if (!pixelApp) return;
        const color = document.getElementById('px-paint-color').value;

        if (window.currentPaintMode === 'rect') {
            // 矩形選択モードなら、crop-rectの範囲を塗る
            const cr = document.getElementById('crop-rect');
            const cv = pixelApp.canvas;
            
            // Canvas上の座標をドット座標に変換
            const zoom = parseFloat(document.getElementById('px-zoom').value) || 1;
            const currentStep = (window.gridSize || 10) * zoom;

            const rx = Math.floor(parseInt(cr.style.left) / currentStep);
            const ry = Math.floor(parseInt(cr.style.top) / currentStep);
            const rw = Math.floor(parseInt(cr.style.width) / currentStep);
            const rh = Math.floor(parseInt(cr.style.height) / currentStep);

            pixelApp.applyRectPaint(rx, ry, rw, rh, color);
        } else {
            // セル選択モードはクリック時に随時塗られているはず
        }

        hideCropRect();
        document.getElementById('px-paint-confirm').style.display = 'none';
        window.currentPaintMode = null;
    }

    function stopPaintMode() {
        if (pixelApp) pixelApp.stopPaint();
        hideCropRect();
        document.getElementById('px-paint-bar').style.display='none';
        document.getElementById('px-paint-open').style.display='inline-block';
        document.getElementById('px-paint-confirm').style.display='none';
        document.getElementById('px-cell-btn').style.background='#555';
        document.getElementById('px-rect-btn').style.background='#555';
    }

    function startCropUI() {
        if (!pixelApp || !pixelApp.canvas) return;
        showCropRect();
        document.getElementById('px-crop-confirm').style.display='inline-block';
    }

    function confirmCropUI() {
        if (pixelApp) pixelApp.cropConfirm();
    }

    function resetCropUI() {
        if (pixelApp) pixelApp.cropReset();
    }

    function renderPxPalette(palette, selectedHex, swapMap) {
        const div = document.getElementById('px-palette');
        if (!div) return;

        // 1. 使用色数の表示を復活
        div.innerHTML = `<div style="grid-column:1/-1;font-size:11px;color:#aaa;margin-bottom:4px;">使用色数: <b style="color:#00ffcc;">${palette.length}</b></div>`;

        palette.forEach((hv, i) => {
            const sw = swapMap[hv], disp = sw || hv;
            
            // --- 安全に番号(location)を取得する ---
            let loc = "";
            try {
                // マスターパレットのUIから直接探す（失敗しても無視して次へ進む）
                const targetRgb = hexToRgbStr(disp); // 下の補助関数を使用
                const masterItem = document.querySelector(`#px-preset-table input[data-rgb="${targetRgb}"]`);
                if (masterItem) loc = masterItem.dataset.location || "";
            } catch (e) { 
                // 番号取得でエラーが起きても、パレット表示自体は止めない
            }

            const chip = document.createElement('div');
            chip.className = 'px-chip' + (selectedHex === hv ? ' active' : '');
            chip.style.position = 'relative';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = pxSelected.has(hv);
            cb.onchange = () => {
                if (cb.checked) pxSelected.add(hv); else pxSelected.delete(hv);
                updateBulkBar();
            };
            chip.appendChild(cb);

            const inner = document.createElement('div');
            inner.innerHTML = `
                <div class="px-box" style="background:${disp}"></div>
                ${loc ? `<div style="position:absolute; top:1px; right:3px; font-size:8px; color:#00ffcc; font-weight:bold; text-shadow:1px 1px #000; pointer-events:none;">${loc}</div>` : ''}
                <b>#${i}</b><br>
                <input type="color" value="${disp}">
                ${sw ? `<br><button class="px-reset" data-h="${hv}">↩</button>` : ''}
            `;

            // クリックイベント（pixelAppが未定義でも壊れないようにガード）
            inner.querySelector('.px-box').onclick = () => {
                window.isAllNumbersMode = false; // 🌟 ここで全表示を解除
                // 1. window.selectedHex のトグル（オンオフ）
                if (window.selectedHex === hv) {
                    window.selectedHex = null; // すでに選択中なら解除
                } else {
                    window.selectedHex = hv;  // 新しく選択
                }

                // 2. p5inst に再描画を命令（これでハイライトや減光が走る）
                if (window.p5inst) {
                    window.p5inst.redraw();
                }

                // 3. パレット自体の見た目（activeクラスなど）を更新するために再描画
                // ※ renderPxPalette 自体を現在の状態でもう一度呼ぶか、
                // 全体を更新する pxUpdate() を実行してください。
                if (typeof pxUpdate === 'function') {
                    pxUpdate(); 
                }
            };
            inner.querySelector('input[type="color"]').oninput = e => { if(window.pixelApp) pixelApp.swap(hv, e.target.value); };
            
            const rb = inner.querySelector('.px-reset');
            if (rb) rb.onclick = e => { e.stopPropagation(); if(window.pixelApp) pixelApp.resetSwap(hv); };

            chip.appendChild(inner);
            div.appendChild(chip);
        });
    }

    // 補助関数：Hex(#ffffff) を "255,255,255" 形式に変換する（pを使わない）
    function hexToRgbStr(hex) {
        if (!hex || hex[0] !== '#') return "";
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r},${g},${b}`;
    }

    function updateBulkBar() {
        document.getElementById('px-sel-count').textContent = pxSelected.size;
        document.getElementById('px-bulk').style.display = pxSelected.size > 0 ? 'flex' : 'none';
    }

    function applyBulkSwap() {
        const color = document.getElementById('px-bulk-color').value;
        pxSelected.forEach(hv => pixelApp.swap(hv, color));
    }

    function resetBulkSwap() {
        pxSelected.forEach(hv => pixelApp.resetSwap(hv));
    }

    function clearSelection() {
        pxSelected.clear();
        updateBulkBar();
        document.querySelectorAll('#px-palette .px-chip input[type="checkbox"]').forEach(cb => cb.checked = false);
    }

    // 元画像 / 加工中 切り替え
    let currentImgView = 'current'; // 'original' | 'current'

    function switchImgView(view) {
        currentImgView = view;
        const btnOrig = document.getElementById('px-view-original');
        const btnCurr = document.getElementById('px-view-current');
        if (view === 'original') {
            btnOrig.style.background = '#007aff';
            btnCurr.style.background = '#555';
            if (pixelApp) pixelApp.viewOriginal();
        } else {
            btnOrig.style.background = '#555';
            btnCurr.style.background = '#007aff';
            // 加工中に戻す（cropReset相当だがswapMapは維持）
            if (pixelApp) { pixelApp.cropReset(); }
        }
    }

    function openCurrentInNewTab() {
        if (!pixelApp) return;
        const dataUrl = pixelApp.getCanvasDataURL();
        if (!dataUrl) return;
        // ObjectURLに変換して新規タブで開く
        fetch(dataUrl)
            .then(r => r.blob())
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const win = window.open(url, '_blank');
                // タブが開いたら少し後にURLを解放
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            });
    }


    function sendToPreview() {
        const voxelData = getVoxelData(); // 先ほど作った関数でデータを抽出
        if (!voxelData) return;

        // プレビューウィンドウとの通信チャンネル
        const bc = new BroadcastChannel('pixel_data_channel');

        // データを送信
        // 画像を送るより圧倒的に軽量で、受け取り側（Three.js）で即座にループ回せます
        bc.postMessage({
            type: 'VOXEL_UPDATE',
            width: virtualCanvas.width,
            height: virtualCanvas.height,
            data: voxelData,
            timestamp: Date.now()
        });

        console.log("3Dプレビューへデータを送信しました:", voxelData.length, "個のボクセル");
        
        // チャンネルを閉じる（メモリリーク防止）
        // ※ 頻繁に送る場合は、チャンネルをグローバル変数にして使い回すのがベストです
        setTimeout(() => bc.close(), 100); 
    }


    // 以下20260406追加

    // UIの生成
    function initMasterPresetTable() {
        const container = document.getElementById('px-preset-table');
        container.innerHTML = '';
        activeMasterColors.clear();

        // ★ Object.entriesを使って、groupNameと一緒にインデックス(groupIdx)を取得
        Object.entries(gameMasterPalette).forEach(([groupName, colors], groupIdx) => {
            const groupDiv = document.createElement('div');
            groupDiv.style.marginBottom = '6px';

            // 親（グループ）ヘッダー
            const header = document.createElement('label');
            // ... (スタイル設定はそのまま) ...
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.background = '#2a2a2a';
            header.style.padding = '2px 4px';
            header.style.fontSize = '11px';
            header.style.cursor = 'pointer';

            const groupCb = document.createElement('input');
            groupCb.type = 'checkbox';
            groupCb.checked = true;

            header.appendChild(groupCb);
            header.appendChild(document.createTextNode(` ${groupName}`));
            groupDiv.appendChild(header);

            // 子（各色）のコンテナ
            const childGrid = document.createElement('div');
            childGrid.style.display = 'grid';
            childGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            childGrid.style.gap = '3px';
            childGrid.style.padding = '3px 0 3px 12px';

            // ★ 第2引数で childIdx を取得
            colors.forEach((rgb, childIdx) => {
                const rgbKey = rgb.join(',');
                activeMasterColors.add(rgbKey);

                const item = document.createElement('label');
                if (!rgb || rgb.length === 0) {
                    item.style.display = 'none';
                } else {
                    item.style.display = 'flex';
                }
                item.style.alignItems = 'center';
                item.style.fontSize = '10px';
                item.style.cursor = 'pointer';
                item.style.position = 'relative'; // ★ 番号表示の基準用

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.dataset.rgb = rgbKey;
                // ★ ここで「親番号-子番号」を保存しておく
                cb.dataset.location = `${groupIdx}-${childIdx}`;

                const chip = document.createElement('div');
                // ... (チップのスタイル設定) ...
                chip.style.width = '12px';
                chip.style.height = '12px';
                chip.style.background = `rgb(${rgbKey})`;
                chip.style.margin = '0 4px';
                chip.style.border = '1px solid #555';

                item.appendChild(cb);
                item.appendChild(chip);
                item.appendChild(document.createTextNode(rgbKey));
                childGrid.appendChild(item);

                cb.onchange = () => {
                    if (cb.checked) activeMasterColors.add(rgbKey);
                    else activeMasterColors.delete(rgbKey);
                    pxUpdate();
                };
            });

            groupCb.onchange = () => {
                const childCbs = childGrid.querySelectorAll('input');
                childCbs.forEach(ccb => {
                    ccb.checked = groupCb.checked;
                    if (groupCb.checked) activeMasterColors.add(ccb.dataset.rgb);
                    else activeMasterColors.delete(ccb.dataset.rgb);
                });
                pxUpdate();
            };

            groupDiv.appendChild(childGrid);
            container.appendChild(groupDiv);
        }); // ★ for...in から Object.entries.forEach に変更
    }

    // 初期化実行
    initMasterPresetTable();

    // --- HTML要素とJS変数の同期設定 ---
    const setupBridge = () => {
        const sync = (id, windowKey, event = 'input') => {
            const el = document.getElementById(id);
            if (!el) return;

            // 初期値をwindowにセット
            window[windowKey] = (el.type === 'checkbox') ? el.checked : el.value;

            // 変更時にwindow値を更新して再計算
            el.addEventListener(event, () => {
                window[windowKey] = (el.type === 'checkbox') ? el.checked : el.value;
                
                // 数値入力やレンジの場合は数値化
                if (el.type === 'range' || el.type === 'number') {
                    window[windowKey] = parseFloat(el.value);
                }

                console.log(`UI変更: ${windowKey} = ${window[windowKey]}`);
                if (typeof pxUpdate === 'function') pxUpdate();
            });
        };

        document.getElementById('px-zoom').addEventListener('input', (e) => {
            document.getElementById('px-zoom-val').innerText = Math.round(e.target.value * 100) + "%";
            pxUpdate(); // または p.redraw()
        });

        // HTMLの各IDと、JS側で使っている変数名を紐付け
        sync('px-grid', 'gridSize');            // Pixel Size
        sync('px-grid-num', 'gridSize');        // Pixel Size (数字入力)
        sync('px-color', 'quantizeStep');       // 減色ステップ
        sync('px-color-num', 'quantizeStep');   // 減色ステップ (数字入力)
        sync('px-quant', 'useQuant', 'change'); // 減色チェック
        sync('px-quant-method', 'quantMethod', 'change'); // 減色手法
        sync('px-dither', 'useDither', 'change'); // ディザリング
        sync('px-raw', 'rawMode', 'change');    // Rawモード
    };

    // 実行
    setupBridge();

    // 「選択色のみで減色実行」ボタンの有効化
    const applyBtn = document.getElementById('btn-apply-preset');
    if (applyBtn) {
        applyBtn.onclick = () => {
            window.quantMethod = 'preset';
            const methodSelect = document.getElementById('px-quant-method');
            if (methodSelect) methodSelect.value = 'preset';
            pxUpdate();
        };
    }

    // 減色の実行ボタン
    document.getElementById('btn-apply-preset').onclick = () => {
        if (activeMasterColors.size === 0) return alert("色を選択してください");
        if (!pixelApp) return;

        // 1. 設定値を変更
        const methodSelect = document.getElementById('px-quant-method');
        methodSelect.value = 'preset';
        document.getElementById('px-quant').checked = true;

        // 2. システム側に更新を通知
        // ここで内部的に p.redraw() が呼ばれていない場合、画面が変わりません
        if (typeof pxUpdate === 'function') {
            pxUpdate(); 
        }

        // 3. 強制的に p5 の draw を一回実行させる（これが重要！）
        pixelApp.redraw(); 
        
        // 4. パレット表示の更新
        if (typeof updatePalette === 'function') {
            // 少し遅らせて実行すると、描画完了後の色が確実に取得できます
            setTimeout(updatePalette, 50);
        }
    };

    function updatePresetUnderline() {
        // 1. px-preset-table 内の全ラベル（色の行）を取得
        const container = document.getElementById('px-preset-table');
        if (!container) return;
        const items = container.querySelectorAll('label');

        items.forEach(item => {
            const cb = item.querySelector('input[type="checkbox"]');
            if (!cb || !cb.dataset.rgb) return;

            const rgbKey = cb.dataset.rgb;
            const chip = item.querySelector('div'); // 色チップ（四角い部分）

            // 2. usedPresetColors に含まれているか判定
            const isUsed = (typeof usedPresetColors !== 'undefined') && usedPresetColors.has(rgbKey);

            if (isUsed) {
                // 使われている場合：下線を太くして、不透明度をMAXに
                item.style.borderBottom = '2px solid #00ffcc'; 
                item.style.opacity = '1.0';
                if (chip) chip.style.boxShadow = '0 0 4px #00ffcc';
            } else {
                // 使われていない場合：下線を消して、少し薄くする
                item.style.borderBottom = '2px solid transparent';
                item.style.opacity = '0.5';
                if (chip) chip.style.boxShadow = 'none';
            }
        });
    }

    function updateUsedColorsUI() {
        const container = document.getElementById('px-used-colors'); // 👈 HTMLにこのIDがあるか確認
        if (!container || !window.virtualCanvas) return;

        container.innerHTML = '';
        const usedColors = new Set();
        
        window.virtualCanvas.loadPixels();
        for (let i = 0; i < window.virtualCanvas.pixels.length; i += 4) {
            const r = window.virtualCanvas.pixels[i];
            const g = window.virtualCanvas.pixels[i+1];
            const b = window.virtualCanvas.pixels[i+2];
            const a = window.virtualCanvas.pixels[i+3];
            
            if (a > 10) { // 透明以外
                usedColors.add(`${r},${g},${b}`);
            }
        }

        // 集計した色をチップとして並べる
        usedColors.forEach(rgbKey => {
            const item = document.createElement('div');
            item.className = 'color-chip-item'; // CSSで調整用
            item.style.display = 'inline-flex';
            item.style.alignItems = 'center';
            item.style.margin = '2px';

            const chip = document.createElement('div');
            chip.style.width = '15px';
            chip.style.height = '15px';
            chip.style.background = `rgb(${rgbKey})`;
            chip.style.border = '1px solid #888';

            item.appendChild(chip);
            container.appendChild(item);
        });
    }

    window.isAllNumbersMode = false;
    // HTMLの読み込みが終わったらパレットUIを作る
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof initMasterPresetTable === 'function') {
            initMasterPresetTable();
        }
        
        const showAllBtn = document.getElementById('px-btn-show-numbers');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => {
                // モードをオンにする（トグルにしたい場合は !window.isAllNumbersMode）
                window.isAllNumbersMode = true;
                // 番号表示を優先するため、選択色ハイライトは一旦解除する
                window.selectedHex = null; 
                
                if (window.p5inst) window.p5inst.redraw();
                console.log("全色番号表示モード: ON");
            });
        }
        
    });

