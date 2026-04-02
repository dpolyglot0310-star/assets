/**
 * 3D Preview & Layering System
 * 構成: Base Layer (背景) + Item Layer (エディタからの画像)
 */

let baseImg = new Image();   // 確定済みの土台（assets/base/ から読み込み、または統合済み画像）
let itemImg = new Image();   // エディタから届いた最新のパーツ
let itemX = 0;               // パーツの表示座標X
let itemY = 0;               // パーツの表示座標Y

// キャンバス要素の保持
let canvas, ctx;

// js/preview.js

window.onload = async () => { // asyncをつけると内部でawaitが使えます
    canvas = document.getElementById('preview-canvas');
    ctx = canvas.getContext('2d');

    // 1. JSONからベースリストを取得してセレクトボックスを作る
    await initBaseSelector(); 

    // 2. BroadcastChannel の受信設定 (既存)
    initBC(); 

    // 3. UI（スライダーなど）の初期化 (既存)
    initUI();

    // 4. Three.js の初期化 (既存)
    if (typeof init3D === 'function') init3D();
};

/**
 * list.json から assets/base/ 内の画像を抽出してセレクトボックスを作成
 */
async function initBaseSelector() {
    const select = document.getElementById('base-selector');
    if (!select) return;

    try {
        const response = await fetch('./list.json');
        const data = await response.json();

        // dataが配列（['path/to/a.png', 'path/to/b.png', ... ]）であると想定
        // フィルタリング：assets/base/ を含み、かつ画像ファイル(png/jpg)であるもの
        const baseFiles = data.filter(path => 
            path.includes('assets/base/') && /\.(png|jpe?g)$/i.test(path)
        );

        baseFiles.forEach(path => {
            const fileName = path.split('/').pop();
            const option = document.createElement('option');
            option.value = path;
            option.textContent = fileName;
            select.appendChild(option);
        });

        // 最初の1枚を初期ベースとして読み込む
        if (baseFiles.length > 0) {
            baseImg.src = baseFiles[0];
            baseImg.onload = () => draw();
        }

        // 選択が切り替わった時の処理
        select.onchange = (e) => {
            baseImg.src = e.target.value;
            // 読み込み完了後に再描画
            baseImg.onload = () => draw();
        };

    } catch (err) {
        console.error("ベースリストの取得に失敗しました:", err);
    }
}

function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ベース画像があれば描く、なければ背景色を塗る
    if (baseImg.complete && baseImg.width > 0) {
        ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#333"; // 暗いグレーを背景にする
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // アイテム（エディタからの画像）を重ねる
    if (itemImg.complete && itemImg.src) {
        ctx.drawImage(itemImg, itemX, itemY);
    }
}

/**
 * UI操作用の関数
 */
function initUI() {
    // スライダー操作
    const sliderX = document.getElementById('posX');
    const sliderY = document.getElementById('posY');

    if (sliderX) sliderX.oninput = (e) => { itemX = parseInt(e.target.value); draw(); };
    if (sliderY) sliderY.oninput = (e) => { itemY = parseInt(e.target.value); draw(); };
}

/**
 * 【統合】現在の重ね合わせをベース画像として確定する
 */
window.mergeToLayer = function() {
    if (!confirm("現在の配置をベース画像に統合しますか？")) return;

    // 現在の表示内容（Base + Item）をDataURLとして取得
    const mergedData = canvas.toDataURL("image/png");
    
    // 新しいベースとしてセット
    baseImg.src = mergedData;
    
    // アイテム側をクリア（統合されたので）
    itemImg = new Image();
    
    alert("ベースを更新しました。次のパーツを待機中です。");
    draw();
};

/**
 * 【保存】現在の合成結果をPNGでダウンロード
 */
window.downloadResult = function() {
    const link = document.createElement('a');
    link.download = 'merged_texture.png';
    link.href = canvas.toDataURL("image/png");
    link.click();
};

/**
 * 【外部読み込み】ベース画像をローカルファイルから変更する
 */
window.uploadBaseImage = function(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        baseImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
};