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

    // 1. 初期のベース画像を読み込み (パスはHTMLから見た相対パス)
    // ここに用意した「素体」や「型紙」のファイル名を指定してください
    baseImg.src = './assets/base/body_uv.png'; 
    baseImg.onload = () => {
        console.log("Base image loaded.");
        draw();
    };

    // 2. エディタ(index.html)からのデータ受信設定
    const bc = new BroadcastChannel('3d_sync_channel');
    bc.onmessage = (e) => {
        if (e.data.type === 'UPDATE_ITEM') {
            // 届いたBlobから一時的なURLを生成して読み込む
            const url = URL.createObjectURL(e.data.blob);
            itemImg.src = url;
            itemImg.onload = () => {
                console.log("New item received from editor.");
                draw();
            };
        }
    };

    // UIイベントの紐付け（HTML側にIDがある前提）
    initUI();
};

/**
 * 描画メインロジック
 */
function draw() {
    if (!canvas) return;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 下層：ベース画像を描画
    ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

    // 2. 上層：届いたアイテムを重ねて描画
    if (itemImg.complete && itemImg.src) {
        ctx.drawImage(itemImg, itemX, itemY);
    }

    // 3. 3Dモデルへの反映 (Three.js実装後にここを有効化)
    // updateThreeJSTexture(canvas);
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