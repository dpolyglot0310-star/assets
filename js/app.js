const USER = 'dpolyglot0310-star';
    const REPO = 'assets';
    const BASE_PATH = 'assets';
    const IGNORE_DIRS = ['backup', 'old', 'temp'];

    let currentMode = null;
    let assetData = [];
    let linkData = [];

    async function init() {
        await loadAssetList();
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab) switchMode(tab);
        // tab指定なし → 何も表示しない（タブボタンだけ表示）
    }

    function switchMode(mode) {
        if (currentMode === mode) return;
        currentMode = mode;
        ['assets','links','pixel'].forEach(m => {
            document.getElementById('mode-' + m).className = (m === mode ? 'active' : '');
        });
        document.getElementById('asset-tools').style.display = (mode === 'assets' ? 'flex' : 'none');
        document.getElementById('catalog-container').style.display = (mode === 'pixel' ? 'none' : 'block');
        document.getElementById('pixel-panel').classList.toggle('active', mode === 'pixel');
        document.querySelector('.controls').style.display = (mode === 'pixel' ? 'none' : 'flex');
        history.replaceState(null, '', '?tab=' + mode);
        if (mode === 'pixel') initPixel();
        else if (mode === 'assets') renderAssets(assetData);
        else loadLinkData().then(() => renderLinks(linkData));
    }

    function refreshView() {
        if (!currentMode) return;
        if (currentMode === 'assets') renderAssets(assetData);
        else if (currentMode === 'links') loadLinkData().then(() => renderLinks(linkData));
    }

    async function loadAssetList() {
        try {
            const res = await fetch(`./${BASE_PATH}/list.json?t=${Date.now()}`);
            if (res.ok) assetData = await res.json();
            document.getElementById('status').innerText = assetData.length + " items loaded.";
        } catch (e) { console.warn("list.json not found."); }
    }

    async function fetchDeepScan() {
        document.getElementById('status').innerText = "Scanning GitHub...";
        try {
            const repoData = await (await fetch(`https://api.github.com/repos/${USER}/${REPO}`)).json();
            const treeData = await (await fetch(`https://api.github.com/repos/${USER}/${REPO}/git/trees/${repoData.default_branch}?recursive=1`)).json();
            
            assetData = treeData.tree.filter(f => {
                const inBase = f.path.startsWith(BASE_PATH + '/');
                const isMatch = /\.(gif|jpe?g|png|webp|svg|mp4|webm|mov|md)$/i.test(f.path);
                const isIgnored = IGNORE_DIRS.some(d => f.path.includes(`/${d}/`));
                return inBase && isMatch && !isIgnored;
            });
            renderAssets(assetData);
            document.getElementById('save-btn').style.display = 'inline-block';
            document.getElementById('status').innerText = "Scan complete: " + assetData.length + " items.";
        } catch (e) { document.getElementById('status').innerText = "Scan error."; }
    }

    function renderAssets(items) {
        const container = document.getElementById('catalog-container');
        container.innerHTML = '';
        const groups = {};
        const mdMap = {};
        const pairedMdPaths = new Set(); // ペアになったMDを記録

        // 1. MDファイルのパスをマッピング
        items.forEach(f => { if (f.path.endsWith('.md')) mdMap[f.path.replace(/\.md$/i, '')] = f.path; });

        // 2. 画像・動画の処理
        items.forEach(f => {
            if (f.path.endsWith('.md')) return; // MDは後で単体処理
            const parts = f.path.split('/');
            const name = parts.pop();
            const folder = parts.join(' / ');
            const isHidden = parts.some(p => p.startsWith('.'));
            const key = isHidden ? `🙈 HIDDEN: ${folder}` : folder;
            const relatedMd = mdMap[f.path.substring(0, f.path.lastIndexOf('.'))];

            if (relatedMd) pairedMdPaths.add(relatedMd); // ペアとして使用済み

            if (!groups[key]) groups[key] = { items: [], isHidden };
            groups[key].items.push({...f, name, relatedMd, type: 'media'});
        });

        // 3. ペアにならなかった「単体MD」の処理
        items.forEach(f => {
            if (f.path.endsWith('.md') && !pairedMdPaths.has(f.path)) {
                const parts = f.path.split('/');
                const name = parts.pop();
                const folder = parts.join(' / ');
                const isHidden = parts.some(p => p.startsWith('.'));
                const key = isHidden ? `🙈 HIDDEN: ${folder}` : folder;

                if (!groups[key]) groups[key] = { items: [], isHidden };
                groups[key].items.push({...f, name, relatedMd: f.path, type: 'text'});
            }
        });

        // 描画
        Object.keys(groups).sort((a,b) => groups[a].isHidden - groups[b].isHidden).forEach(key => {
            const section = document.createElement('div');
            section.className = `folder-section ${groups[key].isHidden ? 'hidden-folder' : ''}`;
            section.innerHTML = `<div class="folder-title">${key}</div><div class="grid ${document.getElementById('viewSelect').value === 'list' ? 'list-view' : ''}"></div>`;
            const grid = section.querySelector('.grid');

            groups[key].items.forEach(f => {
                const url = `https://raw.githubusercontent.com/${USER}/${REPO}/main/${f.path}`;
                const isVideo = /\.(mp4|webm|mov)$/i.test(f.path);
                const isHeavy = (f.size || 0) > 1024 * 1024;
                const shouldHide = isHeavy || groups[key].isHidden;

                const card = document.createElement('div');
                card.className = 'card';
                card.dataset.name = f.name.toLowerCase();
                
                card.innerHTML = `
                    <div class="media-container" id="media-${f.sha}" onclick="window.open('${url}')">
                        ${f.type === 'text' ? `<div style="font-size:2.5rem;">📄</div>` : 
                          (shouldHide ? `<div class="placeholder"><span>${isHeavy ? 'Heavy' : 'Hidden'}</span><br><button onclick="event.stopPropagation(); loadMedia('${f.sha}','${url}',${isVideo})">表示</button></div>` : renderMedia(url, isVideo))
                        }
                    </div>
                    <div class="info">
                        <div class="name">${f.name}</div>
                        <div class="meta">${f.size ? (f.size/1024).toFixed(1) + ' KB' : 'Text Doc'}</div>
                        ${f.relatedMd ? `<div id="md-${f.sha}" class="md-preview">Loading content...</div>` : ''}
                    </div>
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        ${f.type === 'media' ? `<button class="action-btn" onclick="copyTo('${url}')">URLコピー</button>` : ''}
                        ${f.type === 'media' && !isVideo ? `<button class="action-btn" style="color:#00aaff;border-color:#00aaff;" onclick="sendToPixel('${url}')">→ Pixel</button>` : ''}
                        ${f.relatedMd ? `<button class="action-btn" id="btn-md-${f.sha}" onclick="copyMdText('${f.sha}')" style="display:none">内容をコピー</button>` : ''}
                    </div>
                `;
                grid.appendChild(card);
                if (f.relatedMd) fetchMdContent(`https://raw.githubusercontent.com/${USER}/${REPO}/main/${f.relatedMd}`, f.sha);
            });
            container.appendChild(section);
        });
    }

    async function fetchMdContent(url, sha) {
        try {
            const res = await fetch(url);
            let text = (await res.text()).replace(/---[\s\S]*?---/, '').trim();
            const preview = document.getElementById(`md-${sha}`);
            if (preview) {
                preview.innerText = text;
                preview.dataset.full = text;
                const btn = document.getElementById(`btn-md-${sha}`);
                if (btn) btn.style.display = 'block';
            }
        } catch (e) { console.warn("MD load error", url); }
    }

    function sendToPixel(url) {
        switchMode('pixel');
        // p5が初期化されるまで少し待ってからロード
        const tryLoad = () => {
            if (pixelApp && pixelApp.setImage) {
                pixelApp.setImage(url);
            } else {
                setTimeout(tryLoad, 100);
            }
        };
        tryLoad();
    }

    function copyMdText(sha) {
        const target = document.getElementById(`md-${sha}`);
        if (target && target.dataset.full) copyTo(target.dataset.full);
    }

    // --- CSV & Utility 関連（前回の修正を維持） ---
    async function loadLinkData() {
        try {
            const res = await fetch(`./${BASE_PATH}/links.csv?t=${Date.now()}`);
            if (!res.ok) return;
            const text = await res.text();
            linkData = text.split('\n').slice(1).filter(r => r.trim()).map(r => {
                const c = r.split(',').map(v => v.replace(/"/g, '').trim());
                return { cat: c[0] || 'Uncategorized', title: c[1] || 'No Title', url: c[2] || '#', thumb: c[3] || '', prompt: c[4] || '' };
            });
        } catch (e) { console.warn("CSV load error"); }
    }

    function renderLinks(links) {
        const container = document.getElementById('catalog-container');
        container.innerHTML = '';
        const groups = {};
        links.forEach(l => { if (!groups[l.cat]) groups[l.cat] = []; groups[l.cat].push(l); });
        Object.keys(groups).sort().forEach(cat => {
            const section = document.createElement('div');
            section.className = 'folder-section';
            section.innerHTML = `<div class="folder-title">${cat}</div><div class="grid ${document.getElementById('viewSelect').value === 'list' ? 'list-view' : ''}"></div>`;
            const grid = section.querySelector('.grid');
            groups[cat].forEach(l => {
                const card = document.createElement('div');
                card.className = 'card';
                card.dataset.name = (l.title + (l.prompt || '')).toLowerCase();
                card.innerHTML = `
                    <div class="media-container" onclick="window.open('${l.url}')">
                        ${l.thumb ? `<img src="${l.thumb}" loading="lazy">` : `<div style="font-size:2rem">🔗</div>`}
                    </div>
                    <div class="info">
                        <div class="name">${l.title}</div>
                        ${l.prompt ? `<div class="md-preview">${l.prompt}</div>` : `<div class="meta">${l.url}</div>`}
                    </div>
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <button class="action-btn" onclick="window.open('${l.url}')">開く</button>
                        <button class="action-btn" onclick="copyTo('${l.prompt || l.url}')">${l.prompt ? 'プロンプトコピー' : 'URLコピー'}</button>
                    </div>
                `;
                grid.appendChild(card);
            });
            container.appendChild(section);
        });
    }

    function renderMedia(url, isVideo) {
        return isVideo ? `<video src="${url}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>` : `<img src="${url}" loading="lazy">`;
    }

    function loadMedia(sha, url, isVideo) { 
        const target = document.getElementById(`media-${sha}`);
        if (target) target.innerHTML = renderMedia(url, isVideo); 
    }

    function loadAllMedia() { document.querySelectorAll('.placeholder button').forEach(b => b.click()); }

    function filterCards() {
        const q = document.getElementById('searchInput').value.toLowerCase();
        document.querySelectorAll('.card').forEach(c => c.style.display = c.dataset.name.includes(q) ? 'flex' : 'none');
        document.querySelectorAll('.folder-section').forEach(s => {
            const hasVisible = Array.from(s.querySelectorAll('.card')).some(c => c.style.display !== 'none');
            s.style.display = hasVisible ? 'block' : 'none';
        });
    }

    function copyTo(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            const t = document.getElementById('toast');
            t.style.opacity = '1';
            setTimeout(() => t.style.opacity = '0', 1500);
        });
    }

    function downloadJSON() {
        if (assetData.length === 0) return alert("データがありません");
        
        // 1. JSONのDL（今まで通り）
        const blobJson = new Blob([JSON.stringify(assetData, null, 2)], {type: 'application/json'});
        const aJson = document.createElement('a');
        aJson.href = URL.createObjectURL(blobJson);
        aJson.download = 'list.json';
        aJson.click();

        // 2. 更新時刻（txt）のDLを追加
        const now = new Date().toISOString(); // Actionsと同じISO形式
        const blobTxt = new Blob([now], {type: 'text/plain'});
        const aTxt = document.createElement('a');
        aTxt.href = URL.createObjectURL(blobTxt);
        aTxt.download = 'last_update.txt';
        aTxt.click();
    }


    init();

    fetch('assets/last_update.txt')
    .then(res => {
        if (!res.ok) throw new Error("File not found");
        return res.text();
    })
    .then(timeStr => {
        const trimmedTime = timeStr.trim(); // 改行コードなどを除去
        const date = new Date(trimmedTime);
        
        // 有効な日付かチェック
        if (isNaN(date.getTime())) {
        console.error("Invalid Date format:", trimmedTime);
        return;
        }

        document.getElementById('last-update').innerText = `最終更新: ${date.toLocaleString('ja-JP')}`;
    })
    .catch(err => console.log("Timestamp fetch error:", err));