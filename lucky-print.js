// ============================================================
//  3·1 만세길 걷기 행운권 — 인쇄용 PDF · 미리 보기 (lucky-admin.html 에서 씀)
//  필요한 것: qrcode-generator(qrcode) · jsPDF(window.jspdf) — 미리 보기는 qrcode 만
//  - LuckyPrint.LAYOUTS                 : 종이(A4) 한 장에 몇 장 · 한 장 크기
//  - LuckyPrint.url(code)               : QR 안에 들어가는 등록 주소 (https://samgoe-cc.or.kr/lucky.html?c=확인코드)
//  - LuckyPrint.prepare(opt)            : 행사명 · 이미지처럼 모든 장에 같은 그림을 한 번만 만듦 (Promise)
//  - LuckyPrint.preview(canvas, prep, tickets) : 첫 쪽 미리 보기
//  - LuckyPrint.pdf(prep, tickets, onProgress) : PDF 파일(Blob) (Promise)
//  PDF 기본 글꼴에는 한글이 없어서 행사명 · 안내 글은 그림으로 그려 넣고(모든 장이 같은 그림 하나를 다시 씀),
//  번호 · 확인 코드는 글자로, QR은 네모(벡터)로 그려 작은 글씨까지 선명하고 파일이 가볍습니다.
// ============================================================
(function () {
  var SITE = 'https://samgoe-cc.or.kr';
  var MM2PT = 72 / 25.4, PXMM = 12;   // 글 그림 해상도: 1mm = 12px (약 300dpi)
  var NAVY = [3, 34, 87], GOLD = [138, 109, 52], MUTED = [107, 107, 107], LINE = [230, 227, 221], CUT = [160, 160, 160],
      BLACK = [0, 0, 0], WHITE = [255, 255, 255];
  var SERIF = '"Noto Serif KR","Nanum Myeongjo","Apple SD Gothic Neo","Malgun Gothic",serif';
  var SANS = '"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  var LATIN = 'Helvetica,Arial,sans-serif';
  var PAGE = { w: 210, h: 297 };

  var LAYOUTS = {
    card8:     { label: 'A4 한 장에 8장 · 95×68mm (기본)', cols: 2, rows: 4, w: 95, h: 68, stub: 22 },
    card10:    { label: 'A4 한 장에 10장 · 90×54mm (명함 크기)', cols: 2, rows: 5, w: 90, h: 54, stub: 20 },
    wide4:     { label: 'A4 한 장에 4장 · 190×68mm (큰 행운권)', cols: 1, rows: 4, w: 190, h: 68, stub: 36 },
    sticker24: { label: 'QR만 작게 · A4 한 장에 24개 · 64×34mm (스티커 · 라벨지)', cols: 3, rows: 8, w: 64, h: 34, gap: 2.5, sticker: true }
  };

  function url(code) { return SITE + '/lucky.html?c=' + encodeURIComponent(code); }
  function fmtCode(c) { c = String(c || ''); return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c; }
  function padNo(n, d) { var s = String(n); while (s.length < d) s = '0' + s; return s; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------- 글 그림 (한글) ----------
  var mctx = document.createElement('canvas').getContext('2d');
  function measure(text, sizeMm, weight, font) { mctx.font = weight + ' ' + (sizeMm * PXMM) + 'px ' + font; return mctx.measureText(text).width / PXMM; }
  // 띄어쓰기 단위로 줄을 나누고, 한 낱말이 너무 길면 글자 단위로 자름
  function wrap(text, w, size, weight, font) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (wd) {
      var t = cur ? cur + ' ' + wd : wd;
      if (measure(t, size, weight, font) <= w) { cur = t; return; }
      if (cur) lines.push(cur);
      cur = '';
      if (measure(wd, size, weight, font) <= w) { cur = wd; return; }
      for (var i = 0; i < wd.length; i++) {
        var t2 = cur + wd[i];
        if (cur && measure(t2, size, weight, font) > w) { lines.push(cur); cur = wd[i]; } else cur = t2;
      }
    });
    if (cur) lines.push(cur);
    return lines;
  }
  // 작은 글씨(날짜 · 장소)는 가운뎃점(·)에서 먼저 나눔 — 2027.10.17 오후 2시 ~ 5시 / 쌍봉산 근린공원
  function wrapDots(text, w, size, weight, font) {
    var segs = String(text || '').split(/\s*·\s*/).filter(Boolean), lines = [], cur = '';
    for (var i = 0; i < segs.length; i++) {
      if (measure(segs[i], size, weight, font) > w) return wrapEven(text, w, size, weight, font);
      var t = cur ? cur + ' · ' + segs[i] : segs[i];
      if (measure(t, size, weight, font) <= w) cur = t; else { lines.push(cur); cur = segs[i]; }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  // 줄 수는 그대로 두고 줄 길이를 고르게 (제7회 3·1 만세길 / 걷기 → 제7회 3·1 / 만세길 걷기)
  function wrapEven(text, w, size, weight, font) {
    var lines = wrap(text, w, size, weight, font), lo = w * 0.3, hi = w;
    if (lines.length < 2) return lines;
    for (var i = 0; i < 14; i++) { var mid = (lo + hi) / 2; if (wrap(text, mid, size, weight, font).length > lines.length) lo = mid; else hi = mid; }
    return wrap(text, hi, size, weight, font);
  }
  function newCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * PXMM)); c.height = Math.max(1, Math.round(h * PXMM)); return c; }
  function img(alias, canvas, fmt) {
    var o = { alias: alias, canvas: canvas, fmt: fmt || 'PNG', w: canvas.width / PXMM, h: canvas.height / PXMM, _d: null };
    o.data = function () { return o._d || (o._d = canvas.toDataURL(o.fmt === 'JPEG' ? 'image/jpeg' : 'image/png', 0.9)); };
    return o;
  }
  // 한 줄 글 그림 (가운데 맞춤용으로 실제 너비만큼)
  function lineImg(alias, text, size, weight, font, color, maxW) {
    while (maxW && size > 1.6 && measure(text, size, weight, font) > maxW) size -= 0.1;
    var w = measure(text, size, weight, font) + 0.4, h = size * 1.3, c = newCanvas(w, h), x = c.getContext('2d');
    x.font = weight + ' ' + (size * PXMM) + 'px ' + font; x.fillStyle = 'rgb(' + color.join(',') + ')'; x.textBaseline = 'middle';
    x.fillText(text, 0.2 * PXMM, c.height / 2);
    return img(alias, c);
  }
  // 여러 줄 짧은 글 (가운데 맞춤)
  function linesImg(alias, lines, size, weight, font, color, maxW) {
    var w = 0; lines.forEach(function (l) { w = Math.max(w, measure(l, size, weight, font)); });
    if (maxW && w > maxW) { size *= maxW / w; w = maxW; }
    var lh = size * 1.3, c = newCanvas(w + 0.4, lh * lines.length), x = c.getContext('2d');
    x.font = weight + ' ' + (size * PXMM) + 'px ' + font; x.fillStyle = 'rgb(' + color.join(',') + ')'; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach(function (l, i) { x.fillText(l, c.width / 2, (i + 0.5) * lh * PXMM); });
    return img(alias, c);
  }
  // 행사명(굵게, 여러 줄) + 작은 글씨 — 칸(w×h mm)에 맞게 글자 크기를 줄여 가며 넣음
  function titleImg(alias, title, sub, w, h, maxSize, align) {
    var size = maxSize, lines, subSize, subLines, total;
    for (;;) {
      lines = wrapEven(title, w, size, 700, SERIF);
      subSize = Math.max(2.1, Math.min(size * 0.5, 3.4));
      subLines = sub ? wrapDots(sub, w, subSize, 500, SANS) : [];
      total = lines.length * size * 1.28 + (subLines.length ? size * 0.35 + subLines.length * subSize * 1.35 : 0);
      if ((lines.length <= 3 && subLines.length <= 2 && total <= h) || size <= 2.2) break;
      size -= 0.1;
    }
    var c = newCanvas(w, h), x = c.getContext('2d'), y = (h - total) / 2, ax = align === 'center' ? w / 2 : 0;
    x.textAlign = align === 'center' ? 'center' : 'left'; x.textBaseline = 'middle';
    x.font = '700 ' + (size * PXMM) + 'px ' + SERIF; x.fillStyle = 'rgb(' + NAVY.join(',') + ')';
    lines.forEach(function (ln) { x.fillText(ln, ax * PXMM, (y + size * 0.64) * PXMM); y += size * 1.28; });
    if (subLines.length) {
      y += size * 0.35;
      x.font = '500 ' + (subSize * PXMM) + 'px ' + SANS; x.fillStyle = 'rgb(' + MUTED.join(',') + ')';
      subLines.forEach(function (ln) { x.fillText(ln, ax * PXMM, (y + subSize * 0.675) * PXMM); y += subSize * 1.35; });
    }
    return img(alias, c);
  }
  // 이미지 — 칸에 꽉 채우기(가장자리 잘림) 또는 전체 보이기(남는 곳은 흰색)
  function artImg(src, w, h, fit) {
    var sc = Math.min(10, 2000 / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.round(w * sc); c.height = Math.round(h * sc);
    var x = c.getContext('2d'), iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    var r = fit === 'contain' ? Math.min(c.width / iw, c.height / ih) : Math.max(c.width / iw, c.height / ih);
    var dw = iw * r, dh = ih * r;
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    var o = { alias: 'art', canvas: c, fmt: 'JPEG', w: w, h: h, _d: null };
    o.data = function () { return o._d || (o._d = c.toDataURL('image/jpeg', 0.88)); };
    return o;
  }

  // ---------- 그리는 곳: PDF · 캔버스(미리 보기) 같은 명령으로 ----------
  function pdfPainter(doc) {
    function col(c) { return [c[0], c[1], c[2]]; }
    return {
      fill: function (x, y, w, h, c) { doc.setFillColor.apply(doc, col(c)); doc.rect(x, y, w, h, 'F'); },
      frame: function (x, y, w, h, c, lw) { doc.setLineDashPattern([], 0); doc.setDrawColor.apply(doc, col(c)); doc.setLineWidth(lw); doc.rect(x, y, w, h, 'S'); },
      dash: function (x1, y1, x2, y2, c, lw, d) { doc.setDrawColor.apply(doc, col(c)); doc.setLineWidth(lw); doc.setLineDashPattern(d, 0); doc.line(x1, y1, x2, y2); doc.setLineDashPattern([], 0); },
      text: function (s, x, y, size, bold, c, align) {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size * MM2PT); doc.setTextColor.apply(doc, col(c));
        doc.text(s, x, y, { align: align || 'left', baseline: 'middle' });
      },
      image: function (im, x, y, w, h) { doc.addImage(im.data(), im.fmt, x, y, w, h, im.alias, 'FAST'); }
    };
  }
  function canvasPainter(ctx) {
    function rgb(c) { return 'rgb(' + c.join(',') + ')'; }
    return {
      fill: function (x, y, w, h, c) { ctx.fillStyle = rgb(c); ctx.fillRect(x, y, w, h); },
      frame: function (x, y, w, h, c, lw) { ctx.setLineDash([]); ctx.strokeStyle = rgb(c); ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); },
      dash: function (x1, y1, x2, y2, c, lw, d) { ctx.strokeStyle = rgb(c); ctx.lineWidth = lw; ctx.setLineDash(d); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]); },
      text: function (s, x, y, size, bold, c, align) {
        ctx.font = (bold ? 'bold ' : '') + size + 'px ' + LATIN; ctx.fillStyle = rgb(c); ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(s, x, y);
      },
      image: function (im, x, y, w, h) { ctx.drawImage(im.canvas, x, y, w, h); }
    };
  }
  // QR — 가로로 이어진 검은 칸은 네모 하나로 (파일이 가볍고, 칸 사이 틈이 덜 보임)
  function drawQr(P, text, x, y, size) {
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = size / (n + 2);   // 둘레에 한 칸씩 여백
    P.fill(x, y, size, size, WHITE);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!q.isDark(r, c)) continue;
        var c0 = c; while (c + 1 < n && q.isDark(r, c + 1)) c++;
        P.fill(x + (c0 + 1) * m, y + (r + 1) * m, (c - c0 + 1) * m, m + 0.015, BLACK);
      }
    }
  }
  // 'Helvetica 굵게'로 칸 너비에 맞는 글자 크기 (미리 보기와 PDF가 거의 같은 너비)
  function fitLatin(text, w, max, bold) { var s = max; while (s > 1.6 && measure(text, s, bold ? 'bold' : 'normal', LATIN) > w) s -= 0.1; return s; }

  // ---------- 준비: 모든 장에 같은 칸 · 그림 ----------
  async function prepare(opt) {
    var L = LAYOUTS[opt.layout] || LAYOUTS.card8, W = L.w, H = L.h;
    var title = String(opt.title || '').trim() || '3·1 만세길 걷기', sub = String(opt.subtitle || '').trim();
    var digits = Math.max(3, String(opt.maxNo || 0).length);
    var INSTR = 'QR을 찍어 이름 · 생년월일 · 소속을 등록하세요', INSTR_S = 'QR을 찍어 등록하세요';
    try {
      if (document.fonts && document.fonts.load) {
        var all = title + sub + '행운권개인용투표잘라서함에넣기' + INSTR;
        await Promise.all([document.fonts.load('700 20px "Noto Serif KR"', title), document.fonts.load('500 20px "Pretendard Variable"', all),
          document.fonts.load('700 20px "Pretendard Variable"', all)]);
      }
    } catch (_) {}
    var g = { L: L, cut: opt.cut !== false, digits: digits, im: {} }, pad, numSample = 'No. ' + padNo(Math.pow(10, digits) - 1, digits);

    if (L.sticker) {
      pad = 2;
      var qs = H - 2 * pad, rx = pad + qs + 1.5, rw = W - rx - pad;
      g.qr = { x: pad, y: pad, s: qs };
      g.im.label = lineImg('label', '행운권', 2.8, 700, SANS, GOLD, rw);
      g.num = { x: rx, y: pad + g.im.label.h + 3.2, size: fitLatin(numSample, rw, 6.2, true) };
      g.im.title = titleImg('title', title, '', rw, H - pad - (g.num.y + 3.6) - 3.4, 3.6, 'left');
      g.titleBox = { x: rx, y: g.num.y + 3.6 };
      g.code = { x: rx, y: H - pad - 1.2, size: 2.1 };
      g.labelAt = { x: rx, y: pad };
      return g;
    }

    var small = H < 60, inset = 1.5;
    pad = small ? 2.5 : 3;
    var fr = { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset }, stubW = opt.stub ? L.stub : 0;
    var main = { x: fr.x, y: fr.y, w: fr.w - stubW, h: fr.h };
    var labelH = small ? 3 : 3.4, numH = small ? 5 : 6, codeH = 2.6, instrH = small ? 2.6 : 3;
    var qr = Math.min(main.h - 2 * pad - labelH - numH - codeH - instrH - 2.5, 34, main.w * 0.42);
    var infoW = qr + 2 * pad, info = { x: main.x + main.w - infoW, y: main.y, w: infoW, h: main.h };
    var left = { x: main.x, y: main.y, w: main.w - infoW, h: main.h };
    g.fr = fr; g.info = info;

    // 오른쪽: 행운권 · 번호 · QR · 확인 코드 · 안내
    var total = labelH + numH + 1 + qr + codeH + instrH, y = info.y + (info.h - total) / 2, cx = info.x + info.w / 2;
    g.im.label = lineImg('label', stubW ? '행운권 · 개인용' : '행운권', labelH / 1.3, 700, SANS, GOLD, info.w - 2);
    g.labelAt = { x: cx - g.im.label.w / 2, y: y };
    g.num = { x: cx, y: y + labelH + numH / 2, size: fitLatin(numSample, info.w - 2 * pad + 2, numH * 0.95, true), align: 'center' };
    g.qr = { x: cx - qr / 2, y: y + labelH + numH + 1, s: qr };
    g.code = { x: cx, y: g.qr.y + qr + codeH / 2, size: 2.2, align: 'center' };
    g.im.instr = lineImg('instr', info.w - 2 > measure(INSTR, instrH / 1.3, 500, SANS) ? INSTR : INSTR_S, instrH / 1.3, 500, SANS, MUTED, info.w - 1.5);
    g.instrAt = { x: cx - g.im.instr.w / 2, y: g.qr.y + qr + codeH };

    // 왼쪽: 이미지 + 행사명
    var tb;
    if (opt.art) {
      if (left.w / left.h > 1.7) {        // 가로로 넓은 칸(큰 행운권) — 이미지 왼쪽, 행사명 오른쪽
        var iw = left.w * 0.52;
        g.art = { x: left.x, y: left.y, w: iw, h: left.h };
        tb = { x: left.x + iw + pad + 1, y: left.y + pad, w: left.w - iw - 2 * pad - 1, h: left.h - 2 * pad };
        g.im.title = titleImg('title', title, sub, tb.w, tb.h, 7.5, 'left');
      } else {                            // 이미지 위, 행사명 아래
        var th = clamp(left.h * 0.32, 13, 21);
        g.art = { x: left.x, y: left.y, w: left.w, h: left.h - th };
        tb = { x: left.x + pad, y: left.y + left.h - th + 0.8, w: left.w - 2 * pad, h: th - 0.8 - pad * 0.7 };
        g.im.title = titleImg('title', title, sub, tb.w, tb.h, small ? 4.6 : 5.2, 'left');
      }
      g.im.art = artImg(opt.art, g.art.w, g.art.h, opt.fit);
    } else {
      tb = { x: left.x + pad + 1, y: left.y + pad, w: left.w - 2 * pad - 2, h: left.h - 2 * pad };
      g.im.title = titleImg('title', title, sub, tb.w, tb.h, small ? 6.4 : 8, 'left');
    }
    g.titleBox = tb;

    // 절취선 오른쪽 투표용 칸 — 번호만 (잘라서 투표함에 넣음, 왼쪽 개인용은 QR로 등록하고 보관)
    if (stubW) {
      var sx = main.x + main.w, scx = sx + stubW / 2;
      g.stub = { x: sx, cx: scx, top: fr.y, bot: fr.y + fr.h };
      g.im.stub = lineImg('stub', '투표용', small ? 2.9 : 3.3, 700, SANS, GOLD, stubW - 2);
      g.im.stubNote = linesImg('stubnote', ['잘라서', '투표함에'], small ? 2.1 : 2.3, 500, SANS, MUTED, stubW - 2);
      var ns = fitLatin(padNo(Math.pow(10, digits) - 1, digits), stubW - 3, small ? 6.5 : 7.5, true);
      var tot = g.im.stub.h + 1.5 + 3 + ns * 1.1 + 2 + g.im.stubNote.h, sy = fr.y + (fr.h - tot) / 2;
      g.stubLabelAt = { x: scx - g.im.stub.w / 2, y: sy }; sy += g.im.stub.h + 1.5;
      g.stubNo = { x: scx, y: sy + 1.5, size: 2.6 }; sy += 3;
      g.stubNum = { x: scx, y: sy + ns * 0.55, size: ns }; sy += ns * 1.1 + 2;
      g.stubNoteAt = { x: scx - g.im.stubNote.w / 2, y: sy };
    }
    return g;
  }

  // 한 장 그리기 — (ox, oy): 그 장의 왼쪽 위 (mm)
  function drawTicket(P, g, t, ox, oy) {
    var no = padNo(t.no, g.digits), im = g.im;
    if (g.L.sticker) {
      drawQr(P, url(t.code), ox + g.qr.x, oy + g.qr.y, g.qr.s);
      P.image(im.label, ox + g.labelAt.x, oy + g.labelAt.y, im.label.w, im.label.h);
      P.text('No. ' + no, ox + g.num.x, oy + g.num.y, g.num.size, true, NAVY);
      P.image(im.title, ox + g.titleBox.x, oy + g.titleBox.y, im.title.w, im.title.h);
      P.text(fmtCode(t.code), ox + g.code.x, oy + g.code.y, g.code.size, false, MUTED);
      return;
    }
    if (im.art) P.image(im.art, ox + g.art.x, oy + g.art.y, g.art.w, g.art.h);
    P.dash(ox + g.info.x, oy + g.info.y + 2, ox + g.info.x, oy + g.info.y + g.info.h - 2, LINE, 0.25, []);
    P.image(im.title, ox + g.titleBox.x, oy + g.titleBox.y, im.title.w, im.title.h);
    P.image(im.label, ox + g.labelAt.x, oy + g.labelAt.y, im.label.w, im.label.h);
    P.text('No. ' + no, ox + g.num.x, oy + g.num.y, g.num.size, true, NAVY, 'center');
    drawQr(P, url(t.code), ox + g.qr.x, oy + g.qr.y, g.qr.s);
    P.text(fmtCode(t.code), ox + g.code.x, oy + g.code.y, g.code.size, false, MUTED, 'center');
    P.image(im.instr, ox + g.instrAt.x, oy + g.instrAt.y, im.instr.w, im.instr.h);
    if (g.stub) {
      P.dash(ox + g.stub.x, oy + g.stub.top, ox + g.stub.x, oy + g.stub.bot, MUTED, 0.3, [1.2, 1]);
      P.image(im.stub, ox + g.stubLabelAt.x, oy + g.stubLabelAt.y, im.stub.w, im.stub.h);
      P.text('No.', ox + g.stubNo.x, oy + g.stubNo.y, g.stubNo.size, false, MUTED, 'center');
      P.text(no, ox + g.stubNum.x, oy + g.stubNum.y, g.stubNum.size, true, NAVY, 'center');
      P.image(im.stubNote, ox + g.stubNoteAt.x, oy + g.stubNoteAt.y, im.stubNote.w, im.stubNote.h);
    }
    P.frame(ox + g.fr.x, oy + g.fr.y, g.fr.w, g.fr.h, NAVY, 0.3);
  }

  function grid(L) {
    var gap = L.gap || 0, gw = L.cols * L.w + (L.cols - 1) * gap, gh = L.rows * L.h;
    return { ox: (PAGE.w - gw) / 2, oy: (PAGE.h - gh) / 2, gap: gap, gw: gw, gh: gh, per: L.cols * L.rows };
  }
  function drawPage(P, g, list, page, pages) {
    var L = g.L, G = grid(L);
    P.fill(0, 0, PAGE.w, PAGE.h, WHITE);
    list.forEach(function (t, i) {
      var c = i % L.cols, r = Math.floor(i / L.cols);
      drawTicket(P, g, t, G.ox + c * (L.w + G.gap), G.oy + r * L.h);
    });
    if (g.cut) {   // 자르는 선 — 장과 장 사이 (종이 끝까지 조금 더)
      var ext = 5, d = [1.6, 1.4], lw = 0.2, x, y, i;
      for (i = 0; i <= L.rows; i++) { y = G.oy + i * L.h; P.dash(G.ox - ext, y, G.ox + G.gw + ext, y, CUT, lw, d); }
      for (i = 0; i < L.cols; i++) {
        x = G.ox + i * (L.w + G.gap); P.dash(x, G.oy - ext, x, G.oy + G.gh + ext, CUT, lw, d);
        x += L.w; P.dash(x, G.oy - ext, x, G.oy + G.gh + ext, CUT, lw, d);
      }
    }
    if (list.length) P.text('No. ' + list[0].no + ' - ' + list[list.length - 1].no + '      ' + page + ' / ' + pages,
      PAGE.w / 2, PAGE.h - Math.min(G.oy / 2, 6), 2.4, false, MUTED, 'center');
  }

  // 첫 쪽 미리 보기 — 캔버스 너비에 맞춰 A4 한 장
  function preview(canvas, g, tickets) {
    var dpr = window.devicePixelRatio || 1, cssW = canvas.clientWidth || 420, s = cssW * dpr / PAGE.w;
    canvas.width = Math.round(PAGE.w * s); canvas.height = Math.round(PAGE.h * s);
    var ctx = canvas.getContext('2d'); ctx.setTransform(s, 0, 0, s, 0, 0);
    var G = grid(g.L), list = tickets.slice(0, G.per);
    drawPage(canvasPainter(ctx), g, list, 1, Math.max(1, Math.ceil(tickets.length / G.per)));
  }

  async function pdf(g, tickets, onProgress) {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    var P = pdfPainter(doc), G = grid(g.L), pages = Math.ceil(tickets.length / G.per);
    for (var p = 0; p < pages; p++) {
      if (p) doc.addPage();
      drawPage(P, g, tickets.slice(p * G.per, (p + 1) * G.per), p + 1, pages);
      if (onProgress && (p % 4 === 3 || p === pages - 1)) { onProgress(p + 1, pages); await new Promise(function (r) { setTimeout(r, 0); }); }
    }
    doc.setProperties({ title: 'Lucky tickets No. ' + tickets[0].no + ' - ' + tickets[tickets.length - 1].no, creator: 'samgoe-cc.or.kr' });
    return doc.output('blob');
  }

  window.LuckyPrint = { LAYOUTS: LAYOUTS, url: url, fmtCode: fmtCode, padNo: padNo, prepare: prepare, preview: preview, pdf: pdf, grid: grid };
})();
