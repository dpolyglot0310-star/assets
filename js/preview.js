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

window.onload = () => {
    canvas = document.getElementById('preview-canvas');
    ctx = canvas.getContext('2d');

    // ベース画像を一旦「空」で初期化
    // もし assets/base/body_uv.png がなくてもエラーにならないようにする
    baseImg.onload = () => draw();
    baseImg.onerror = () => {
        console.log("Base image not found. Starting with empty canvas.");
        // 画像がない場合は、とりあえずグレーの背景で描画を開始
        draw();
    };
    
    // パスを指定（ファイルがなくても onerror が助けてくれます）
    baseImg.src = './assets/base/body_uv.png'; 

    // 通信とUIの初期化はそのまま
    initBC(); 
    initUI();
    if (typeof init3D === 'function') init3D();
};

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