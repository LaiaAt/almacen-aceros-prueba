/*! Mini generador de PDF (solo texto y recuadros, fuente Helvetica) */
(function (root) {
  'use strict';
  var W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var AC = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N', 'ü': 'u' };
  function Pdf(titulo, autor) { this.pages = []; this.cur = null; this.titulo = titulo || ''; this.autor = autor || ''; this.H = 842; this.W = 595; }
  Pdf.prototype.nueva = function () { this.cur = []; this.pages.push(this.cur); return this; };
  Pdf.prototype.ancho = function (s, size, bold) {
    var t = 0; s = String(s);
    for (var i = 0; i < s.length; i++) { var ch = AC[s[i]] || s[i], c = ch.charCodeAt(0); t += (c >= 32 && c <= 126) ? W[c - 32] : 556; }
    return t * size / 1000 * (bold ? 1.07 : 1);
  };
  function enc(s) {
    s = String(s).replace(/[  ]/g, ' ').replace(/—/g, '\x97').replace(/–/g, '\x96').replace(/•/g, '\x95');
    var o = '';
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i), ch = s[i]; if (c > 255) ch = '?'; if (ch === '\\' || ch === '(' || ch === ')') ch = '\\' + ch; o += ch; }
    return o;
  }
  function col(c) { return c[0].toFixed(3) + ' ' + c[1].toFixed(3) + ' ' + c[2].toFixed(3); }
  Pdf.prototype.texto = function (x, y, s, size, bold, c) {
    this.cur.push('BT /F' + (bold ? 2 : 1) + ' ' + size + ' Tf ' + col(c || [0, 0, 0]) + ' rg ' + x.toFixed(2) + ' ' + (this.H - y).toFixed(2) + ' Td (' + enc(s) + ') Tj ET');
  };
  Pdf.prototype.rect = function (x, y, w, h, fill, borde) {
    var yy = (this.H - y - h).toFixed(2), g = x.toFixed(2) + ' ' + yy + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re';
    if (fill) this.cur.push(col(fill) + ' rg ' + g + ' f');
    if (borde) this.cur.push('0.6 w ' + col(borde) + ' RG ' + g + ' S');
  };
  Pdf.prototype.linea = function (x1, y1, x2, y2) { this.cur.push('0.6 w 0 0 0 RG ' + x1.toFixed(2) + ' ' + (this.H - y1).toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + (this.H - y2).toFixed(2) + ' l S'); };
  /** Parte el texto en líneas que caben en `w` puntos (también parte palabras muy largas). */
  Pdf.prototype.partir = function (s, w, size, bold) {
    var self = this, L = [], cur = '';
    String(s).split(' ').forEach(function (p) {
      while (self.ancho(p, size, bold) > w) {
        var k = p.length; while (k > 1 && self.ancho(p.slice(0, k), size, bold) > w) k--;
        if (cur) { L.push(cur); cur = ''; }
        L.push(p.slice(0, k)); p = p.slice(k);
      }
      var t = cur ? cur + ' ' + p : p;
      if (self.ancho(t, size, bold) <= w) cur = t; else { if (cur) L.push(cur); cur = p; }
    });
    if (cur || !L.length) L.push(cur);
    return L;
  };
  Pdf.prototype.salida = function () {
    var self = this, objs = [], n = this.pages.length;
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    var kids = []; for (var i = 0; i < n; i++) kids.push((6 + 2 * i) + ' 0 R');
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objs[5] = '<< /Title (' + enc(this.titulo) + ') /Author (' + enc(this.autor) + ') /Producer (Almacén de aceros) >>';
    this.pages.forEach(function (p, i) {
      var cont = p.join('\n');
      objs[6 + 2 * i] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + self.W + ' ' + self.H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (7 + 2 * i) + ' 0 R >>';
      objs[7 + 2 * i] = '<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream';
    });
    var out = '%PDF-1.4\n', off = [];
    for (var k = 1; k < objs.length; k++) { off[k] = out.length; out += k + ' 0 obj\n' + objs[k] + '\nendobj\n'; }
    var x0 = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (k = 1; k < objs.length; k++) out += ('0000000000' + off[k]).slice(-10) + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + x0 + '\n%%EOF';
    var u = new Uint8Array(out.length); for (k = 0; k < out.length; k++) u[k] = out.charCodeAt(k) & 255;
    return u;
  };
  root.MiniPdf = Pdf;
})(typeof self !== 'undefined' ? self : this);
