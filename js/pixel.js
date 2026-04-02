// ---- Pixel Indexer ----
    let pixelApp = null;
    let p5Loaded = false;

    function toHexStr(r, g, b) {
        return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,v|0)).toString(16).padStart(2,'0')).join('');
    }

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

    function _buildPixelApp() {
        const container = document.getElementById('pixel-app-container');
        pixelApp = new p5(function(p) {
            let sourceImg = null, rawImg = null, selectedHex = null, swapMap = {};
            let history = [], historyMax = 20;
            let gridSize = 10, quantizeStep = 32, useDither = true, useQuant = true, quantMethod = 'uniform', rawMode = false, bgColor = '#000000';
            let gridLine = false, gridLineColor = '#333333', gridLineWeight = 1;
            let maxColors = 256, useMaxColors = true;
            let paintMode = null; // 'cell' | 'rect' | null
            let paintPendingCells = new Set(); // セル選択モードで選択中のセル

            p.setup = () => {
                const w = container.parentElement.clientWidth || 640;
                p.createCanvas(w, 400);
                p.clear(); // 初期状態を透明にする
                p.noLoop();
                new ResizeObserver(() => {
                    const nw = container.parentElement.clientWidth;
                    if (nw > 0 && nw !== p.width) {
                        p.resizeCanvas(nw, p.height);
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
                    if (paintMode==='cell') { e.preventDefault(); handleCellPaint(getPos(e)); return; }
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

            p.draw = () => {
                p.clear();
                if (!rawImg && !sourceImg) { return; } // background(25)は消す
                if (!rawImg) { return; }


                const drawW=p.width, drawH=p.floor(drawW/(rawImg.width/rawImg.height));
                if (p.height!==drawH) { p.resizeCanvas(drawW,drawH); p.redraw(); return; }

                // 【1】まず背景を確認用の色で塗る
                // --- ここで背景色を塗りたい場合 ---
                // もし「エディタ上の見た目だけ」色をつけたいなら、
                // p.background ではなく、四角形を一番下に描きます。
                p.noStroke();
                p.fill(bgColor); // ここで作業用の背景色（マゼンタ等）を指定
                p.rect(0, 0, p.width, p.height);

                const cols=p.floor(drawW/gridSize), rows=p.floor(drawH/gridSize);
                const temp=rawImg.get(); temp.resize(cols,rows); temp.loadPixels();
                const buf=new Float32Array(temp.pixels.length);

                // 【2】元の透明度（Alpha）を維持したまま配列（buf）に格納
                for (let i=0; i<temp.pixels.length; i+=4) {
                    buf[i]   = temp.pixels[i];
                    buf[i+1] = temp.pixels[i+1];
                    buf[i+2] = temp.pixels[i+2];
                    buf[i+3] = temp.pixels[i+3]; // ★ここを255にせず、元のままにする
                }

                // --- 量子化処理（ここは以前と同じ） ---
                if (!rawMode && useQuant) {
                    if (quantMethod === 'kmeans') {
                        kmeansQuantize(buf, cols, rows, quantizeStep, useDither);
                    } else if (quantMethod === 'mediancut') {
                        medianCutQuantize(buf, cols, rows, quantizeStep, useDither);
                    } else {
                        const qs=quantizeStep, qt=v=>Math.max(0,Math.min(255,Math.round(v/qs)*qs));
                        if (useDither) {
                            for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
                                const i=(x+y*cols)*4;
                                const nr=qt(buf[i]),ng=qt(buf[i+1]),nb=qt(buf[i+2]);
                                const er=buf[i]-nr,eg=buf[i+1]-ng,eb=buf[i+2]-nb;
                                buf[i]=nr;buf[i+1]=ng;buf[i+2]=nb;
                                sp(buf,x+1,y,  cols,rows,er,eg,eb,7/16);
                                sp(buf,x-1,y+1,cols,rows,er,eg,eb,3/16);
                                sp(buf,x,  y+1,cols,rows,er,eg,eb,5/16);
                                sp(buf,x+1,y+1,cols,rows,er,eg,eb,1/16);
                            }
                        } else {
                            for (let i=0;i<buf.length;i+=4){buf[i]=qt(buf[i]);buf[i+1]=qt(buf[i+1]);buf[i+2]=qt(buf[i+2]);}
                        }
                    }
                }

                const quantColors = new Array(cols*rows);
                for (let j=0;j<cols*rows;j++) {
                    const i=j*4;
                    quantColors[j]=toHexStr(buf[i],buf[i+1],buf[i+2]);
                }

                const paletteSet=new Set();
                quantColors.forEach(h=>paletteSet.add(h));
                const sorted=Array.from(paletteSet).sort((a,b)=>lum(p,b)-lum(p,a));
                const limited = (rawMode || !useMaxColors) ? sorted : sorted.slice(0,maxColors);
                const remap={};
                if (!rawMode && useMaxColors && limited.length<sorted.length) {
                    sorted.forEach(h=>{
                        if(!limited.includes(h)){
                            let best=limited[0],bestD=Infinity;
                            const c=p.color(h),r=p.red(c),g=p.green(c),b=p.blue(c);
                            limited.forEach(lh=>{const lc=p.color(lh),d=(p.red(lc)-r)**2+(p.green(lc)-g)**2+(p.blue(lc)-b)**2;if(d<bestD){bestD=d;best=lh;}});
                            remap[h]=best;
                        }
                    });
                }

                const finalColors = quantColors.map(h => remap[h]||h);

                // 【3】描画（Alphaを考慮して1ピクセルずつ塗る）
                if (gridLine){p.stroke(gridLineColor);p.strokeWeight(gridLineWeight);}else{p.noStroke();}
                const finalPalette=new Set();

                for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
                    const idx = x+y*cols;
                    const i = idx*4;
                    const fc = finalColors[idx];
                    const dh = rawMode ? fc : (swapMap[fc]||fc);
                    const alpha = buf[i+3]; // ★Alphaを取得

                    if (alpha > 10) finalPalette.add(dh); // 透明部分はパレットに入れない

                    const dc = p.color(dh);
                    let r = p.red(dc), g = p.green(dc), b = p.blue(dc);
                    
                    // 非選択色は暗くする
                    if (selectedHex && dh !== selectedHex) { r*=0.2; g*=0.2; b*=0.2; }
                    
                    p.fill(r, g, b, alpha); // ★Alphaを乗せて描画
                    p.rect(x*gridSize, y*gridSize, gridSize, gridSize);
                }

                // --- インデックス表示以降（ここはそのまま） ---
                const finalSorted=Array.from(finalPalette).sort((a,b)=>lum(p,b)-lum(p,a));
                if (selectedHex&&gridSize>8) {
                    const si=finalSorted.indexOf(selectedHex);
                    p.textAlign(p.CENTER,p.CENTER); p.textSize(gridSize*.6);
                    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
                        const fc=finalColors[x+y*cols];
                        const dh=rawMode ? fc : (swapMap[fc]||fc);
                        if(dh===selectedHex){p.fill(lum(p,dh)>128?0:255);p.text(si,x*gridSize+gridSize/2,y*gridSize+gridSize/2);}
                    }
                }
                if (paintMode==='cell' && paintPendingCells.size>0) {
                    const cols2=p.floor(p.width/gridSize);
                    p.noStroke(); p.fill(255,255,0,120);
                    paintPendingCells.forEach(key=>{
                        const [cx,cy]=key.split(',').map(Number);
                        p.rect(cx*gridSize,cy*gridSize,gridSize,gridSize);
                    });
                }
                renderPxPalette(finalSorted,selectedHex,swapMap);
            };

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
                sourceImg=img; rawImg=img.get();
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
            });
            // 元画像/加工中の切り替え
            p.viewOriginal = () => { if (sourceImg) { rawImg=sourceImg.get(); p.redraw(); } };
            p.getCanvasDataURL = () => p.canvas ? p.canvas.toDataURL() : null;
            p.cropConfirm = () => {
                const cv = p.canvas;
                const cr = document.getElementById('crop-rect');
                const scaleX = sourceImg.width / cv.offsetWidth;
                const scaleY = sourceImg.height / cv.offsetHeight;
                const rx = Math.round((parseInt(cr.style.left)||0) * scaleX);
                const ry = Math.round((parseInt(cr.style.top) ||0) * scaleY);
                const rw = Math.round((parseInt(cr.style.width) ||100) * scaleX);
                const rh = Math.round((parseInt(cr.style.height)||100) * scaleY);
                if (rw<2||rh<2) return;
                p.pushHistory();
                rawImg = sourceImg.get(rx, ry, rw, rh);
                hideCropRect();
                document.getElementById('px-crop-confirm').style.display='none';
                document.getElementById('px-crop-reset').style.display='inline-block';
                p.redraw();
            };
            p.cropReset = () => {
                rawImg = sourceImg ? sourceImg.get() : null;
                hideCropRect();
                document.getElementById('px-crop-confirm').style.display='none';
                document.getElementById('px-crop-reset').style.display='none';
                p.redraw();
            };
            p.pxUpdate = (gs,qs,uq,qm,dt,rm,bg,gl,glc,glw,mc,umc) => {
                gridSize=gs; quantizeStep=qs; useQuant=uq; quantMethod=qm;
                useDither=dt; rawMode=rm; bgColor=bg;
                gridLine=gl; gridLineColor=glc; gridLineWeight=glw;
                maxColors=mc; useMaxColors=umc;
                p.redraw();
            };
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
        }, container);

        // コントロールのイベント
        function pxUpdate() {
            const gs  = parseInt(document.getElementById('px-grid').value);
            const qs  = parseInt(document.getElementById('px-color').value);
            const mc  = parseInt(document.getElementById('px-maxcol').value)||256;
            const uq  = document.getElementById('px-quant').checked;
            const qm  = document.getElementById('px-quant-method').value;
            const dt  = document.getElementById('px-dither').checked;
            const umc = document.getElementById('px-maxcol-on').checked;
            const rm  = document.getElementById('px-raw').checked;
            const bg  = document.getElementById('px-bg').value;
            const gl  = document.getElementById('px-gridline').checked;
            const glc = document.getElementById('px-gridline-color').value;
            const glw = parseInt(document.getElementById('px-gridline-w').value)||1;
            document.getElementById('px-grid-num').value=gs;
            document.getElementById('px-color-num').value=qs;
            document.getElementById('px-maxcol-num').value=mc;
            // Raw時はPixel Size以外を無効化、それ以外は独立制御
            const rawOn = rm;
            document.getElementById('px-quant').disabled = rawOn;
            document.getElementById('px-quant-method').disabled = rawOn || !uq;
            document.getElementById('px-color').disabled = rawOn || !uq;
            document.getElementById('px-color-num').disabled = rawOn || !uq;
            document.getElementById('px-dither').disabled = rawOn || !uq;
            document.getElementById('px-maxcol-on').disabled = rawOn;
            document.getElementById('px-maxcol').disabled = rawOn || !umc;
            document.getElementById('px-maxcol-num').disabled = rawOn || !umc;
            pixelApp.pxUpdate(gs,qs,uq,qm,dt,rm,bg,gl,glc,glw,mc,umc);
        };
        // スライダ↔数値入力連動
        const syncNum = (rangeId, numId) => {
            document.getElementById(rangeId).oninput = () => { document.getElementById(numId).value=document.getElementById(rangeId).value; pxUpdate(); };
            document.getElementById(numId).oninput  = () => { document.getElementById(rangeId).value=document.getElementById(numId).value;  pxUpdate(); };
        };
        syncNum('px-grid',   'px-grid-num');
        syncNum('px-color',  'px-color-num');
        syncNum('px-maxcol', 'px-maxcol-num');
        document.getElementById('px-quant').onchange=pxUpdate;
        document.getElementById('px-quant-method').onchange=pxUpdate;
        document.getElementById('px-dither').onchange=pxUpdate;
        document.getElementById('px-maxcol-on').onchange=pxUpdate;
        document.getElementById('px-raw').onchange=pxUpdate;
        document.getElementById('px-bg').oninput=pxUpdate;
        document.getElementById('px-gridline').onchange=pxUpdate;
        document.getElementById('px-gridline-color').oninput=pxUpdate;
        document.getElementById('px-gridline-w').oninput=pxUpdate;
        document.getElementById('px-zoom').oninput=()=>{
            const v=document.getElementById('px-zoom').value;
            document.getElementById('pixel-app-container').style.transform=`scale(${v})`;
            document.getElementById('px-zoom-val').innerText=Math.round(v*100)+'%';
        };
        document.getElementById('px-file').onchange=e=>{
            const r=new FileReader();
            r.onload=ev=>pixelApp.setImage(ev.target.result);
            r.readAsDataURL(e.target.files[0]);
        };
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
        if (!pixelApp) return;
        // 色変更前に減色・MaxColorsをオフ
        const uq=document.getElementById('px-quant');
        const umc=document.getElementById('px-maxcol-on');
        if (uq.checked||umc.checked) { uq.checked=false; umc.checked=false; pxUpdate(); }
        document.getElementById('px-cell-btn').style.background = mode==='cell' ? '#7b2fff' : '#555';
        document.getElementById('px-rect-btn').style.background = mode==='rect' ? '#7b2fff' : '#555';
        document.getElementById('px-paint-confirm').style.display = mode==='rect' ? 'inline-block' : 'none';
        if (mode==='rect') showCropRect();
        else hideCropRect();
        pixelApp.startPaint(mode);
    }

    function confirmPaint() {
        if (!pixelApp) return;
        const color = document.getElementById('px-paint-color').value;
        pixelApp.confirmPaint(color);
        hideCropRect();
        document.getElementById('px-paint-confirm').style.display='none';
        document.getElementById('px-cell-btn').style.background='#555';
        document.getElementById('px-rect-btn').style.background='#555';
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
        div.innerHTML = `<div style="grid-column:1/-1;font-size:11px;color:#aaa;margin-bottom:4px;">使用色数: <b style="color:#00ffcc;">${palette.length}</b></div>`;

        // パレットドロップダウンを更新
        const sel = document.getElementById('px-bulk-palette');
        sel.innerHTML = '<option value="">パレットから選択...</option>';
        palette.forEach((hv, i) => {
            const opt = document.createElement('option');
            opt.value = swapMap[hv] || hv;
            opt.style.background = swapMap[hv] || hv;
            opt.textContent = `#${i} ${swapMap[hv] || hv}`;
            sel.appendChild(opt);
        });
        // ドロップダウン選択でカラーピッカーに反映
        sel.onchange = () => { if (sel.value) document.getElementById('px-bulk-color').value = sel.value; };

        palette.forEach((hv, i) => {
            const sw = swapMap[hv], disp = sw || hv;
            const chip = document.createElement('div');
            chip.className = 'px-chip' + (selectedHex === hv ? ' active' : '');

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = pxSelected.has(hv);
            cb.onchange = () => {
                if (cb.checked) pxSelected.add(hv); else pxSelected.delete(hv);
                updateBulkBar();
            };
            chip.appendChild(cb);

            const inner = document.createElement('div');
            inner.innerHTML = `<div class="px-box" style="background:${disp}"></div><b>#${i}</b><br><input type="color" value="${disp}">${sw ? `<br><button class="px-reset" data-h="${hv}">↩</button>` : ''}`;
            inner.querySelector('.px-box').onclick = () => pixelApp.highlight(hv);
            inner.querySelector('input[type="color"]').oninput = e => pixelApp.swap(hv, e.target.value);
            const rb = inner.querySelector('.px-reset');
            if (rb) rb.onclick = e => { e.stopPropagation(); pixelApp.resetSwap(hv); };
            chip.appendChild(inner);
            div.appendChild(chip);
        });
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
    
    // pixel.js の末尾に追加 20260401 Gemini
    window.pxUpdate = function() {
        if (typeof redraw === 'function') {
            redraw();
        }
    };

    // pixel.js の適当な場所に追加
    window.sendToPreview = function() {
        const canvas = document.querySelector('canvas'); // p5.jsのキャンバスを取得
        if (!canvas) return;

        canvas.toBlob((blob) => {
            const bc = new BroadcastChannel('3d_sync_channel');
            bc.postMessage({ 
                type: 'UPDATE_ITEM', 
                blob: blob 
            });
            console.log("Preview sent!");
        }, 'image/png');
    };