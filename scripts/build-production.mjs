// Firebase本番公開用のdist/を自動生成するスクリプト。
// dist/は手動編集せず、元ファイルを修正して必要なときに再生成する。
// 元のHTML・CSS・画像は変更しない。
import { readFile, writeFile, mkdir, rm, copyFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 実行場所に依存せず、このスクリプトの親フォルダを編集元とする。
const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(root, 'dist');
// 公開に必要なHTML・CSS・画像だけをコピーするための一覧。制作資料や検証用HTMLは含めない。
const files = [
  'index.html', 'privacy.html',
  'css/reset.css', 'css/style.css',
  'img/logo-header.png', 'img/logo-footer.png', 'img/favicon-512.png',
  'img/hero.jpg', 'img/about-01.jpg', 'img/about-02.jpg',
  'img/access.jpg', 'img/sns-instagram.png',
];

// 公開対象は固定リストに限定。削除前に必要ファイルがそろっているか確認する。
const sources = new Map();
for (const file of files) {
  const source = path.join(root, file);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('通常ファイルではありません: ' + file);
  const actual = await realpath(source);
  const relative = path.relative(root, actual);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('編集元の範囲外です: ' + file);
  sources.set(file, await readFile(source));
}

// HTMLコメントを保持し、実際のrobots指定だけを生成先から除去する。元HTMLには書き込まない。
// noindex,nofollow（検索掲載・リンク追跡の抑制）を、本番用HTMLのコピーからだけ解除する。
// 測定IDは本番生成時だけ使用する。確認用の元HTMLにはタグを追加しない。
const measurementId = 'G-2LEYPW19CY';
const googleTag = [
  '    <!-- Firebase本番用GA4タグ：生成時にだけ追加する。 -->',
  '    <script async src="https://www.googletagmanager.com/gtag/js?id=' + measurementId + '"></script>',
  '    <script>',
  '      window.dataLayer = window.dataLayer || [];',
  '      function gtag(){dataLayer.push(arguments);}',
  "      gtag('js', new Date());",
  "      gtag('config', '" + measurementId + "');",
  '    </script>',
];
const productionHtml = new Map();
for (const file of ['index.html', 'privacy.html']) {
  let removed = 0;
  let result = sources.get(file).toString('utf8').split(/(<!--[\s\S]*?-->)/g).map(part => {
    if (part.startsWith('<!--')) return part;
    return part.replace(/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])(?=[^>]*\bcontent\s*=\s*["']noindex\s*,\s*nofollow["'])[^>]*>/gi, () => {
      removed++;
      return '';
    });
  }).join('');
  if (removed !== 1) throw new Error('robots指定を1件確認できません: ' + file);
  // 生成先へ1回だけ挿入する。元HTMLに計測タグが追加されていたら、二重計測を防ぐため停止する。
  const activeHtml = result.replace(/<!--[\s\S]*?-->/g, '');
  if (/googletagmanager\.com|google-analytics\.com|\bgtag\s*\(/i.test(activeHtml)) {
    throw new Error('元HTMLに既存の計測タグがあります: ' + file);
  }
  if ((activeHtml.match(/<head\b[^>]*>/gi) || []).length !== 1) throw new Error('headを1件確認できません: ' + file);
  const eol = result.includes('\r\n') ? '\r\n' : '\n';
  result = result.replace(/<head\b[^>]*>/i, head => head + eol + googleTag.join(eol));

  // 本番用ポリシーだけを利用開始後の説明へ切り替え、確認用の元原稿は維持する。
  if (file === 'privacy.html') {
    let changed = 0;
    result = result.replace(/(<h2>アクセス解析について<\/h2>\s*<p>)[\s\S]*?(<\/p>)/, (_, start, end) => {
      changed++;
      return start + eol + '          当Webサイトでは、利用状況の把握・改善のためGoogle アナリティクス4（GA4）を利用しています。GA4はCookie等を利用して、ページの閲覧や端末・ブラウザに関する情報などを収集・処理します。氏名やメールアドレスなど、お問い合わせでお預かりした情報を解析用に送信することはありません。' + eol + '        ' + end;
    });
    if (changed !== 1) throw new Error('GA4の説明箇所を確認できません');
    // 元原稿の未導入コメントを保持し、その直後に生成先での扱いを補足する。
    const sourceNote = '<!-- GA4は未導入。導入時には利用開始の表現と実際の収集・共有設定を再確認する。 -->';
    if (result.includes(sourceNote)) result = result.replace(sourceNote, sourceNote + eol + '        <!-- 上記は確認用の元原稿の注記。本番生成版ではGA4を導入し、以下の説明へ切り替えている。 -->');
  }
  productionHtml.set(file, result);
}

// 再生成時の削除先は編集元直下のdistだけ。リンク先や別フォルダへの削除を防ぐ。
if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('生成先が不正です');
const existing = await lstat(output).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
if (existing && (!existing.isDirectory() || existing.isSymbolicLink() || await realpath(output) !== output)) {
  throw new Error('distが通常の生成先フォルダではありません');
}
// 古いdist/を削除して空のフォルダから作り直し、前回の不要ファイルが残るのを防ぐ。
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// HTMLは上で加工した内容を書き出し、CSS・画像は元ファイルをそのままコピーする。
for (const file of files) {
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  if (productionHtml.has(file)) await writeFile(destination, productionHtml.get(file), 'utf8');
  else await copyFile(path.join(root, file), destination);
}

// 生成結果のローカル参照と元ファイルの不変性を確認する。
for (const file of files) {
  if (!(await readFile(path.join(root, file))).equals(sources.get(file))) throw new Error('編集元が変更されています: ' + file);
}
for (const file of ['index.html', 'privacy.html']) {
  const html = (await readFile(path.join(output, file), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  if (/<meta\b[^>]*\bcontent=["'][^"']*noindex/i.test(html)) throw new Error('noindexが残っています: ' + file);
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (/^(?:#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) continue;
    const local = path.resolve(output, reference.split(/[?#]/)[0]);
    const relative = path.relative(output, local);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('公開範囲外の参照: ' + reference);
    if (!(await lstat(local)).isFile()) throw new Error('参照ファイルがありません: ' + reference);
  }
}
console.log('本番用distを生成しました（GA4: ' + measurementId + '）。公開ファイル ' + files.length + '件:');
console.log(files.join('\n'));
