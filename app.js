/* =========================================================
   5S活動 QRコード閲覧システム — 表示ロジック
   Vanilla JS のみ（フレームワーク・外部ライブラリ不使用）

   URLルール:
     ?area=area-A1  → 該当現場を表示
     パラメータなし  → エリア一覧を表示
     存在しないID    → エラー画面を表示
   ========================================================= */

"use strict";

/* 一覧ページに表示するエリアID。新規現場を追加したらここに追記する。 */
const AREA_IDS = ["area-A1", "area-B1"];

/* priority の表示優先度（小さいほど上に表示） */
const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2 };

/* priority のバッジ定義（normal はバッジ非表示） */
const PRIORITY_BADGE = {
  critical: { label: "⚠ 重要", cls: "badge--critical" },
  high: { label: "注意", cls: "badge--high" },
};

const PRIORITY_CLASS = {
  critical: "item-card--critical",
  high: "item-card--high",
  normal: "item-card--normal",
};

/* ---------- ユーティリティ ---------- */

/** URLクエリから area パラメータを取得 */
function getAreaParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("area");
}

/** 指定エリアのJSONを取得（キャッシュ回避なしで素直にfetch） */
async function fetchArea(areaId) {
  const res = await fetch(`areas/${areaId}.json`, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/** priority に従ってアイテムを並べ替え（critical → high → normal） */
function sortItems(items) {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    return pa - pb;
  });
}

/** 状態画面（読み込み中・エラー・未検出）を描画 */
function renderState(root, { icon, title, message, actionHref, actionLabel }) {
  const action =
    actionHref && actionLabel
      ? `<a class="state__action" href="${actionHref}">${actionLabel}</a>`
      : "";
  root.innerHTML = `
    <div class="state">
      <div class="state__icon" aria-hidden="true">${icon}</div>
      <p class="state__title">${title}</p>
      <p>${message}</p>
      ${action}
    </div>`;
}

/* ---------- 描画：現場詳細 ---------- */

function renderArea(root, data) {
  // ヘッダーのタイトルを現場名に更新
  const titleEl = document.getElementById("header-title");
  if (titleEl && data.name) {
    titleEl.textContent = data.name;
    document.title = `${data.name} — 5S活動`;
  }

  const meta = `
    <section class="area-meta">
      <p class="area-meta__location">📍 ${escapeHtml(data.location || "")}</p>
      <p class="area-meta__updated">更新: ${escapeHtml(data.updated || "")}　${escapeHtml(
        data.updatedBy || ""
      )}</p>
      ${
        data.category
          ? `<span class="area-meta__category">${escapeHtml(data.category)}</span>`
          : ""
      }
    </section>`;

  const items = sortItems(Array.isArray(data.items) ? data.items : []);

  const itemsHtml = items.length
    ? `<ul class="item-list">${items.map(renderItem).join("")}</ul>`
    : `<p class="state">登録されている注意事項はありません。</p>`;

  root.innerHTML = meta + itemsHtml;
}

function renderItem(item) {
  const priority = PRIORITY_CLASS[item.priority] ? item.priority : "normal";
  const badge = PRIORITY_BADGE[priority];
  const badgeHtml = badge
    ? `<span class="badge ${badge.cls}">${badge.label}</span>`
    : "";

  // 画像ファイルが見つからない場合は壊れたアイコンを隠す（onerrorで非表示）
  const imageHtml = item.image
    ? `<img class="item-card__image" src="${escapeHtml(item.image)}"
         alt="${escapeHtml(item.imageAlt || item.title || "")}" loading="lazy"
         onerror="this.style.display='none'">`
    : "";

  const tagsHtml =
    Array.isArray(item.tags) && item.tags.length
      ? `<ul class="tag-list">${item.tags
          .map((t) => `<li class="tag">${escapeHtml(t)}</li>`)
          .join("")}</ul>`
      : "";

  return `
    <li class="item-card item-card--${priority}">
      <div class="item-card__head">
        ${badgeHtml}
        <h2 class="item-card__title">${escapeHtml(item.title || "")}</h2>
      </div>
      ${imageHtml}
      <p class="item-card__desc">${escapeHtml(item.description || "")}</p>
      ${tagsHtml}
    </li>`;
}

/* ---------- 描画：エリア一覧 ---------- */

async function renderIndex(root) {
  document.title = "5S活動 現場一覧";
  renderState(root, {
    icon: "⏳",
    title: "読み込み中…",
    message: "現場一覧を取得しています。",
  });

  const results = await Promise.all(
    AREA_IDS.map(async (id) => {
      try {
        return await fetchArea(id);
      } catch (e) {
        return null; // 読み込めなかった現場はスキップ
      }
    })
  );

  const areas = results.filter(Boolean);

  if (!areas.length) {
    renderState(root, {
      icon: "📭",
      title: "現場データがありません",
      message: "areas/ フォルダに現場JSONが見つかりませんでした。",
    });
    return;
  }

  const listHtml = areas
    .map(
      (a) => `
      <li>
        <a class="area-index__link" href="?area=${encodeURIComponent(a.id)}">
          <span class="area-index__name">${escapeHtml(a.name)}</span>
          <span class="area-index__location">📍 ${escapeHtml(a.location || "")}</span>
        </a>
      </li>`
    )
    .join("");

  root.innerHTML = `
    <h1 class="section-title">現場を選択してください</h1>
    <ul class="area-index">${listHtml}</ul>`;
}

/* ---------- HTMLエスケープ（XSS対策） ---------- */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- エントリーポイント ---------- */

async function main() {
  const root = document.getElementById("content");
  if (!root) return;

  const areaId = getAreaParam();

  // パラメータなし → 一覧
  if (!areaId) {
    await renderIndex(root);
    return;
  }

  // 読み込み中表示
  renderState(root, {
    icon: "⏳",
    title: "読み込み中…",
    message: "現場データを取得しています。",
  });

  try {
    const data = await fetchArea(areaId);
    renderArea(root, data);
  } catch (err) {
    // JSONが無い / パースエラー / ネットワークエラー
    const isNotFound = String(err.message).includes("404");
    renderState(root, {
      icon: isNotFound ? "🔍" : "⚠️",
      title: isNotFound ? "現場が見つかりません" : "読み込みに失敗しました",
      message: isNotFound
        ? `指定された現場「${escapeHtml(areaId)}」のデータが存在しません。QRコードを確認してください。`
        : "データの読み込み中に問題が発生しました。通信環境を確認して再読み込みしてください。",
      actionHref: "./",
      actionLabel: "現場一覧へ戻る",
    });
  }
}

document.addEventListener("DOMContentLoaded", main);
