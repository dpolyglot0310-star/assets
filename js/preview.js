let baseImg = new Image();
let itemImg = new Image();
let itemX = 0, itemY = 0;
let canvas, ctx;

window.onload = async () => {
    canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // 1. ベース選択肢の初期化
    await initBaseSelector(); 

    // 2. 通信設定 (BroadcastChannel)
    const bc = new BroadcastChannel('3d_sync_channel');
    bc.onmessage = (e) => {
        if (e.data.type === 'UPDATE_ITEM') {
            const url = URL.createObjectURL(e.data.blob);
            itemImg.src = url;
            itemImg.onload = () => draw();
        }
    };

    // 3. UI設定
    initUI();

    // 4. 3D設定 (Three.jsがある場合)
    if (typeof init3D === 'function') init3D();
};

async function initBaseSelector() {
    const select = document.getElementById('base-selector');
    if (!select) return;

    try {
        const response = await fetch('./list.json');
        const data = await response.json();

        // オブジェクト配列でも文字列配列でも対応できるようにガード
        const baseFiles = data.filter(item => {
            const path = typeof item === 'string' ? item : (item.path || "");
            return path.includes('assets/999_base/') && /\.(png|jpe?g)$/i.test(path);
        }).map(item => typeof item === 'string' ? item : item.path);

        baseFiles.forEach(path => {
            const fileName = path.split('/').pop();
            const option = document.createElement('option');
            option.value = path;
            option.textContent = fileName;
            select.appendChild(option);
        });

        if (baseFiles.length > 0) {
            baseImg.src = baseFiles[0];
            baseImg.onload = () => draw();
        }

        select.onchange = (e) => {
            baseImg.src = e.target.value;
            baseImg.onload = () => draw();
        };
    } catch (err) {
        console.error("ベースリストの取得に失敗しました:", err);
    }
}

function initUI() {
    const sliderX = document.getElementById('posX');
    const sliderY = document.getElementById('posY');
    if (sliderX) sliderX.oninput = (e) => { itemX = parseInt(e.target.value); draw(); };
    if (sliderY) sliderY.oninput = (e) => { itemY = parseInt(e.target.value); draw(); };
}

/**
 * 【統合】現在の配置をベース画像に焼き付ける
 */
window.mergeToLayer = function() {
    if (!confirm("現在の配置をベース画像に統合しますか？")) return;

    // キャンバスの内容を新しいベース画像として差し替える
    const mergedData = canvas.toDataURL("image/png");
    
    baseImg = new Image(); // 参照を新しくする
    baseImg.onload = () => {
        // 統合されたので、載せていたアイテム画像は空にする
        itemImg = new Image(); 
        draw();
        
        // ★重要：3Dテクスチャもこのタイミングで「更新が必要」と伝える
        if (typeof updateThreeTexture === 'function') updateThreeTexture();
    };
    baseImg.src = mergedData;
    
    alert("ベースに統合しました。エディタからの次の送信を待機します。");
};

/**
 * 【保存】現在のキャンバスをPNGとして書き出し
 */
window.downloadResult = function() {
    const link = document.createElement('a');
    link.download = `merged_texture_${Date.now()}.png`; // 重複防止に時間を付与
    link.href = canvas.toDataURL("image/png");
    link.click();
};

/**
 * 【外部読み込み】手持ちの画像をベースにする
 */
window.uploadBaseImage = function(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        baseImg = new Image();
        baseImg.onload = () => {
            draw();
            if (typeof updateThreeTexture === 'function') updateThreeTexture();
        };
        baseImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (baseImg.complete) ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
    if (itemImg.complete) ctx.drawImage(itemImg, itemX, itemY);
}