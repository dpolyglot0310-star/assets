const fs = require('fs');

// 設定（提供いただいたコードをベースに）
const USER = 'dpolyglot0310-star';
const REPO = 'assets';
const BASE_PATH = 'assets';
const IGNORE_DIRS = ['backup', 'old', 'temp'];

async function generate() {
    console.log("Scanning GitHub API...");
    try {
        // 1. リポジトリのデフォルトブランチ名を取得
        const repoRes = await fetch(`https://api.github.com/repos/${USER}/${REPO}`);
        const repoData = await repoRes.json();
        const branch = repoData.default_branch;

        // 2. ツリーデータを取得
        const treeRes = await fetch(`https://api.github.com/repos/${USER}/${REPO}/git/trees/${branch}?recursive=1`);
        const treeData = await treeRes.json();

        if (!treeData.tree) throw new Error("Tree data not found");

        // 3. フィルタリングロジック（提供コードの移植）
        const assetData = treeData.tree.filter(f => {
            const inBase = f.path.startsWith(BASE_PATH + '/');
            const isMatch = /\.(gif|jpe?g|png|webp|svg|mp4|webm|mov|md)$/i.test(f.path);
            const isIgnored = IGNORE_DIRS.some(d => f.path.includes(`/${d}/`));
            return inBase && isMatch && !isIgnored;
        });

        // 4. JSONとして書き出し
        fs.writeFileSync('assets/list.json', JSON.stringify(assetData, null, 2));
        console.log(`Success: ${assetData.length} items found. Saved to list.json`);
    } catch (e) {
        console.error("Error during generation:", e);
        process.exit(1);
    }
}

generate();