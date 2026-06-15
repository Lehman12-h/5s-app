/* =========================================================
   QRコード生成ライブラリ（自己完結・外部依存なし・オフライン動作）

   バイトモード（UTF-8）対応の最小実装。URL程度の短い文字列を
   QRコード化することを目的とする。CDN等の外部サービスは使用しない。

   アルゴリズムは公開されたQRコード規格（ISO/IEC 18004）に基づく
   一般的な実装。MIT相当の自由利用を想定。

   使い方:
     const matrix = QRCode.generate("https://example.com", "M");
     // matrix は boolean[][]（true=黒モジュール）
     QRCode.renderCanvas(canvas, matrix, { scale: 6, margin: 4 });
     const svg = QRCode.toSVG(matrix, { scale: 6, margin: 4 });
   ========================================================= */

(function (global) {
  "use strict";

  /* ---------- ガロア体 GF(256) ---------- */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initGalois() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // 原始多項式 0x11d
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /* リードソロモン除数多項式（モニック、長さ=degree。先頭係数1は省略） */
  function rsComputeDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1; // x^0 係数 = 1 から開始
    let root = 1;
    for (let i = 0; i < degree; i++) {
      // (x - root) を掛ける
      for (let j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  /* 多項式除算の剰余（ECコード語）を計算 */
  function rsComputeRemainder(data, degree) {
    const divisor = rsComputeDivisor(degree);
    const result = new Array(degree).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < degree; i++) {
        result[i] ^= gfMul(divisor[i], factor);
      }
    }
    return result;
  }

  /* ---------- 容量テーブル（バイトモード, EC別データコード語数） ----------
     index: version 1..40。値は [L, M, Q, H] のデータコード語総数。 */
  // 総コード語数 - ECコード語数 から算出した「データコード語数」テーブル
  // （規格表より）バージョン1〜40
  const DATA_CODEWORDS = {
    L: [19,34,55,80,108,136,156,194,232,274,324,370,428,461,523,589,647,721,795,861,932,1006,1094,1174,1276,1370,1468,1531,1631,1735,1843,1955,2071,2191,2306,2434,2566,2702,2812,2956],
    M: [16,28,44,64,86,108,124,154,182,216,254,290,334,365,415,453,507,563,627,669,714,782,860,914,1000,1062,1128,1193,1267,1373,1455,1541,1631,1725,1812,1914,1992,2102,2216,2334],
    Q: [13,22,34,48,62,76,88,110,132,154,180,206,244,261,295,325,367,397,445,485,512,568,614,664,718,754,808,871,911,985,1033,1115,1171,1231,1286,1354,1426,1502,1582,1666],
    H: [9,16,26,36,46,60,66,86,100,122,140,158,180,197,223,253,283,313,341,385,406,442,464,514,538,596,628,661,701,745,793,845,901,961,986,1054,1096,1142,1222,1276]
  };

  /* ECコード語数（ブロック構成）テーブル: [ecPerBlock, group1Blocks, group1Words, group2Blocks, group2Words] */
  // 規格の誤り訂正特性表より（バージョン1〜40 × EC L/M/Q/H）
  const EC_BLOCKS = {
    L: [[7,1,19,0,0],[10,1,34,0,0],[15,1,55,0,0],[20,1,80,0,0],[26,1,108,0,0],[18,2,68,0,0],[20,2,78,0,0],[24,2,97,0,0],[30,2,116,0,0],[18,2,68,2,69],[20,4,81,0,0],[24,2,92,2,93],[26,4,107,0,0],[30,3,115,1,116],[22,5,87,1,88],[24,5,98,1,99],[28,1,107,5,108],[30,5,120,1,121],[28,3,113,4,114],[28,3,107,5,108],[28,4,116,4,117],[28,2,111,7,112],[30,4,121,5,122],[30,6,117,4,118],[26,8,106,4,107],[28,10,114,2,115],[30,8,122,4,123],[30,3,117,10,118],[30,7,116,7,117],[30,5,115,10,116],[30,13,115,3,116],[30,17,115,0,0],[30,17,115,1,116],[30,13,115,6,116],[30,12,121,7,122],[30,6,121,14,122],[30,17,122,4,123],[30,4,122,18,123],[30,20,117,4,118],[30,19,118,6,119]],
    M: [[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],[16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44],[30,1,50,4,51],[22,6,36,2,37],[22,8,37,1,38],[24,4,40,5,41],[24,5,41,5,42],[28,7,45,3,46],[28,10,46,1,47],[26,9,43,4,44],[26,3,44,11,45],[26,3,41,13,42],[26,17,42,0,0],[28,17,46,0,0],[28,4,47,14,48],[28,6,45,14,46],[28,8,47,13,48],[28,19,46,4,47],[28,22,45,3,46],[28,3,45,23,46],[28,21,45,7,46],[28,19,47,10,48],[28,2,46,29,47],[28,10,46,23,47],[28,14,46,21,47],[28,14,46,23,47],[28,12,47,26,48],[28,6,47,34,48],[28,29,46,14,47],[28,13,46,32,47],[28,40,47,7,48],[28,18,47,31,48]],
    Q: [[13,1,13,0,0],[22,1,22,0,0],[18,2,17,0,0],[26,2,24,0,0],[18,2,15,2,16],[24,4,19,0,0],[18,2,14,4,15],[22,4,18,2,19],[20,4,16,4,17],[24,6,19,2,20],[28,4,22,4,23],[26,4,20,6,21],[24,8,20,4,21],[20,11,16,5,17],[30,5,24,7,25],[24,15,19,2,20],[28,1,22,15,23],[28,17,22,1,23],[26,17,21,4,22],[30,15,24,5,25],[28,17,22,6,23],[30,7,24,16,25],[30,11,24,14,25],[30,11,24,16,25],[30,7,24,22,25],[28,28,22,6,23],[30,8,23,26,24],[30,4,24,31,25],[30,1,23,37,24],[30,15,24,25,25],[30,42,24,1,25],[30,10,24,35,25],[30,29,24,19,25],[30,44,24,7,25],[30,39,24,14,25],[30,46,24,10,25],[30,49,24,10,25],[30,48,24,14,25],[30,43,24,22,25],[30,34,24,34,25]],
    H: [[17,1,9,0,0],[28,1,16,0,0],[22,2,13,0,0],[16,4,9,0,0],[22,2,11,2,12],[28,4,15,0,0],[26,4,13,1,14],[26,4,14,2,15],[24,4,12,4,13],[28,6,15,2,16],[24,3,12,8,13],[28,7,14,4,15],[22,12,11,4,12],[24,11,12,5,13],[24,11,12,7,13],[30,3,15,13,16],[28,2,14,17,15],[28,2,14,19,15],[26,9,13,16,14],[28,15,15,10,16],[30,19,16,6,17],[24,34,13,0,0],[30,16,15,14,16],[30,30,16,2,17],[30,22,15,13,16],[30,33,16,4,17],[30,12,15,28,16],[30,11,15,31,16],[30,19,15,26,16],[30,23,15,25,16],[30,23,15,28,16],[30,19,15,35,16],[30,11,15,46,16],[30,59,16,1,17],[30,22,15,41,16],[30,2,15,64,16],[30,24,15,46,16],[30,42,15,32,16],[30,10,15,67,16],[30,20,15,61,16]]
  };

  /* 整列パターン中心座標（バージョン2〜40） */
  const ALIGN_POS = [
    [],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
    [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
    [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],
    [6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],
    [6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],
    [6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],
    [6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]
  ];

  /* ---------- UTF-8 エンコード ---------- */
  function toUtf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
      if (code < 0x80) out.push(code);
      else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return out;
  }

  /* ---------- ビットバッファ ---------- */
  function BitBuffer() {
    this.bits = [];
  }
  BitBuffer.prototype.put = function (value, length) {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  };

  /* ---------- バージョン選択 ---------- */
  function selectVersion(dataLen, ec) {
    const table = DATA_CODEWORDS[ec];
    for (let v = 1; v <= 40; v++) {
      const charCountBits = v <= 9 ? 8 : 16; // バイトモード文字数カウンタ
      // モード4bit + 文字数 + データ8bit + 終端
      const requiredBits = 4 + charCountBits + dataLen * 8;
      const capacityBits = table[v - 1] * 8;
      if (requiredBits <= capacityBits) return v;
    }
    throw new Error("データが大きすぎます（QRコード容量超過）");
  }

  /* ---------- データコード語生成 ---------- */
  function buildDataCodewords(bytes, version, ec) {
    const bb = new BitBuffer();
    const charCountBits = version <= 9 ? 8 : 16;
    bb.put(0b0100, 4); // バイトモード
    bb.put(bytes.length, charCountBits);
    for (const b of bytes) bb.put(b, 8);

    const totalDataCodewords = DATA_CODEWORDS[ec][version - 1];
    const capacityBits = totalDataCodewords * 8;

    // 終端パターン（最大4bit）
    const terminator = Math.min(4, capacityBits - bb.bits.length);
    bb.put(0, terminator);
    // バイト境界まで0埋め
    while (bb.bits.length % 8 !== 0) bb.bits.push(0);

    // コード語化
    const codewords = [];
    for (let i = 0; i < bb.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
      codewords.push(byte);
    }
    // 埋め草コード語
    const padBytes = [0xec, 0x11];
    let p = 0;
    while (codewords.length < totalDataCodewords) {
      codewords.push(padBytes[p % 2]);
      p++;
    }
    return codewords;
  }

  /* ---------- ブロック分割 + EC + インターリーブ ---------- */
  function buildFinalCodewords(dataCodewords, version, ec) {
    const spec = EC_BLOCKS[ec][version - 1];
    const ecPerBlock = spec[0];
    const blocks = [];
    let offset = 0;
    const groups = [
      [spec[1], spec[2]],
      [spec[3], spec[4]],
    ];
    for (const [numBlocks, dataLen] of groups) {
      for (let i = 0; i < numBlocks; i++) {
        const data = dataCodewords.slice(offset, offset + dataLen);
        offset += dataLen;
        const ecc = rsComputeRemainder(data, ecPerBlock);
        blocks.push({ data, ecc });
      }
    }

    // データコード語をインターリーブ
    const result = [];
    const maxData = Math.max(...blocks.map((b) => b.data.length));
    for (let i = 0; i < maxData; i++) {
      for (const blk of blocks) {
        if (i < blk.data.length) result.push(blk.data[i]);
      }
    }
    // ECコード語をインターリーブ
    for (let i = 0; i < ecPerBlock; i++) {
      for (const blk of blocks) {
        result.push(blk.ecc[i]);
      }
    }
    return result;
  }

  /* ---------- マトリクス構築 ---------- */
  function createMatrix(version) {
    const size = version * 4 + 17;
    const modules = [];
    const reserved = [];
    for (let r = 0; r < size; r++) {
      modules.push(new Array(size).fill(false));
      reserved.push(new Array(size).fill(false));
    }
    return { size, modules, reserved };
  }

  function placeFinder(m, row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
        const isBorder =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m.modules[rr][cc] = isBorder || isCenter;
        m.reserved[rr][cc] = true;
      }
    }
  }

  function placeAlignment(m, version) {
    if (version < 2) return;
    const pos = ALIGN_POS[version - 1];
    for (const r of pos) {
      for (const c of pos) {
        // ファインダーパターンと重なる位置はスキップ
        if (
          (r <= 8 && c <= 8) ||
          (r <= 8 && c >= m.size - 9) ||
          (r >= m.size - 9 && c <= 8)
        )
          continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isOn =
              Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            m.modules[r + dr][c + dc] = isOn;
            m.reserved[r + dr][c + dc] = true;
          }
        }
      }
    }
  }

  function placeTiming(m) {
    for (let i = 8; i < m.size - 8; i++) {
      const on = i % 2 === 0;
      if (!m.reserved[6][i]) {
        m.modules[6][i] = on;
        m.reserved[6][i] = true;
      }
      if (!m.reserved[i][6]) {
        m.modules[i][6] = on;
        m.reserved[i][6] = true;
      }
    }
  }

  function reserveFormatAreas(m, version) {
    // フォーマット情報領域
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        m.reserved[8][i] = true;
        m.reserved[i][8] = true;
      }
    }
    for (let i = 0; i < 8; i++) {
      m.reserved[8][m.size - 1 - i] = true;
      m.reserved[m.size - 1 - i][8] = true;
    }
    // 暗モジュール
    m.modules[m.size - 8][8] = true;
    m.reserved[m.size - 8][8] = true;

    // バージョン情報（version >= 7）
    if (version >= 7) {
      for (let i = 0; i < 18; i++) {
        const r = Math.floor(i / 3);
        const c = i % 3;
        m.reserved[m.size - 11 + c][r] = true;
        m.reserved[r][m.size - 11 + c] = true;
      }
    }
  }

  function placeData(m, codewords) {
    const bits = [];
    for (const cw of codewords) {
      for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
    }
    let bitIndex = 0;
    let upward = true;
    for (let col = m.size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // タイミングパターン列を飛ばす
      for (let i = 0; i < m.size; i++) {
        const row = upward ? m.size - 1 - i : i;
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (m.reserved[row][cc]) continue;
          const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
          m.modules[row][cc] = bit === 1;
          bitIndex++;
        }
      }
      upward = !upward;
    }
  }

  /* ---------- マスク ---------- */
  const MASK_FUNCS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function applyMask(m, maskIndex) {
    const fn = MASK_FUNCS[maskIndex];
    const out = m.modules.map((row) => row.slice());
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) {
        if (!m.reserved[r][c] && fn(r, c)) {
          out[r][c] = !out[r][c];
        }
      }
    }
    return out;
  }

  /* ---------- フォーマット情報 ---------- */
  const EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  function formatBits(ec, mask) {
    const data = (EC_FORMAT_BITS[ec] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;
    return bits;
  }

  function placeFormat(modules, m, ec, mask) {
    const bits = formatBits(ec, mask);
    const get = (i) => (bits >> i) & 1;
    // 1つ目のコピー（左上：col8の縦帯 → row8の横帯）
    for (let i = 0; i <= 5; i++) modules[i][8] = get(i) === 1;
    modules[7][8] = get(6) === 1;
    modules[8][8] = get(7) === 1;
    modules[8][7] = get(8) === 1;
    for (let i = 9; i <= 14; i++) modules[8][14 - i] = get(i) === 1;
    // 2つ目のコピー（右上：row8の横帯 → 左下：col8の縦帯）
    for (let i = 0; i <= 7; i++) modules[8][m.size - 1 - i] = get(i) === 1;
    for (let i = 8; i <= 14; i++) modules[m.size - 15 + i][8] = get(i) === 1;
  }

  /* ---------- バージョン情報（v>=7） ---------- */
  function placeVersion(modules, m, version) {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
    }
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = i % 3;
      modules[m.size - 11 + c][r] = bit;
      modules[r][m.size - 11 + c] = bit;
    }
  }

  /* ---------- ペナルティ評価（マスク選択） ---------- */
  function penalty(modules, size) {
    let score = 0;
    // ルール1: 連続同色
    for (let r = 0; r < size; r++) {
      let runColor = modules[r][0],
        runLen = 1;
      for (let c = 1; c < size; c++) {
        if (modules[r][c] === runColor) runLen++;
        else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }
    for (let c = 0; c < size; c++) {
      let runColor = modules[0][c],
        runLen = 1;
      for (let r = 1; r < size; r++) {
        if (modules[r][c] === runColor) runLen++;
        else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }
    // ルール2: 2x2同色ブロック
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = modules[r][c];
        if (
          v === modules[r][c + 1] &&
          v === modules[r + 1][c] &&
          v === modules[r + 1][c + 1]
        )
          score += 3;
      }
    }
    // ルール3: ファインダー類似パターン
    const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];
    function matchAt(arr) {
      const matchP = (slice) =>
        slice.every((v, i) => v === pattern1[i]) ||
        slice.every((v, i) => v === pattern2[i]);
      let s = 0;
      for (let i = 0; i <= arr.length - 11; i++) {
        if (matchP(arr.slice(i, i + 11))) s += 40;
      }
      return s;
    }
    for (let r = 0; r < size; r++) score += matchAt(modules[r]);
    for (let c = 0; c < size; c++) {
      const col = [];
      for (let r = 0; r < size; r++) col.push(modules[r][c]);
      score += matchAt(col);
    }
    // ルール4: 暗モジュール比率
    let dark = 0;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (modules[r][c]) dark++;
    const total = size * size;
    const percent = (dark * 100) / total;
    const k = Math.floor(Math.abs(percent - 50) / 5);
    score += k * 10;
    return score;
  }

  /* ---------- 生成本体 ---------- */
  function generate(text, ecLevel) {
    const ec = (ecLevel || "M").toUpperCase();
    if (!DATA_CODEWORDS[ec]) throw new Error("ECレベルは L/M/Q/H のいずれか");

    const bytes = toUtf8Bytes(text);
    const version = selectVersion(bytes.length, ec);

    const dataCodewords = buildDataCodewords(bytes, version, ec);
    const finalCodewords = buildFinalCodewords(dataCodewords, version, ec);

    const m = createMatrix(version);
    placeFinder(m, 0, 0);
    placeFinder(m, 0, m.size - 7);
    placeFinder(m, m.size - 7, 0);
    placeAlignment(m, version);
    placeTiming(m);
    reserveFormatAreas(m, version);
    placeData(m, finalCodewords);

    // 最適マスク選択
    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const masked = applyMask(m, mask);
      placeFormat(masked, m, ec, mask);
      placeVersion(masked, m, version);
      const score = penalty(masked, m.size);
      if (score < bestScore) {
        bestScore = score;
        best = masked;
      }
    }
    return best;
  }

  /* ---------- 描画ヘルパ ---------- */
  function renderCanvas(canvas, matrix, opts) {
    opts = opts || {};
    const scale = opts.scale || 6;
    const margin = opts.margin == null ? 4 : opts.margin;
    const size = matrix.length;
    const dim = (size + margin * 2) * scale;
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = opts.light || "#ffffff";
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = opts.dark || "#000000";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          ctx.fillRect(
            (c + margin) * scale,
            (r + margin) * scale,
            scale,
            scale
          );
        }
      }
    }
  }

  function toSVG(matrix, opts) {
    opts = opts || {};
    const scale = opts.scale || 6;
    const margin = opts.margin == null ? 4 : opts.margin;
    const size = matrix.length;
    const dim = (size + margin * 2) * scale;
    let path = "";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          path += `M${(c + margin) * scale},${(r + margin) * scale}h${scale}v${scale}h-${scale}z`;
        }
      }
    }
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}">` +
      `<rect width="${dim}" height="${dim}" fill="${opts.light || "#ffffff"}"/>` +
      `<path d="${path}" fill="${opts.dark || "#000000"}"/>` +
      `</svg>`
    );
  }

  global.QRCode = { generate, renderCanvas, toSVG };
})(typeof window !== "undefined" ? window : this);
