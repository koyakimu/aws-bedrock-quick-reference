// エントリーポイント。画面 (表・フィルタ・詳細) は TABLE-001 以降の spec で実装する。
// 現時点ではビルドが通ることと、ビルド時に埋め込むメタ情報が届くことだけを確かめる。
document.addEventListener("DOMContentLoaded", () => {
  const meta = document.getElementById("build-meta");
  console.log("aws-bedrock-quick-reference", meta ? meta.textContent : "(no build meta)");
});
