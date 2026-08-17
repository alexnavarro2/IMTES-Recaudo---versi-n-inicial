'use strict';
/* ==========================================================================
   IMTES · Seguimiento del Sistema de Recaudo
   Aplicación estática de una sola página. Todo el procesamiento es local.
   Organización del código (búsqueda rápida por encabezado de sección):
   0. CONFIG Y ESTADO GLOBAL
   1. UTILIDADES
   2. CARGA DE ARCHIVOS (loaders)
   3. NORMALIZACIÓN Y DEDUPLICACIÓN
   4. CONSOLIDACIÓN (merge histórico + sábanas, corte, líneas)
   5. AGREGACIONES (resumen, cierre, resto, semanal, oxxo/caus)
   6. HALLAZGOS AUTOMÁTICOS
   7. RENDERING (tabs, tablas, kpis, gráficas)
   8. EXPORTACIÓN EXCEL
   9. EXPORTACIÓN POWERPOINT
   10. WIRING / INIT
   ========================================================================== */

/* ==========================================================================
   0. CONFIG Y ESTADO GLOBAL
   ========================================================================== */
const COLORS = {
  vino: '#960E53',
  vinoOscuro: '#410324',
  naranja: '#DC7F37',
  rojoAux1: '#B94645',
  rojoAux2: '#9B2F3E',
  verde: '#1B7F4A',
  rojo: '#B91C1C',
  grisFondo: '#F8F8F8',
  azulClaro: '#EAF2F8',
  y2024: '#AFC2D9',
};

const CLOSURE_SUGGESTED = [3, 8, 9, 14, 16, 18, 22];

const CAMPAIGN_DEFAULTS = {
  16: { inicio: 15, retiro: 16, etiqueta: 'Campaña Línea 16' },
  9:  { inicio: 16, retiro: null, etiqueta: 'Campaña Línea 9' },
  22: { inicio: 16, retiro: null, etiqueta: 'Campaña Línea 22' },
  3:  { inicio: 21, retiro: null, etiqueta: 'Campaña Línea 3' },
  8:  { inicio: 24, retiro: null, etiqueta: 'Campaña Línea 8' },
  14: { inicio: 24, retiro: null, etiqueta: 'Campaña Línea 14' },
  18: { inicio: 25, retiro: null, etiqueta: 'Campaña Línea 18' },
  15: { inicio: 28, retiro: null, etiqueta: 'Campaña Línea 15' },
};

// Claves de ramal válidas conocidas (usadas solo como referencia para el diccionario de excepciones;
// cualquier clave numérica se acepta, esta lista ayuda a detectar anomalías raras / no numéricas)
const REQUIRED_HIST_COLS = ['AÑO', 'SEMANA', 'LINEA', 'ASCENSOS'];
const REQUIRED_SABANA_COLS = ['FECHA', 'UNIDAD', 'RUTA', 'ASCENSOS', 'EFECTIVO', 'VALIDACIONES TOTALES'];

const STATE = {
  historical: { rows: [], stats: null, loaded: false, fileNames: [] },
  sabanas: { rawRows: [], aggRows: [], stats: null, loaded: false, fileNames: [] },
  oxxo: { detail: [], weekly: [], stats: null, loaded: false, fileNames: [], porArchivo: {} },
  oxxoPrev: { weekly: [], loaded: false },
  caus: { rows: [], weekly: [], puntoVenta: [], stats: null, loaded: false, fileNames: [] },
  causPrev: { weekly: [], loaded: false },

  consolidated: [],           // filas AÑO+SEMANA+RUTA fusionadas (histórico + sábanas)
  cutoff: { anio: null, semana: null },
  allLineasBase: [],          // líneas base detectadas, ordenadas
  lineExceptions: {},         // RUTA (string) -> {linea: number|null, action: 'auto'|'override'|'exclude'}
  closureLines: new Set(CLOSURE_SUGGESTED),
  campaigns: JSON.parse(JSON.stringify(CAMPAIGN_DEFAULTS)),
  evoSelectedLines: new Set(),

  quality: { issues: [] },    // {level:'info'|'warn'|'err', source, message}
  charts: {},                 // registro de instancias Chart.js para destruir antes de recrear
};

/* ==========================================================================
   1. UTILIDADES
   ========================================================================== */

function normHeader(h) {
  if (h === null || h === undefined) return '';
  return String(h)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .trim().toUpperCase().replace(/\s+/g, ' ');
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === '' || s === '-' || /^N\/?D$/i.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.,\-]/g, '');
  // tolera "1,234.56" y "1.234,56"
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) { s = s.replace(/\./g, '').replace(',', '.'); }
    else { s = s.replace(/,/g, ''); }
  } else if (s.indexOf(',') > -1) {
    // decide si la coma es decimal o separador de miles
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

function excelSerialToDate(serial) {
  // Sistema de fechas Excel (1900), corrige el bug del año bisiesto 1900
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  return new Date(utcMs);
}

function parseDateFlexible(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number') {
    if (v > 20000 && v < 60000) return excelSerialToDate(v);
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return isNaN(dt) ? null : dt;
  }
  // YYYY-MM-DD or YYYY/MM/DD
  let mm = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (mm) { const dt = new Date(Date.UTC(+mm[1], +mm[2] - 1, +mm[3])); return isNaN(dt) ? null : dt; }
  // DD-MM-YYYY or DD/MM/YYYY
  mm = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (mm) { const dt = new Date(Date.UTC(+mm[3], +mm[2] - 1, +mm[1])); return isNaN(dt) ? null : dt; }
  const generic = new Date(s);
  return isNaN(generic) ? null : generic;
}

// Semana ISO-8601 estándar
function isoWeekYear(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jueves de esa semana
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const isoWeek = Math.round((d - week1Monday) / (7 * 86400000)) + 1;
  return { isoYear, isoWeek };
}

function cleanRuta(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  s = s.replace(/\.0+$/, ''); // quita ".0" residual de Excel
  s = s.replace(/\s+/g, '');
  return s || null;
}

function lineaBaseOf(rutaStr) {
  if (rutaStr === null || rutaStr === undefined) return null;
  const s = String(rutaStr).trim();
  if (!/^\d+$/.test(s)) return null; // clave no puramente numérica -> excepción
  const n = parseInt(s, 10);
  if (!isFinite(n) || n <= 0) return null;
  return Math.floor(n / 100);
}

function safeDiv(a, b) {
  if (a === null || a === undefined || b === null || b === undefined || b === 0) return null;
  const r = a / b;
  return isFinite(r) ? r : null;
}

function fmtMoney(v, dec) {
  if (v === null || v === undefined || isNaN(v)) return 'N/D';
  dec = dec === undefined ? 2 : dec;
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtMoneyShort(v) {
  if (v === null || v === undefined || isNaN(v)) return 'N/D';
  const abs = Math.abs(v);
  if (abs >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return '$' + (v / 1000).toFixed(0) + 'k';
  return '$' + v.toFixed(0);
}
function fmtInt(v) {
  if (v === null || v === undefined || isNaN(v)) return 'N/D';
  return Math.round(v).toLocaleString('en-US');
}
function fmtPct(v, dec) {
  if (v === null || v === undefined || isNaN(v)) return 'N/D';
  dec = dec === undefined ? 1 : dec;
  return (v * 100).toFixed(dec) + '%';
}
function fmtSigned(v, isPct, dec) {
  if (v === null || v === undefined || isNaN(v)) return 'N/D';
  const sign = v >= 0 ? '+' : '';
  if (isPct) return sign + (v * 100).toFixed(dec === undefined ? 1 : dec) + '%';
  return sign + v.toFixed(dec === undefined ? 1 : dec);
}
function deltaClass(v) {
  if (v === null || v === undefined || isNaN(v)) return 'na';
  return v >= 0 ? 'pos' : 'neg';
}

function addQuality(level, source, message) {
  STATE.quality.issues.push({ level, source, message });
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fileExt(name) {
  const m = /\.([^.]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function destroyChart(id) {
  if (STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; }
}

/* ==========================================================================
   2. CARGA DE ARCHIVOS
   ========================================================================== */

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        resolve(wb);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file, 'latin1'); // los DAT suelen venir en ANSI/latin1
  });
}

function sheetToRows(ws) {
  // matriz de valores crudos (array de arrays), sin asumir encabezados
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

// -------------------- A. BASE HISTÓRICA --------------------
async function handleHistoricoFile(file) {
  setProgress('progHistorico', 15);
  const stats = { archivo: file.name, filasLeidas: 0, filasValidas: 0, filasDescartadas: 0, advertencias: [], rangoFechas: null, semanas: new Set() };
  try {
    const wb = await readWorkbook(file);
    setProgress('progHistorico', 45);
    let sheetName = wb.SheetNames.find(n => normHeader(n) === 'SEMANA_ANO_LINEA' || normHeader(n).replace(/O/, 'A') === 'SEMANA_ANO_LINEA' || normHeader(n).indexOf('SEMANA') > -1 && normHeader(n).indexOf('LINEA') > -1);
    if (!sheetName) sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const matrix = sheetToRows(ws);
    if (!matrix.length) throw new Error('La hoja "' + sheetName + '" está vacía.');

    const headerRow = matrix[0].map(normHeader);
    const idx = {};
    headerRow.forEach((h, i) => { if (h) idx[h] = i; });

    // tolera variantes de encabezado
    const findCol = (...names) => {
      for (const n of names) if (idx[n] !== undefined) return idx[n];
      // variante: contiene "VALIDACIONES" -> VALIDACIONES TOTALES
      for (const key in idx) {
        for (const n of names) if (key.indexOf(n) > -1) return idx[key];
      }
      return -1;
    };
    const col = {
      anio: findCol('AÑO', 'ANO', 'ANIO'),
      semana: findCol('SEMANA'),
      linea: findCol('LINEA'),
      dineroFisico: findCol('DINERO FISICO'),
      evasion: findCol('EVASION'),
      ascensos: findCol('ASCENSOS'),
      descensos: findCol('DESCENSOS'),
      validaciones: findCol('VALIDACIONES TOTALES', 'VALIDACIONES'),
      pctPagoElec: findCol('PORCENTAJE PAGO ELECTRONICO'),
      discapacidad: findCol('DISCAPACIDAD'),
      estudiante: findCol('ESTUDIANTE GRATUITO') > -1 ? findCol('ESTUDIANTE') : findCol('ESTUDIANTE'),
      estudianteGratis: findCol('ESTUDIANTE GRATUITO'),
      normal: findCol('NORMAL'),
      terceraEdad: findCol('TERCERA EDAD'),
      ingresoElec: findCol('INGRESO ELECTRONICO'),
      ingresoTotalInt: findCol('INGRESO TOTAL INTEGRADO'),
      efectivoSabana: findCol('EFECTIVO SABANA'),
      ingresoTotalSabana: findCol('INGRESO TOTAL SABANA'),
      unidadesActivas: findCol('UNIDADES ACTIVAS'),
      diasConDatos: findCol('DIAS CON DATOS'),
      fuenteMovilidad: findCol('FUENTE MOVILIDAD'),
    };
    // corrige columna ESTUDIANTE (evita que confunda con ESTUDIANTE GRATUITO)
    col.estudiante = idx['ESTUDIANTE'] !== undefined ? idx['ESTUDIANTE'] : -1;

    const missing = [];
    if (col.anio < 0) missing.push('AÑO');
    if (col.semana < 0) missing.push('SEMANA');
    if (col.linea < 0) missing.push('LINEA');
    if (col.ascensos < 0) missing.push('ASCENSOS');
    if (missing.length) throw new Error('Faltan columnas requeridas en "' + sheetName + '": ' + missing.join(', '));

    const rows = [];
    let minDate = null, maxDate = null;
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.every(c => c === null || c === '')) continue;
      stats.filasLeidas++;
      const anio = toNumber(row[col.anio]);
      const semana = toNumber(row[col.semana]);
      const rutaRaw = row[col.linea];
      const ruta = cleanRuta(rutaRaw);
      if (anio === null || semana === null || !ruta) { stats.filasDescartadas++; continue; }
      stats.filasValidas++;
      stats.semanas.add(anio + '-' + semana);
      rows.push({
        ANIO: anio, SEMANA: semana, RUTA: ruta,
        DINERO_FISICO: col.dineroFisico > -1 ? toNumber(row[col.dineroFisico]) : null,
        EVASION: col.evasion > -1 ? toNumber(row[col.evasion]) : null,
        ASCENSOS: toNumber(row[col.ascensos]),
        DESCENSOS: col.descensos > -1 ? toNumber(row[col.descensos]) : null,
        VALIDACIONES_TOTALES: col.validaciones > -1 ? toNumber(row[col.validaciones]) : null,
        DISCAPACIDAD: col.discapacidad > -1 ? toNumber(row[col.discapacidad]) : null,
        ESTUDIANTE: col.estudiante > -1 ? toNumber(row[col.estudiante]) : null,
        ESTUDIANTE_GRATUITO: col.estudianteGratis > -1 ? toNumber(row[col.estudianteGratis]) : null,
        NORMAL: col.normal > -1 ? toNumber(row[col.normal]) : null,
        TERCERA_EDAD: col.terceraEdad > -1 ? toNumber(row[col.terceraEdad]) : null,
        INGRESO_ELECTRONICO: col.ingresoElec > -1 ? toNumber(row[col.ingresoElec]) : null,
        INGRESO_TOTAL_INTEGRADO: col.ingresoTotalInt > -1 ? toNumber(row[col.ingresoTotalInt]) : null,
        UNIDADES_ACTIVAS: col.unidadesActivas > -1 ? toNumber(row[col.unidadesActivas]) : null,
        FUENTE: 'HISTORICO',
        ARCHIVO_ORIGEN: file.name,
      });
    }
    setProgress('progHistorico', 85);
    STATE.historical.rows = rows;
    STATE.historical.loaded = true;
    STATE.historical.fileNames = [file.name];
    stats.rangoAnios = Array.from(new Set(rows.map(r => r.ANIO))).sort((a, b) => a - b);
    stats.hoja = sheetName;
    STATE.historical.stats = stats;
    addQuality('info', 'Base histórica', 'Cargada correctamente desde la hoja "' + sheetName + '": ' + stats.filasValidas + ' filas válidas, ' + stats.filasDescartadas + ' descartadas.');
    setProgress('progHistorico', 100);
  } catch (err) {
    addQuality('err', 'Base histórica', 'Error al procesar "' + file.name + '": ' + err.message);
    stats.error = err.message;
    STATE.historical.stats = stats;
    setProgress('progHistorico', 100);
  }
  renderStatsBlock('statsHistorico', STATE.historical.stats, STATE.historical.loaded);
}

// -------------------- B. SÁBANAS SEMANALES --------------------
async function handleSabanaFiles(fileList) {
  const files = Array.from(fileList);
  const aggStats = { archivos: files.length, filasLeidas: 0, filasValidas: 0, filasDescartadas: 0, duplicados: 0, advertencias: [], semanas: new Set() };
  let allRaw = STATE.sabanas.rawRows.slice();
  let idxCount = 0;
  for (const file of files) {
    idxCount++;
    setProgress('progSabanas', Math.round((idxCount - 0.5) / files.length * 100));
    try {
      const wb = await readWorkbook(file);
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const matrix = sheetToRows(ws);

      // detecta automáticamente la fila de encabezados (tolera filas/columnas vacías previas)
      let headerRowIdx = -1, colOffset = 0;
      const need = ['FECHA', 'UNIDAD', 'RUTA'];
      for (let r = 0; r < Math.min(matrix.length, 25); r++) {
        const rowNorm = (matrix[r] || []).map(normHeader);
        const hits = need.filter(n => rowNorm.indexOf(n) > -1).length;
        if (hits >= 2) { headerRowIdx = r; break; }
      }
      if (headerRowIdx === -1) {
        addQuality('err', 'Sábanas', 'No se detectó fila de encabezados en "' + file.name + '". Se omite el archivo.');
        continue;
      }
      const headerRow = matrix[headerRowIdx].map(normHeader);
      const idx = {};
      headerRow.forEach((h, i) => { if (h) idx[h] = i; });
      const findCol = (...names) => {
        for (const n of names) if (idx[n] !== undefined) return idx[n];
        for (const key in idx) for (const n of names) if (key.indexOf(n) > -1) return idx[key];
        return -1;
      };
      const col = {
        fecha: findCol('FECHA'),
        unidad: findCol('UNIDAD'),
        ruta: findCol('RUTA'),
        ascensos: findCol('ASCENSOS'),
        efectivo: findCol('EFECTIVO'),
        validaciones: findCol('VALIDACIONES TOTALES', 'VALIDACIONES'),
        discapacidad: findCol('DISCAPACIDAD'),
        estudiante: idx['ESTUDIANTE'] !== undefined ? idx['ESTUDIANTE'] : -1,
        estudianteGratis: findCol('ESTUDIANTE GRATUITO'),
        normal: findCol('NORMAL'),
        terceraEdad: findCol('TERCERA EDAD'),
        gobierno: findCol('GOBIERNO'),
      };
      const missing = [];
      if (col.fecha < 0) missing.push('FECHA');
      if (col.unidad < 0) missing.push('UNIDAD');
      if (col.ruta < 0) missing.push('RUTA');
      if (missing.length) {
        addQuality('err', 'Sábanas', 'Faltan columnas en "' + file.name + '": ' + missing.join(', ') + '. Se omite el archivo.');
        continue;
      }

      let fileValid = 0, fileDiscard = 0;
      for (let r = headerRowIdx + 1; r < matrix.length; r++) {
        const row = matrix[r];
        if (!row || row.every(c => c === null || c === '')) continue;
        aggStats.filasLeidas++;
        const fecha = parseDateFlexible(row[col.fecha]);
        const ruta = cleanRuta(row[col.ruta]);
        if (!fecha || !ruta) { aggStats.filasDescartadas++; fileDiscard++; continue; }
        const { isoYear, isoWeek } = isoWeekYear(fecha);
        fileValid++;
        aggStats.semanas.add(isoYear + '-' + isoWeek);
        allRaw.push({
          FECHA: fecha.toISOString().slice(0, 10),
          ANIO_ISO: isoYear, SEMANA_ISO: isoWeek,
          UNIDAD: cleanRuta(row[col.unidad]) || String(row[col.unidad] || ''),
          RUTA: ruta,
          ASCENSOS: col.ascensos > -1 ? (toNumber(row[col.ascensos]) || 0) : 0,
          EFECTIVO: col.efectivo > -1 ? (toNumber(row[col.efectivo]) || 0) : 0,
          VALIDACIONES_TOTALES: col.validaciones > -1 ? (toNumber(row[col.validaciones]) || 0) : 0,
          DISCAPACIDAD: col.discapacidad > -1 ? (toNumber(row[col.discapacidad]) || 0) : 0,
          ESTUDIANTE: col.estudiante > -1 ? (toNumber(row[col.estudiante]) || 0) : 0,
          ESTUDIANTE_GRATUITO: col.estudianteGratis > -1 ? (toNumber(row[col.estudianteGratis]) || 0) : 0,
          NORMAL: col.normal > -1 ? (toNumber(row[col.normal]) || 0) : 0,
          TERCERA_EDAD: col.terceraEdad > -1 ? (toNumber(row[col.terceraEdad]) || 0) : 0,
          GOBIERNO: col.gobierno > -1 ? (toNumber(row[col.gobierno]) || 0) : 0,
          ARCHIVO_ORIGEN: file.name,
        });
      }
      aggStats.filasValidas += fileValid;
      if (fileValid === 0) addQuality('warn', 'Sábanas', 'El archivo "' + file.name + '" no aportó filas válidas.');
      STATE.sabanas.fileNames.push(file.name);
    } catch (err) {
      addQuality('err', 'Sábanas', 'Error al procesar "' + file.name + '": ' + err.message);
    }
    setProgress('progSabanas', Math.round(idxCount / files.length * 100));
    await new Promise(r => setTimeout(r, 0)); // cede el hilo de UI
  }

  // deduplicación exacta
  const seen = new Set();
  const deduped = [];
  for (const row of allRaw) {
    const key = [row.FECHA, row.UNIDAD, row.RUTA, row.ASCENSOS, row.EFECTIVO, row.VALIDACIONES_TOTALES,
      row.DISCAPACIDAD, row.ESTUDIANTE, row.ESTUDIANTE_GRATUITO, row.NORMAL, row.TERCERA_EDAD].join('|');
    if (seen.has(key)) { aggStats.duplicados++; continue; }
    seen.add(key);
    deduped.push(row);
  }
  STATE.sabanas.rawRows = deduped;

  // cálculo de ingreso y agregación por AÑO ISO + SEMANA ISO + RUTA
  const groups = {};
  deduped.forEach(row => {
    const ingresoElec = (row.DISCAPACIDAD * 5) + (row.ESTUDIANTE * 5) + (row.NORMAL * 9) + (row.TERCERA_EDAD * 5);
    const ingresoTotal = row.EFECTIVO + ingresoElec;
    const key = row.ANIO_ISO + '|' + row.SEMANA_ISO + '|' + row.RUTA;
    if (!groups[key]) {
      groups[key] = {
        ANIO: row.ANIO_ISO, SEMANA: row.SEMANA_ISO, RUTA: row.RUTA,
        DINERO_FISICO: 0, ASCENSOS: 0, VALIDACIONES_TOTALES: 0,
        DISCAPACIDAD: 0, ESTUDIANTE: 0, ESTUDIANTE_GRATUITO: 0, NORMAL: 0, TERCERA_EDAD: 0,
        INGRESO_ELECTRONICO: 0, INGRESO_TOTAL_INTEGRADO: 0,
        FUENTE: 'SABANA', ARCHIVO_ORIGEN: row.ARCHIVO_ORIGEN,
      };
    }
    const g = groups[key];
    g.DINERO_FISICO += row.EFECTIVO;
    g.ASCENSOS += row.ASCENSOS;
    g.VALIDACIONES_TOTALES += row.VALIDACIONES_TOTALES;
    g.DISCAPACIDAD += row.DISCAPACIDAD;
    g.ESTUDIANTE += row.ESTUDIANTE;
    g.ESTUDIANTE_GRATUITO += row.ESTUDIANTE_GRATUITO;
    g.NORMAL += row.NORMAL;
    g.TERCERA_EDAD += row.TERCERA_EDAD;
    g.INGRESO_ELECTRONICO += ingresoElec;
    g.INGRESO_TOTAL_INTEGRADO += ingresoTotal;
  });
  STATE.sabanas.aggRows = Object.values(groups);
  STATE.sabanas.loaded = STATE.sabanas.aggRows.length > 0;
  aggStats.semanasDetectadas = Array.from(aggStats.semanas).sort();
  STATE.sabanas.stats = aggStats;
  addQuality('info', 'Sábanas', aggStats.filasValidas + ' filas válidas de ' + aggStats.filasLeidas + ' leídas; ' +
    aggStats.duplicados + ' duplicados eliminados; agregadas en ' + STATE.sabanas.aggRows.length + ' combinaciones año-semana-ruta.');
  renderStatsBlock('statsSabanas', aggStats, STATE.sabanas.loaded);
}

// -------------------- C. ARCHIVOS OXXO (.DAT) --------------------
async function handleOxxoFiles(fileList) {
  const files = Array.from(fileList);
  const stats = { archivos: files.length, filasLeidas: 0, filasValidas: 0, filasDescartadas: 0, semanas: new Set() };
  const detail = STATE.oxxo.detail.slice();
  const porArchivo = STATE.oxxo.porArchivo || {};
  let idxCount = 0;
  for (const file of files) {
    idxCount++;
    setProgress('progOxxo', Math.round((idxCount - 0.5) / files.length * 100));
    const fa = { archivo: file.name, filasLeidas: 0, filasDescartadasFormato: 0, filasDescartadasTarjeta: 0, filasDescartadasFechaImporte: 0, filasValidas: 0, monto: 0, semanas: new Set() };
    try {
      const text = await readText(file);
      const lines = text.split(/\r\n|\r|\n/);
      for (const line of lines) {
        if (!line || !line.trim()) continue;
        stats.filasLeidas++; fa.filasLeidas++;
        const parts = line.split(',');
        if (parts.length < 7) { stats.filasDescartadas++; fa.filasDescartadasFormato++; continue; }
        const [zona, sucursal, fechaRaw, hora, folio, tarjeta, importeRaw] = parts;
        const tarjeta2 = String(tarjeta || '').slice(0, 14);
        if (!tarjeta2.startsWith('04')) { stats.filasDescartadas++; fa.filasDescartadasTarjeta++; continue; }
        const fecha = parseDateFlexible(fechaRaw);
        const importe = toNumber(importeRaw);
        if (!fecha || importe === null) { stats.filasDescartadas++; fa.filasDescartadasFechaImporte++; continue; }
        const { isoYear, isoWeek } = isoWeekYear(fecha);
        stats.filasValidas++; fa.filasValidas++; fa.monto += importe; fa.semanas.add(isoYear + '-' + isoWeek);
        stats.semanas.add(isoYear + '-' + isoWeek);
        detail.push({ ZONA: zona, SUCURSAL: sucursal, FECHA: fecha.toISOString().slice(0, 10), ANIO_ISO: isoYear, SEMANA_ISO: isoWeek, FOLIO: folio, IMPORTE: importe, ARCHIVO_ORIGEN: file.name });
      }
      STATE.oxxo.fileNames.push(file.name);
    } catch (err) {
      addQuality('err', 'OXXO', 'Error al procesar "' + file.name + '": ' + err.message);
    }
    porArchivo[file.name] = fa;
    setProgress('progOxxo', Math.round(idxCount / files.length * 100));
    await new Promise(r => setTimeout(r, 0));
  }
  STATE.oxxo.detail = detail;
  STATE.oxxo.porArchivo = porArchivo;
  // agregación semanal
  const groups = {};
  detail.forEach(r => {
    const key = r.ANIO_ISO + '|' + r.SEMANA_ISO;
    if (!groups[key]) groups[key] = { ANIO: r.ANIO_ISO, SEMANA: r.SEMANA_ISO, OPERACIONES: 0, MONTO: 0 };
    groups[key].OPERACIONES += 1;
    groups[key].MONTO += r.IMPORTE;
  });
  STATE.oxxo.weekly = Object.values(groups).sort((a, b) => a.ANIO - b.ANIO || a.SEMANA - b.SEMANA);
  STATE.oxxo.loaded = STATE.oxxo.weekly.length > 0;
  stats.semanasDetectadas = Array.from(stats.semanas).sort();
  STATE.oxxo.stats = stats;
  if (STATE.oxxo.loaded) {
    addQuality('info', 'OXXO', stats.filasValidas + ' registros válidos (tarjeta con prefijo 04) de ' + stats.filasLeidas + ' leídos, agregados en ' + STATE.oxxo.weekly.length + ' semanas.');
    // Desglose por archivo: para poder comparar directo contra el pipeline de Colab
    // fila por fila si algún archivo se ve con un total sospechosamente bajo o en cero.
    Object.values(porArchivo).forEach(fa => {
      const semanasTxt = Array.from(fa.semanas).sort().join(', ') || 'ninguna';
      let msg = fa.archivo + ': ' + fa.filasValidas + '/' + fa.filasLeidas + ' filas válidas · $' + fa.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' · semanas: ' + semanasTxt;
      if (fa.filasDescartadasFechaImporte > 0) msg += ' · ⚠️ ' + fa.filasDescartadasFechaImporte + ' filas con fecha/importe no reconocido';
      addQuality(fa.filasValidas === 0 ? 'warn' : 'info', 'OXXO · detalle por archivo', msg);
    });
  } else {
    addQuality('warn', 'OXXO', 'No se detectaron registros válidos con prefijo de tarjeta "04" en los archivos cargados.');
  }
  renderStatsBlock('statsOxxo', stats, STATE.oxxo.loaded);
}

// -------------------- D. REPORTES CAUS --------------------
// Soporta dos formatos de entrada, ya que "el formato puede variar":
//  (a) Formato tabular ya etiquetado con año/semana ISO y punto de venta como columnas
//      (encabezados tipo AÑO_ISO / SEMANA_ISO / PUNTO_DE_VENTA en una fila de encabezado normal).
//  (b) Formato de "Reporte de Puntos de Venta y Recarga" de una sola semana, con etiquetas
//      "Fecha Inicio"/"Fecha Fin" dispersas y una columna "Punto de Venta" terminada en "Totales".
function findTabularCausSheet(wb) {
  for (const sheetName of wb.SheetNames) {
    const matrix = sheetToRows(wb.Sheets[sheetName]);
    if (!matrix.length) continue;
    const header = matrix[0].map(normHeader);
    const idx = {};
    header.forEach((h, i) => { if (h) idx[h] = i; });
    const findCol = (...names) => { for (const n of names) if (idx[n] !== undefined) return idx[n]; for (const key in idx) for (const n of names) if (key.indexOf(n) > -1) return idx[key]; return -1; };
    const cPv = findCol('PUNTO_DE_VENTA', 'PUNTO DE VENTA');
    const cAnio = findCol('ANO_ISO', 'ANIO_ISO', 'AÑO_ISO', 'ANO ISO', 'AÑO ISO');
    const cSem = findCol('SEMANA_ISO', 'SEMANA ISO');
    if (cPv > -1 && cAnio > -1 && cSem > -1) {
      return {
        sheetName, matrix,
        cPv, cAnio, cSem,
        cVentaCant: findCol('VENTAS_TARJETAS_CANTIDAD', 'VENTA TARJETAS CANTIDAD', 'CANTIDAD VENTA'),
        cVentaMonto: findCol('VENTAS_TARJETAS_MONTO', 'VENTA TARJETAS MONTO', 'MONTO VENTA'),
        cRecargaCant: findCol('RECARGAS_TARJETAS_CANTIDAD', 'RECARGA TARJETAS CANTIDAD', 'CANTIDAD RECARGA'),
        cRecargaMonto: findCol('RECARGAS_TARJETAS_MONTO', 'RECARGA TARJETAS MONTO', 'MONTO RECARGA'),
        cIngreso: findCol('INGRESO_CAUS', 'INGRESO CAUS'),
      };
    }
  }
  return null;
}

async function handleCausFiles(fileList) {
  const files = Array.from(fileList);
  const stats = { archivos: files.length, filasLeidas: 0, filasValidas: 0, filasDescartadas: 0, semanas: new Set(), advertencias: [] };
  const rows = STATE.caus.rows.slice();
  let idxCount = 0;
  for (const file of files) {
    idxCount++;
    setProgress('progCaus', Math.round((idxCount - 0.5) / files.length * 100));
    try {
      const wb = await readWorkbook(file);
      const tabular = findTabularCausSheet(wb);

      if (tabular) {
        // -------- formato (a): tabular con año/semana ISO ya etiquetados --------
        const { matrix, cPv, cAnio, cSem, cVentaCant, cVentaMonto, cRecargaCant, cRecargaMonto, cIngreso } = tabular;
        let fileValid = 0;
        for (let r = 1; r < matrix.length; r++) {
          const row = matrix[r];
          if (!row || row.every(c => c === null || c === '')) continue;
          stats.filasLeidas++;
          const pv = row[cPv];
          const anio = toNumber(row[cAnio]);
          const sem = toNumber(row[cSem]);
          if (!pv || anio === null || sem === null) { stats.filasDescartadas++; continue; }
          const montoVenta = cVentaMonto > -1 ? (toNumber(row[cVentaMonto]) || 0) : 0;
          const montoRecarga = cRecargaMonto > -1 ? (toNumber(row[cRecargaMonto]) || 0) : 0;
          let ingresoCaus = montoVenta + montoRecarga;
          if (cIngreso > -1) { const direct = toNumber(row[cIngreso]); if (direct !== null) ingresoCaus = direct; }
          fileValid++; stats.filasValidas++;
          stats.semanas.add(anio + '-' + sem);
          rows.push({
            ANIO_ISO: anio, SEMANA_ISO: sem, PUNTO_VENTA: String(pv).trim(),
            CANT_VENTA_TARJETAS: cVentaCant > -1 ? (toNumber(row[cVentaCant]) || 0) : 0,
            MONTO_VENTA_TARJETAS: montoVenta,
            CANT_RECARGAS: cRecargaCant > -1 ? (toNumber(row[cRecargaCant]) || 0) : 0,
            MONTO_RECARGAS: montoRecarga,
            INGRESO_CAUS: ingresoCaus, ARCHIVO_ORIGEN: file.name,
          });
        }
        if (fileValid === 0) addQuality('warn', 'CAUS', 'El archivo "' + file.name + '" (formato tabular, hoja "' + tabular.sheetName + '") no aportó filas válidas.');
        else addQuality('info', 'CAUS', 'Archivo "' + file.name + '" leído en formato tabular (hoja "' + tabular.sheetName + '"): ' + fileValid + ' filas.');
        STATE.caus.fileNames.push(file.name);
      } else {
        // -------- formato (b): reporte individual de una semana --------
        // Replica exactamente la lógica del script de referencia (extract_puntos_venta):
        // busca celdas que EMPIECEN con "fecha inicio"/"fecha fin", localiza la fecha en
        // la misma fila (a la derecha o en cualquier columna), detecta el encabezado exacto
        // "Punto de Venta", salta subtítulos/filas vacías hasta la primera fila de datos real,
        // y determina las 4 columnas numéricas a partir de esa primera fila de datos (no del
        // encabezado), no de los textos de encabezado.
        const sheetName = wb.SheetNames[0];
        const matrix = sheetToRows(wb.Sheets[sheetName]);
        const isDateValue = (v) => v instanceof Date && !isNaN(v.getTime());
        const cellText = (v) => (v === null || v === undefined) ? '' : String(v).trim().toLowerCase();

        function findDateAfterLabel(matrix, labelNorm) {
          for (let r = 0; r < matrix.length; r++) {
            const row = matrix[r] || [];
            for (let c = 0; c < row.length; c++) {
              const t = cellText(row[c]);
              if (t.indexOf(labelNorm) === 0) {
                for (let cc = c + 1; cc <= Math.min(row.length - 1, c + 15); cc++) {
                  if (isDateValue(row[cc])) return row[cc];
                }
                for (let cc = 0; cc < row.length; cc++) {
                  if (isDateValue(row[cc])) return row[cc];
                }
              }
            }
          }
          return null;
        }

        const fechaInicio = findDateAfterLabel(matrix, 'fecha inicio');
        const fechaFin = findDateAfterLabel(matrix, 'fecha fin');

        let headerRowIdx = -1, pvColIdx = -1;
        for (let r = 0; r < matrix.length && headerRowIdx === -1; r++) {
          const row = matrix[r] || [];
          for (let c = 0; c < row.length; c++) {
            if (cellText(row[c]) === 'punto de venta') { headerRowIdx = r; pvColIdx = c; break; }
          }
        }
        if (headerRowIdx === -1) {
          addQuality('err', 'CAUS', 'No se encontró la columna "Punto de Venta" en "' + file.name + '" (se probaron formato tabular y formato de reporte individual). Se omite el archivo.');
          continue;
        }

        const stopWords = new Set(['totales', 'tarjetas vendidas:', 'recargas realizadas:', 'recargas de pases:']);
        let firstDataRow = -1;
        for (let r = headerRowIdx + 1; r < matrix.length; r++) {
          const v = (matrix[r] || [])[pvColIdx];
          const t = cellText(v);
          if (t && !stopWords.has(t)) { firstDataRow = r; break; }
        }
        if (firstDataRow === -1) {
          addQuality('err', 'CAUS', 'No se encontró la primera fila de datos en "' + file.name + '". Se omite el archivo.');
          continue;
        }

        const isNumericLike = (v) => {
          if (v === null || v === undefined) return false;
          if (typeof v === 'number') return !isNaN(v);
          if (typeof v === 'string') return /^-?\d+(\.\d+)?$/.test(v.trim());
          return false;
        };
        const dataRow = matrix[firstDataRow] || [];
        const numericCols = [];
        for (let c = pvColIdx + 1; c < dataRow.length; c++) {
          if (isNumericLike(dataRow[c])) numericCols.push(c);
        }
        numericCols.sort((a, b) => a - b);
        if (numericCols.length < 4) {
          addQuality('err', 'CAUS', 'No se detectaron 4 columnas numéricas en "' + file.name + '" (detectadas: ' + numericCols.length + '). Se omite el archivo.');
          continue;
        }
        const [cVentaCant2, cVentaMonto2, cRecargaCant2, cRecargaMonto2] = numericCols;

        const refDate = fechaInicio || fechaFin;
        if (!refDate) {
          addQuality('warn', 'CAUS', 'No se encontraron "Fecha Inicio"/"Fecha Fin" en "' + file.name + '"; no fue posible asignar semana ISO. Se omite el archivo.');
          continue;
        }
        const { isoYear, isoWeek } = isoWeekYear(refDate);

        const toNum2 = (v) => {
          if (v === null || v === undefined) return 0;
          if (typeof v === 'number') return v;
          if (typeof v === 'string') { const s = v.trim().replace(/,/g, ''); return s ? (parseFloat(s) || 0) : 0; }
          return 0;
        };

        let fileValid = 0;
        for (let r = firstDataRow; r < matrix.length; r++) {
          const row = matrix[r] || [];
          const pv = row[pvColIdx];
          if (pv === null || pv === undefined) continue;
          const pvText = cellText(pv);
          if (pvText === 'totales') break;
          if (typeof pv !== 'string' || !pv.trim()) continue;
          stats.filasLeidas++;
          const cantVenta = toNum2(row[cVentaCant2]);
          const montoVenta = toNum2(row[cVentaMonto2]);
          const cantRecarga = toNum2(row[cRecargaCant2]);
          const montoRecarga = toNum2(row[cRecargaMonto2]);
          const ingresoCaus = montoVenta + montoRecarga;
          fileValid++; stats.filasValidas++;
          stats.semanas.add(isoYear + '-' + isoWeek);
          rows.push({
            ANIO_ISO: isoYear, SEMANA_ISO: isoWeek, PUNTO_VENTA: pv.trim(),
            CANT_VENTA_TARJETAS: cantVenta, MONTO_VENTA_TARJETAS: montoVenta,
            CANT_RECARGAS: cantRecarga, MONTO_RECARGAS: montoRecarga,
            INGRESO_CAUS: ingresoCaus, ARCHIVO_ORIGEN: file.name,
          });
        }
        if (fileValid === 0) addQuality('warn', 'CAUS', 'El archivo "' + file.name + '" no aportó filas válidas antes de "Totales".');
        STATE.caus.fileNames.push(file.name);
      }
    } catch (err) {
      addQuality('err', 'CAUS', 'Error al procesar "' + file.name + '": ' + err.message);
    }
    setProgress('progCaus', Math.round(idxCount / files.length * 100));
    await new Promise(r => setTimeout(r, 0));
  }
  STATE.caus.rows = rows;
  // agregación semanal total y por punto de venta
  const weeklyGroups = {};
  const pvGroups = {};
  rows.forEach(r => {
    const wk = r.ANIO_ISO + '|' + r.SEMANA_ISO;
    if (!weeklyGroups[wk]) weeklyGroups[wk] = { ANIO: r.ANIO_ISO, SEMANA: r.SEMANA_ISO, MONTO: 0 };
    weeklyGroups[wk].MONTO += r.INGRESO_CAUS;
    const pvKey = r.PUNTO_VENTA;
    if (!pvGroups[pvKey]) pvGroups[pvKey] = { PUNTO_VENTA: pvKey, MONTO: 0, SEMANAS: new Set() };
    pvGroups[pvKey].MONTO += r.INGRESO_CAUS;
    pvGroups[pvKey].SEMANAS.add(wk);
  });
  STATE.caus.weekly = Object.values(weeklyGroups).sort((a, b) => a.ANIO - b.ANIO || a.SEMANA - b.SEMANA);
  STATE.caus.puntoVenta = Object.values(pvGroups).map(p => ({ PUNTO_VENTA: p.PUNTO_VENTA, MONTO: p.MONTO, SEMANAS: p.SEMANAS.size })).sort((a, b) => b.MONTO - a.MONTO);
  STATE.caus.loaded = STATE.caus.weekly.length > 0;
  stats.semanasDetectadas = Array.from(stats.semanas).sort();
  STATE.caus.stats = stats;
  if (STATE.caus.loaded) addQuality('info', 'CAUS', stats.filasValidas + ' filas válidas agregadas en ' + STATE.caus.weekly.length + ' semanas y ' + STATE.caus.puntoVenta.length + ' puntos de venta.');
  renderStatsBlock('statsCaus', stats, STATE.caus.loaded);
}

/* ==========================================================================
   3-4. CONSOLIDACIÓN: fusión histórico+sábanas, corte, líneas
   ========================================================================== */

function isPlausibleRuta(rutaStr) {
  if (!/^\d+$/.test(rutaStr)) return false;
  const n = parseInt(rutaStr, 10);
  return n >= 100 && n <= 2299; // rango numérico plausible para ramales 101..2201
}

function consolidate() {
  STATE.quality.issues = STATE.quality.issues.filter(q => q.source === 'Base histórica' || q.source === 'Sábanas' || q.source === 'OXXO' || q.source === 'CAUS');

  const map = {}; // key ANIO|SEMANA|RUTA -> row
  STATE.historical.rows.forEach(r => { map[r.ANIO + '|' + r.SEMANA + '|' + r.RUTA] = r; });

  let inserted = 0, replaced = 0;
  STATE.sabanas.aggRows.forEach(r => {
    const key = r.ANIO + '|' + r.SEMANA + '|' + r.RUTA;
    if (map[key]) replaced++; else inserted++;
    map[key] = r; // la sábana siempre sustituye (fuente más reciente / detallada)
  });
  const kept = STATE.historical.rows.length - replaced;

  const consolidated = Object.values(map);
  STATE.consolidated = consolidated;

  // -------- detección de excepciones de clave de ruta --------
  const rutaSet = new Set(consolidated.map(r => r.RUTA));
  const exceptions = {};
  rutaSet.forEach(ruta => {
    if (!isPlausibleRuta(ruta)) {
      if (!STATE.lineExceptions[ruta]) {
        exceptions[ruta] = { ruta, action: 'exclude', overrideLinea: null };
      } else {
        exceptions[ruta] = STATE.lineExceptions[ruta];
      }
    }
  });
  STATE.lineExceptions = exceptions;

  // -------- líneas base detectadas (excluye las marcadas como 'exclude') --------
  const lineasSet = new Set();
  consolidated.forEach(r => {
    if (!isPlausibleRuta(r.RUTA)) {
      const ex = STATE.lineExceptions[r.RUTA];
      if (ex && ex.action === 'override' && ex.overrideLinea !== null) lineasSet.add(ex.overrideLinea);
      return; // excluida por defecto
    }
    lineasSet.add(lineaBaseOf(r.RUTA));
  });
  STATE.allLineasBase = Array.from(lineasSet).filter(l => l !== null).sort((a, b) => a - b);

  // ajusta selección de cierre: retiene solo líneas presentes; conserva selección previa del usuario
  const presentSet = new Set(STATE.allLineasBase);
  STATE.closureLines = new Set(Array.from(STATE.closureLines).filter(l => presentSet.has(l)));

  // -------- semana de corte: año más reciente con datos válidos, y su mayor semana --------
  let maxAnio = null;
  consolidated.forEach(r => { if (r.ASCENSOS !== null && r.ASCENSOS !== undefined) { if (maxAnio === null || r.ANIO > maxAnio) maxAnio = r.ANIO; } });
  let maxSemana = null;
  if (maxAnio !== null) {
    consolidated.forEach(r => { if (r.ANIO === maxAnio && r.ASCENSOS !== null && r.ASCENSOS !== undefined) { if (maxSemana === null || r.SEMANA > maxSemana) maxSemana = r.SEMANA; } });
  }
  STATE.cutoff = { anio: maxAnio, semana: maxSemana };

  // -------- cobertura OXXO / CAUS vs corte --------
  if (STATE.oxxo.loaded) {
    const maxOxxo = STATE.oxxo.weekly.filter(w => w.ANIO === maxAnio).reduce((m, w) => Math.max(m, w.SEMANA), 0);
    if (maxAnio !== null && maxOxxo < maxSemana) addQuality('warn', 'OXXO', 'La cobertura de OXXO llega hasta la semana ' + maxOxxo + ' de ' + maxAnio + ', antes de la semana de corte (' + maxSemana + ').');
  }
  if (STATE.caus.loaded) {
    const maxCaus = STATE.caus.weekly.filter(w => w.ANIO === maxAnio).reduce((m, w) => Math.max(m, w.SEMANA), 0);
    if (maxAnio !== null && maxCaus < maxSemana) addQuality('warn', 'CAUS', 'La cobertura de CAUS llega hasta la semana ' + maxCaus + ' de ' + maxAnio + ', antes de la semana de corte (' + maxSemana + ').');
  }

  // -------- validaciones adicionales --------
  runValidations(consolidated);

  addQuality('info', 'Consolidación', inserted + ' filas insertadas, ' + replaced + ' reemplazadas desde sábanas, ' + kept + ' conservadas del histórico sin cambios.');
  STATE.consolidationSummary = { inserted, replaced, kept };
}

function runValidations(consolidated) {
  // semanas faltantes 1..corte para el año de corte
  if (STATE.cutoff.anio !== null && STATE.cutoff.semana !== null) {
    const semanasPresentes = new Set(consolidated.filter(r => r.ANIO === STATE.cutoff.anio).map(r => r.SEMANA));
    const faltantes = [];
    for (let s = 1; s <= STATE.cutoff.semana; s++) if (!semanasPresentes.has(s)) faltantes.push(s);
    if (faltantes.length) addQuality('warn', 'Calidad', 'Semanas faltantes en ' + STATE.cutoff.anio + ' entre la 1 y la ' + STATE.cutoff.semana + ': ' + faltantes.join(', ') + '.');
  }
  // consistencia ingreso total vs físico+electrónico (tolerancia 1%)
  let inconsist = 0;
  consolidated.forEach(r => {
    if (r.INGRESO_TOTAL_INTEGRADO !== null && r.DINERO_FISICO !== null && r.INGRESO_ELECTRONICO !== null) {
      const calc = r.DINERO_FISICO + r.INGRESO_ELECTRONICO;
      const tol = Math.max(Math.abs(calc) * 0.01, 1);
      if (Math.abs(calc - r.INGRESO_TOTAL_INTEGRADO) > tol) inconsist++;
    }
  });
  if (inconsist > 0) addQuality('warn', 'Calidad', inconsist + ' filas presentan diferencias entre INGRESO TOTAL INTEGRADO y (físico + electrónico) superiores a la tolerancia (1%).');
  // validaciones > ascensos
  let overValid = 0;
  consolidated.forEach(r => { if (r.VALIDACIONES_TOTALES !== null && r.ASCENSOS !== null && r.VALIDACIONES_TOTALES > r.ASCENSOS) overValid++; });
  if (overValid > 0) addQuality('warn', 'Calidad', overValid + ' filas tienen VALIDACIONES TOTALES mayor que ASCENSOS.');
  // rutas sin clasificación
  const excCount = Object.keys(STATE.lineExceptions).length;
  if (excCount > 0) addQuality('warn', 'Calidad', excCount + ' clave(s) de ruta no siguen el patrón numérico esperado y requieren revisión manual: ' + Object.keys(STATE.lineExceptions).join(', ') + '.');
}

/* ==========================================================================
   5. AGREGACIONES
   ========================================================================== */

function rowLineaBase(r) {
  if (isPlausibleRuta(r.RUTA)) return lineaBaseOf(r.RUTA);
  const ex = STATE.lineExceptions[r.RUTA];
  if (ex && ex.action === 'override' && ex.overrideLinea !== null) return ex.overrideLinea;
  return null; // excluida
}

function ingresoTotalOf(r) {
  // usa INGRESO TOTAL INTEGRADO si está disponible y es consistente; si no, físico+electrónico
  if (r.INGRESO_TOTAL_INTEGRADO !== null && r.INGRESO_TOTAL_INTEGRADO !== undefined) {
    if (r.DINERO_FISICO !== null && r.INGRESO_ELECTRONICO !== null) {
      const calc = r.DINERO_FISICO + r.INGRESO_ELECTRONICO;
      const tol = Math.max(Math.abs(calc) * 0.01, 1);
      if (Math.abs(calc - r.INGRESO_TOTAL_INTEGRADO) <= tol) return r.INGRESO_TOTAL_INTEGRADO;
      return calc; // prioriza consistencia física+electrónica si difieren más allá de tolerancia
    }
    return r.INGRESO_TOTAL_INTEGRADO;
  }
  if (r.DINERO_FISICO !== null && r.INGRESO_ELECTRONICO !== null) return r.DINERO_FISICO + r.INGRESO_ELECTRONICO;
  return null;
}

// Agrega filas consolidadas por AÑO para un conjunto de líneas base y rango de semanas [semMin,semMax]
function aggregateSistema(years, semMin, semMax, lineaFilter) {
  const out = {};
  years.forEach(y => out[y] = { ANIO: y, ASCENSOS: 0, DINERO_FISICO: 0, INGRESO_ELECTRONICO: 0, INGRESO_TOTAL: 0, VALIDACIONES_TOTALES: 0, tieneFisico: false, tieneElec: false, tieneAscensos: false, tieneValidaciones: false });
  STATE.consolidated.forEach(r => {
    if (!years.includes(r.ANIO)) return;
    if (r.SEMANA < semMin || r.SEMANA > semMax) return;
    const lb = rowLineaBase(r);
    if (lb === null) return;
    if (lineaFilter && !lineaFilter.has(lb)) return;
    const g = out[r.ANIO];
    if (r.ASCENSOS !== null) { g.ASCENSOS += r.ASCENSOS; g.tieneAscensos = true; }
    if (r.DINERO_FISICO !== null) { g.DINERO_FISICO += r.DINERO_FISICO; g.tieneFisico = true; }
    if (r.INGRESO_ELECTRONICO !== null) { g.INGRESO_ELECTRONICO += r.INGRESO_ELECTRONICO; g.tieneElec = true; }
    if (r.VALIDACIONES_TOTALES !== null) { g.VALIDACIONES_TOTALES += r.VALIDACIONES_TOTALES; g.tieneValidaciones = true; }
    const it = ingresoTotalOf(r);
    if (it !== null) g.INGRESO_TOTAL += it;
  });
  return years.map(y => {
    const g = out[y];
    const tieneIngresoTotal = g.tieneFisico || g.tieneElec;
    // Evasión estimada: ((Ascensos - Validaciones totales) * 7) - Recaudo físico.
    // Requiere los tres insumos; si falta alguno, se reporta N/D en vez de asumir cero.
    const evasion = (g.tieneAscensos && g.tieneValidaciones && g.tieneFisico)
      ? ((g.ASCENSOS - g.VALIDACIONES_TOTALES) * 7) - g.DINERO_FISICO
      : null;
    return {
      ANIO: y,
      ASCENSOS: g.tieneAscensos ? g.ASCENSOS : null,
      DINERO_FISICO: g.tieneFisico ? g.DINERO_FISICO : null,
      INGRESO_ELECTRONICO: g.tieneElec ? g.INGRESO_ELECTRONICO : null,
      INGRESO_TOTAL: tieneIngresoTotal ? g.INGRESO_TOTAL : null,
      VALIDACIONES_TOTALES: g.tieneValidaciones ? g.VALIDACIONES_TOTALES : null,
      PARTICIPACION_ELECTRONICA: safeDiv(g.tieneElec ? g.INGRESO_ELECTRONICO : null, tieneIngresoTotal ? g.INGRESO_TOTAL : null),
      PCT_PAGO_ELECTRONICO: safeDiv(g.tieneValidaciones ? g.VALIDACIONES_TOTALES : null, g.tieneAscensos ? g.ASCENSOS : null),
      TARIFA_PROMEDIO: safeDiv(tieneIngresoTotal ? g.INGRESO_TOTAL : null, g.tieneAscensos ? g.ASCENSOS : null),
      EVASION: evasion,
    };
  });
}

function computeResumenSistema() {
  if (STATE.cutoff.anio === null) return [];
  const years = Array.from(new Set(STATE.consolidated.map(r => r.ANIO))).sort((a, b) => a - b);
  const rows = aggregateSistema(years, 1, STATE.cutoff.semana, null);
  return rows.map((row, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    return Object.assign({}, row, {
      VAR_INGRESO_TOTAL: prev ? safeDiv(row.INGRESO_TOTAL !== null && prev.INGRESO_TOTAL !== null ? (row.INGRESO_TOTAL - prev.INGRESO_TOTAL) : null, prev.INGRESO_TOTAL) : null,
      VAR_ASCENSOS: prev ? safeDiv(row.ASCENSOS !== null && prev.ASCENSOS !== null ? (row.ASCENSOS - prev.ASCENSOS) : null, prev.ASCENSOS) : null,
    });
  });
}

// Tabla comparativa por línea (usada en Estrategia de cierre y Resto del sistema)
function computeLineTable(lineaList) {
  if (STATE.cutoff.anio === null) return { years: [], rows: [] };
  const anioCorte = STATE.cutoff.anio;
  const availYears = Array.from(new Set(STATE.consolidated.map(r => r.ANIO))).filter(y => y <= anioCorte).sort((a, b) => b - a);
  const years = availYears.slice(0, 3).sort((a, b) => a - b); // 3 años más recientes, orden ascendente
  const rows = lineaList.sort((a, b) => a - b).map(linea => {
    const filt = new Set([linea]);
    const byYear = aggregateSistema(years, 1, STATE.cutoff.semana, filt);
    const first = byYear[0], last = byYear[byYear.length - 1];
    const varOf = (key) => safeDiv(last[key] !== null && first[key] !== null ? (last[key] - first[key]) : null, first[key]);
    const varsVsPrimero = {
      ASCENSOS: varOf('ASCENSOS'), INGRESO_TOTAL: varOf('INGRESO_TOTAL'), DINERO_FISICO: varOf('DINERO_FISICO'),
      INGRESO_ELECTRONICO: varOf('INGRESO_ELECTRONICO'), TARIFA_PROMEDIO: varOf('TARIFA_PROMEDIO'),
      PARTICIPACION_ELECTRONICA: varOf('PARTICIPACION_ELECTRONICA'), PCT_PAGO_ELECTRONICO: varOf('PCT_PAGO_ELECTRONICO'),
      EVASION: varOf('EVASION'),
    };
    return { linea, years: byYear, varsVsPrimero, varAscensosVsPrimero: varsVsPrimero.ASCENSOS, varIngresoVsPrimero: varsVsPrimero.INGRESO_TOTAL, varTarifaVsPrimero: varsVsPrimero.TARIFA_PROMEDIO, claves: clavesDeLinea(linea) };
  });
  return { years, rows };
}

// Comparativo semanal para las líneas de la ESTRATEGIA DE CIERRE (última semana,
// semana anterior, y semana de referencia = inicio de campaña/cierre por línea, con
// caída a semana 1 si la línea no tiene campaña configurada). El resto del sistema
// sigue usando el comparativo anual (computeLineTable).
function computeLineTableWeekly(lineaList) {
  if (STATE.cutoff.anio === null) return { rows: [], semUltima: null, semAnterior: null, anio: null };
  const anio = STATE.cutoff.anio;
  const semUltima = STATE.cutoff.semana;
  const semAnterior = semUltima > 1 ? semUltima - 1 : null;
  const indicatorKeys = ['ASCENSOS', 'INGRESO_TOTAL', 'DINERO_FISICO', 'INGRESO_ELECTRONICO', 'TARIFA_PROMEDIO', 'PARTICIPACION_ELECTRONICA', 'PCT_PAGO_ELECTRONICO', 'EVASION'];
  const rows = lineaList.sort((a, b) => a - b).map(linea => {
    const filt = new Set([linea]);
    const camp = STATE.campaigns[linea];
    const semReferencia = (camp && camp.inicio) ? camp.inicio : 1;
    const wUltima = aggregateSistema([anio], semUltima, semUltima, filt)[0];
    const wAnterior = semAnterior !== null ? aggregateSistema([anio], semAnterior, semAnterior, filt)[0] : null;
    const wReferencia = aggregateSistema([anio], semReferencia, semReferencia, filt)[0];
    const varsVsAnterior = {}, varsVsReferencia = {};
    indicatorKeys.forEach(k => {
      varsVsAnterior[k] = wAnterior ? safeDiv(wUltima[k] !== null && wAnterior[k] !== null ? wUltima[k] - wAnterior[k] : null, wAnterior[k]) : null;
      varsVsReferencia[k] = safeDiv(wUltima[k] !== null && wReferencia[k] !== null ? wUltima[k] - wReferencia[k] : null, wReferencia[k]);
    });
    return { linea, wUltima, wAnterior, wReferencia, semReferencia, semAnterior, semUltima, varsVsAnterior, varsVsReferencia, claves: clavesDeLinea(linea) };
  });
  return { rows, semUltima, semAnterior, anio };
}

function clavesDeLinea(linea) {
  const claves = new Set();
  STATE.consolidated.forEach(r => { if (rowLineaBase(r) === linea) claves.add(r.RUTA); });
  return Array.from(claves).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

// Serie semanal por línea (S1..corte) para gráficas de evolución
function computeWeeklySeries(lineas, years) {
  const semMax = STATE.cutoff.semana || 52;
  const out = {}; // linea -> anio -> array indexada por semana
  lineas.forEach(l => { out[l] = {}; years.forEach(y => { out[l][y] = Array.from({ length: semMax }, (_, i) => ({ SEMANA: i + 1, ASCENSOS: null, INGRESO_TOTAL: null, DINERO_FISICO: null, INGRESO_ELECTRONICO: null, VALIDACIONES_TOTALES: null })); }); });
  const acc = {}; // linea|anio|semana -> acumulador
  STATE.consolidated.forEach(r => {
    const lb = rowLineaBase(r);
    if (lb === null || !lineas.includes(lb) || !years.includes(r.ANIO) || r.SEMANA < 1 || r.SEMANA > semMax) return;
    const key = lb + '|' + r.ANIO + '|' + r.SEMANA;
    if (!acc[key]) acc[key] = { ASCENSOS: 0, DINERO_FISICO: 0, INGRESO_ELECTRONICO: 0, VALIDACIONES_TOTALES: 0, hasA: false, hasF: false, hasE: false, hasV: false };
    const a = acc[key];
    if (r.ASCENSOS !== null) { a.ASCENSOS += r.ASCENSOS; a.hasA = true; }
    if (r.DINERO_FISICO !== null) { a.DINERO_FISICO += r.DINERO_FISICO; a.hasF = true; }
    if (r.INGRESO_ELECTRONICO !== null) { a.INGRESO_ELECTRONICO += r.INGRESO_ELECTRONICO; a.hasE = true; }
    if (r.VALIDACIONES_TOTALES !== null) { a.VALIDACIONES_TOTALES += r.VALIDACIONES_TOTALES; a.hasV = true; }
  });
  lineas.forEach(l => years.forEach(y => {
    for (let s = 1; s <= semMax; s++) {
      const a = acc[l + '|' + y + '|' + s];
      const cell = out[l][y][s - 1];
      if (a) {
        cell.ASCENSOS = a.hasA ? a.ASCENSOS : null;
        cell.DINERO_FISICO = a.hasF ? a.DINERO_FISICO : null;
        cell.INGRESO_ELECTRONICO = a.hasE ? a.INGRESO_ELECTRONICO : null;
        cell.VALIDACIONES_TOTALES = a.hasV ? a.VALIDACIONES_TOTALES : null;
        cell.INGRESO_TOTAL = (a.hasF || a.hasE) ? (a.DINERO_FISICO + a.INGRESO_ELECTRONICO) : null;
        cell.PARTICIPACION_ELECTRONICA = safeDiv(a.hasE ? a.INGRESO_ELECTRONICO : null, cell.INGRESO_TOTAL);
        cell.PCT_PAGO_ELECTRONICO = safeDiv(a.hasV ? a.VALIDACIONES_TOTALES : null, cell.ASCENSOS);
      }
    }
  }));
  return out;
}

// OXXO vs CAUS semanal, S1..corte
function computeOxxoCausWeekly() {
  const semMax = STATE.cutoff.semana || 52;
  const anio = STATE.cutoff.anio;
  const weeks = Array.from({ length: semMax }, (_, i) => i + 1);
  const oxxoMap = {}; STATE.oxxo.weekly.filter(w => w.ANIO === anio).forEach(w => oxxoMap[w.SEMANA] = w.MONTO);
  const causMap = {}; STATE.caus.weekly.filter(w => w.ANIO === anio).forEach(w => causMap[w.SEMANA] = w.MONTO);
  const oxxoPrevMap = {}; (STATE.oxxoPrev.weekly || []).filter(w => w.ANIO === anio - 1).forEach(w => oxxoPrevMap[w.SEMANA] = w.MONTO);
  const causPrevMap = {}; (STATE.causPrev.weekly || []).filter(w => w.ANIO === anio - 1).forEach(w => causPrevMap[w.SEMANA] = w.MONTO);

  let accOxxo = 0, accCaus = 0;
  const series = weeks.map(s => {
    const oxxo = oxxoMap[s] !== undefined ? oxxoMap[s] : null;
    const caus = causMap[s] !== undefined ? causMap[s] : null;
    if (oxxo !== null) accOxxo += oxxo;
    if (caus !== null) accCaus += caus;
    return {
      SEMANA: s, OXXO: oxxo, CAUS: caus,
      OXXO_ACUM: STATE.oxxo.loaded ? accOxxo : null,
      CAUS_ACUM: STATE.caus.loaded ? accCaus : null,
      TOTAL: (oxxo !== null || caus !== null) ? ((oxxo || 0) + (caus || 0)) : null,
    };
  });
  const totalOxxo = STATE.oxxo.loaded ? accOxxo : null;
  const totalCaus = STATE.caus.loaded ? accCaus : null;
  const totalConjunto = (totalOxxo !== null || totalCaus !== null) ? ((totalOxxo || 0) + (totalCaus || 0)) : null;

  let varOxxo = null, varCaus = null;
  if (STATE.oxxoPrev.loaded) {
    const prevAcum = weeks.reduce((s, w) => s + (oxxoPrevMap[w] || 0), 0);
    varOxxo = safeDiv(totalOxxo !== null ? (totalOxxo - prevAcum) : null, prevAcum);
  }
  if (STATE.causPrev.loaded) {
    const prevAcum = weeks.reduce((s, w) => s + (causPrevMap[w] || 0), 0);
    varCaus = safeDiv(totalCaus !== null ? (totalCaus - prevAcum) : null, prevAcum);
  }
  return { series, totalOxxo, totalCaus, totalConjunto, varOxxo, varCaus, tieneOxxo: STATE.oxxo.loaded, tieneCaus: STATE.caus.loaded };
}

/* ==========================================================================
   6. HALLAZGOS AUTOMÁTICOS (reglas determinísticas, sin API externa)
   ========================================================================== */

function hallazgosResumen(resumenRows) {
  const out = [];
  if (!resumenRows.length) return out;
  const last = resumenRows[resumenRows.length - 1];
  const prev = resumenRows.length > 1 ? resumenRows[resumenRows.length - 2] : null;
  if (prev && last.INGRESO_TOTAL !== null && prev.INGRESO_TOTAL !== null) {
    const v = safeDiv(last.INGRESO_TOTAL - prev.INGRESO_TOTAL, prev.INGRESO_TOTAL);
    out.push('El ingreso total del periodo homogéneo en ' + last.ANIO + ' se observa ' + (v >= 0 ? 'un aumento' : 'una disminución') + ' de ' + fmtPct(Math.abs(v)) + ' respecto de ' + prev.ANIO + '.');
  }
  if (prev && last.ASCENSOS !== null && prev.ASCENSOS !== null) {
    const v = safeDiv(last.ASCENSOS - prev.ASCENSOS, prev.ASCENSOS);
    out.push('Los ascensos acumulados presentan ' + (v >= 0 ? 'un crecimiento' : 'una caída') + ' de ' + fmtPct(Math.abs(v)) + ' en ' + last.ANIO + ' frente a ' + prev.ANIO + '.');
  }
  const withPart = resumenRows.filter(r => r.PARTICIPACION_ELECTRONICA !== null);
  if (withPart.length >= 2) {
    const first = withPart[0], lastP = withPart[withPart.length - 1];
    out.push('La participación del ingreso electrónico pasa de ' + fmtPct(first.PARTICIPACION_ELECTRONICA) + ' en ' + first.ANIO + ' a ' + fmtPct(lastP.PARTICIPACION_ELECTRONICA) + ' en ' + lastP.ANIO + '.');
  }
  return out.slice(0, 3);
}

function hallazgosLineTable(rows) {
  const out = [];
  const conTarifa = rows.map(r => ({ linea: r.linea, t: r.years[r.years.length - 1].TARIFA_PROMEDIO })).filter(r => r.t !== null);
  if (conTarifa.length) {
    const max = conTarifa.reduce((a, b) => b.t > a.t ? b : a);
    const min = conTarifa.reduce((a, b) => b.t < a.t ? b : a);
    out.push('La tarifa promedio del año más reciente en este grupo va de $' + min.t.toFixed(2) + ' en la Línea ' + min.linea + ' a $' + max.t.toFixed(2) + ' en la Línea ' + max.linea + '.');
  }
  const conPart = rows.map(r => ({ linea: r.linea, p: r.years[r.years.length - 1].PARTICIPACION_ELECTRONICA })).filter(r => r.p !== null);
  if (conPart.length) {
    const max = conPart.reduce((a, b) => b.p > a.p ? b : a);
    out.push('La Línea ' + max.linea + ' registra la mayor participación del ingreso electrónico del grupo, con ' + fmtPct(max.p) + '.');
  }
  const conVar = rows.filter(r => r.varAscensosVsPrimero !== null);
  if (conVar.length) {
    const max = conVar.reduce((a, b) => b.varAscensosVsPrimero > a.varAscensosVsPrimero ? b : a);
    const min = conVar.reduce((a, b) => b.varAscensosVsPrimero < a.varAscensosVsPrimero ? b : a);
    out.push('La Línea ' + max.linea + ' presenta el mayor crecimiento de ascensos del grupo (' + fmtSigned(max.varAscensosVsPrimero, true) + '), mientras la Línea ' + min.linea + ' registra la mayor caída (' + fmtSigned(min.varAscensosVsPrimero, true) + ').');
  }
  return out.slice(0, 3);
}

function hallazgosLineTableWeekly(rows) {
  const out = [];
  const conTarifa = rows.map(r => ({ linea: r.linea, t: r.wUltima.TARIFA_PROMEDIO })).filter(r => r.t !== null);
  if (conTarifa.length) {
    const max = conTarifa.reduce((a, b) => b.t > a.t ? b : a);
    const min = conTarifa.reduce((a, b) => b.t < a.t ? b : a);
    out.push('La tarifa promedio de la última semana en este grupo va de $' + min.t.toFixed(2) + ' en la Línea ' + min.linea + ' a $' + max.t.toFixed(2) + ' en la Línea ' + max.linea + '.');
  }
  const conPart = rows.map(r => ({ linea: r.linea, p: r.wUltima.PARTICIPACION_ELECTRONICA })).filter(r => r.p !== null);
  if (conPart.length) {
    const max = conPart.reduce((a, b) => b.p > a.p ? b : a);
    out.push('La Línea ' + max.linea + ' registra la mayor participación del ingreso electrónico del grupo en la última semana, con ' + fmtPct(max.p) + '.');
  }
  const conVar = rows.filter(r => r.varsVsReferencia.ASCENSOS !== null);
  if (conVar.length) {
    const max = conVar.reduce((a, b) => b.varsVsReferencia.ASCENSOS > a.varsVsReferencia.ASCENSOS ? b : a);
    const min = conVar.reduce((a, b) => b.varsVsReferencia.ASCENSOS < a.varsVsReferencia.ASCENSOS ? b : a);
    out.push('Contra su semana de referencia, la Línea ' + max.linea + ' presenta el mayor crecimiento de ascensos (' + fmtSigned(max.varsVsReferencia.ASCENSOS, true) + '), mientras la Línea ' + min.linea + ' registra la mayor caída (' + fmtSigned(min.varsVsReferencia.ASCENSOS, true) + ').');
  }
  return out.slice(0, 3);
}

function hallazgosCausPuntoVenta(puntos) {
  const out = [];
  if (!puntos.length) return out;
  const total = puntos.reduce((s, p) => s + p.MONTO, 0);
  const top1 = puntos[0];
  out.push('El punto ' + top1.PUNTO_VENTA + ' concentra ' + fmtPct(safeDiv(top1.MONTO, total)) + ' del ingreso CAUS del periodo cargado.');
  const top4 = puntos.slice(0, 4).reduce((s, p) => s + p.MONTO, 0);
  out.push('Los cuatro principales puntos de venta concentran ' + fmtPct(safeDiv(top4, total)) + ' del total.');
  return out.slice(0, 3);
}

function hallazgosCampanas(lineas, years, campaigns) {
  const out = [];
  const semSeries = computeWeeklySeries(lineas, years);
  const anioCorte = STATE.cutoff.anio;
  lineas.forEach(l => {
    const camp = campaigns[l];
    if (!camp || !camp.inicio) return;
    const serie = semSeries[l] && semSeries[l][anioCorte];
    if (!serie) return;
    const antes = serie.filter(s => s.SEMANA < camp.inicio && s.ASCENSOS !== null);
    const despues = serie.filter(s => s.SEMANA >= camp.inicio && s.ASCENSOS !== null);
    if (antes.length && despues.length) {
      const promAntes = antes.reduce((s, x) => s + x.ASCENSOS, 0) / antes.length;
      const promDespues = despues.reduce((s, x) => s + x.ASCENSOS, 0) / despues.length;
      const v = safeDiv(promDespues - promAntes, promAntes);
      if (v !== null) {
        out.push('En la Línea ' + l + ', el promedio semanal de ascensos a partir de la semana ' + camp.inicio + ' de ' + anioCorte + ' se observa ' + (v >= 0 ? fmtPct(v) + ' por arriba' : fmtPct(Math.abs(v)) + ' por debajo') + ' del promedio previo, lo cual coincide con el periodo configurado de "' + (camp.etiqueta || 'campaña') + '".');
      }
    }
  });
  return out.slice(0, 4);
}

/* ==========================================================================
   7. RENDERING
   ========================================================================== */

const TABS = [
  { id: 'carga', label: 'Carga y calidad de datos' },
  { id: 'resumen', label: 'Resumen del sistema' },
  { id: 'cierre', label: 'Estrategia de cierre' },
  { id: 'resto', label: 'Resto del sistema' },
  { id: 'evolucion', label: 'Evolución semanal por línea' },
  { id: 'oxxocaus', label: 'Ingreso electrónico OXXO y CAUS' },
  { id: 'causpv', label: 'CAUS por punto de venta' },
  { id: 'exportar', label: 'Exportar reporte' },
];

function initTabs() {
  const nav = document.getElementById('tabNav');
  TABS.forEach((t, i) => {
    const btn = el('button', i === 0 ? 'active' : '', '<span class="step-badge">' + (i + 1) + '</span>' + t.label);
    btn.addEventListener('click', () => activateTab(t.id));
    btn.dataset.tab = t.id;
    nav.appendChild(btn);
  });
  document.getElementById('tab-' + TABS[0].id).classList.add('active');
}

function activateTab(id) {
  document.querySelectorAll('nav.app-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('section.tab-panel').forEach(s => s.classList.toggle('active', s.id === 'tab-' + id));
  // recalcula/redibuja al entrar a cada pestaña, por si el estado cambió
  if (id === 'resumen') renderResumenTab();
  if (id === 'cierre') renderCierreTab();
  if (id === 'resto') renderRestoTab();
  if (id === 'evolucion') renderEvolucionTab();
  if (id === 'oxxocaus') renderOxxoCausTab();
  if (id === 'causpv') renderCausPvTab();
  if (id === 'exportar') renderExportTab();
}

function setProgress(id, pct) {
  const outer = document.getElementById(id);
  if (!outer) return;
  outer.classList.remove('hidden');
  const inner = outer.querySelector('.progress-inner');
  if (inner) inner.style.width = pct + '%';
  if (pct >= 100) setTimeout(() => outer.classList.add('hidden'), 500);
}

function renderStatsBlock(containerId, stats, ok) {
  const c = document.getElementById(containerId);
  if (!c || !stats) return;
  const semanas = stats.semanasDetectadas || Array.from(stats.semanas || []);
  let html = '';
  html += '<div style="margin-bottom:6px;">' + (ok ? '<span class="badge badge-ok">Cargado</span>' : '<span class="badge badge-err">Con errores</span>') + '</div>';
  if (stats.archivo) html += '<div class="row"><span>Archivo</span><span>' + stats.archivo + '</span></div>';
  if (stats.archivos !== undefined) html += '<div class="row"><span>Archivos</span><span>' + stats.archivos + '</span></div>';
  if (stats.hoja) html += '<div class="row"><span>Hoja usada</span><span>' + stats.hoja + '</span></div>';
  if (stats.filasLeidas !== undefined) html += '<div class="row"><span>Filas leídas</span><span>' + fmtInt(stats.filasLeidas) + '</span></div>';
  if (stats.filasValidas !== undefined) html += '<div class="row"><span>Filas válidas</span><span>' + fmtInt(stats.filasValidas) + '</span></div>';
  if (stats.filasDescartadas !== undefined) html += '<div class="row"><span>Filas descartadas</span><span>' + fmtInt(stats.filasDescartadas) + '</span></div>';
  if (stats.duplicados !== undefined) html += '<div class="row"><span>Duplicados eliminados</span><span>' + fmtInt(stats.duplicados) + '</span></div>';
  if (stats.rangoAnios) html += '<div class="row"><span>Años detectados</span><span>' + stats.rangoAnios.join(', ') + '</span></div>';
  if (semanas && semanas.length) html += '<div class="row"><span>Semanas detectadas</span><span>' + semanas.length + '</span></div>';
  if (stats.error) html += '<div class="alert alert-err" style="margin-top:8px;">' + stats.error + '</div>';
  c.innerHTML = html;
}

function renderQualityPanel() {
  const c = document.getElementById('qualityPanel');
  if (!STATE.quality.issues.length) { c.innerHTML = '<p style="color:#999;font-size:12.5px;">Sin advertencias por el momento.</p>'; return; }
  let html = '';
  STATE.quality.issues.forEach(q => {
    const cls = q.level === 'err' ? 'alert-err' : q.level === 'warn' ? 'alert-warn' : 'alert-info';
    html += '<div class="alert ' + cls + '"><strong>' + q.source + ':</strong> ' + q.message + '</div>';
  });
  c.innerHTML = html;
}

function renderHistoricoStatus() {
  const box = document.getElementById('historicoStatusBox');
  if (!box) return;
  if (!STATE.historical.rows.length) {
    box.innerHTML = '<span style="color:#999;">Sin datos todavía — da clic en "Conectar con Google Drive" para cargar la base histórica.</span>';
    return;
  }
  if (STATE.cutoff.anio === null) {
    box.innerHTML = '<span style="color:#999;">Histórico cargado — calculando semana de corte…</span>';
    return;
  }
  const nombre = (STATE.historical.fileNames && STATE.historical.fileNames[0]) || 'Analisis_Integral_Recaudo_Movilidad_Evasion...xlsx';
  box.innerHTML =
    '<div class="kpi" style="display:inline-block;margin-right:24px;">' +
    '<div class="lbl">Actualizada hasta</div>' +
    '<div class="val">S' + STATE.cutoff.semana + ' · ' + STATE.cutoff.anio + '</div>' +
    '</div>' +
    '<div style="margin-top:10px;font-size:12px;color:#666;">' +
    'Fuente: ' + nombre + ' + sábanas cargadas · ' + STATE.historical.rows.length.toLocaleString('es-MX') + ' filas base' +
    '</div>';
}

function renderCutoffPanel() {
  const c = document.getElementById('cutoffPanel');
  if (STATE.cutoff.anio === null) { c.innerHTML = '<p style="color:#999;font-size:12.5px;">Aún no se ha determinado la semana de corte.</p>'; return; }
  const s = STATE.consolidationSummary || { inserted: 0, replaced: 0, kept: 0 };
  c.innerHTML =
    '<div class="grid grid-3">' +
    '<div class="kpi"><div class="lbl">Semana de corte</div><div class="val">S' + STATE.cutoff.semana + '</div></div>' +
    '<div class="kpi"><div class="lbl">Año de corte</div><div class="val">' + STATE.cutoff.anio + '</div></div>' +
    '<div class="kpi"><div class="lbl">Líneas detectadas</div><div class="val">' + STATE.allLineasBase.length + '</div></div>' +
    '</div>' +
    '<div style="margin-top:12px;font-size:12.5px;color:#555;">' +
    'Filas insertadas desde sábanas: <strong>' + s.inserted + '</strong> · Reemplazadas: <strong>' + s.replaced + '</strong> · Conservadas del histórico: <strong>' + s.kept + '</strong>' +
    '</div>';
}

function renderFindings(container, items) {
  if (!items.length) { container.innerHTML = ''; return; }
  let html = '<div class="findings">';
  items.forEach(t => { html += '<div class="finding-item"><div class="chk">✓</div><div>' + t + '</div></div>'; });
  html += '</div>';
  container.innerHTML = html;
}

function varCell(v, isPct) {
  if (v === null || v === undefined) return '<td class="na-val">N/D</td>';
  const cls = v >= 0 ? 'pos-val' : 'neg-val';
  return '<td class="' + cls + '">' + fmtSigned(v, isPct !== false) + '</td>';
}

/* ---------------- TAB: RESUMEN ---------------- */
function renderResumenTab() {
  const c = document.getElementById('resumenContent');
  if (!STATE.historical.loaded) { c.innerHTML = '<div class="alert alert-info">Carga primero la base histórica en la pestaña "Carga y calidad de datos".</div>'; return; }
  const rows = computeResumenSistema();
  const sub = document.getElementById('resumenSub');
  sub.textContent = 'Comparación homogénea acumulada, semana 1 a semana ' + STATE.cutoff.semana + ' de ' + STATE.cutoff.anio + ' (' + rows.length + ' años disponibles).';

  const last = rows[rows.length - 1];
  let html = '<div class="grid grid-4" style="margin-bottom:18px;">';
  html += kpiCard('Ascensos ' + last.ANIO, fmtInt(last.ASCENSOS), last.VAR_ASCENSOS !== undefined ? last.VAR_ASCENSOS : null);
  html += kpiCard('Ingreso total ' + last.ANIO, fmtMoneyShort(last.INGRESO_TOTAL), last.VAR_INGRESO_TOTAL !== undefined ? last.VAR_INGRESO_TOTAL : null);
  html += kpiCard('Participación electrónica ' + last.ANIO, fmtPct(last.PARTICIPACION_ELECTRONICA), null);
  html += kpiCard('Tarifa promedio ' + last.ANIO, last.TARIFA_PROMEDIO !== null ? '$' + last.TARIFA_PROMEDIO.toFixed(2) : 'N/D', null);
  html += '</div>';

  html += '<div class="card"><h3>Comparación homogénea S1–S' + STATE.cutoff.semana + '</h3><div class="table-wrap"><table class="data-table"><thead><tr>' +
    '<th style="text-align:left;">Año</th><th>Recaudo físico</th><th>Ingreso electrónico</th><th>Ingreso total</th><th>Ascensos</th><th>Participación electrónica</th><th>Var. ingreso vs año anterior</th><th>Var. ascensos vs año anterior</th>' +
    '</tr></thead><tbody>';
  rows.forEach(r => {
    html += '<tr><td>' + r.ANIO + '</td><td>' + fmtMoney(r.DINERO_FISICO, 2) + '</td><td>' + fmtMoney(r.INGRESO_ELECTRONICO, 2) + '</td><td>' + fmtMoney(r.INGRESO_TOTAL, 2) + '</td><td>' + fmtInt(r.ASCENSOS) + '</td><td>' + fmtPct(r.PARTICIPACION_ELECTRONICA) + '</td>' + varCell(r.VAR_INGRESO_TOTAL) + varCell(r.VAR_ASCENSOS) + '</tr>';
  });
  html += '</tbody></table></div>';
  html += '<div id="findingsResumen"></div></div>';

  html += '<div class="grid grid-3" style="margin-top:18px;">' +
    '<div class="chart-box"><canvas id="chartResumenIngreso"></canvas></div>' +
    '<div class="chart-box"><canvas id="chartResumenAscensos"></canvas></div>' +
    '<div class="chart-box"><canvas id="chartResumenPart"></canvas></div>' +
    '</div>';

  c.innerHTML = html;
  renderFindings(document.getElementById('findingsResumen'), hallazgosResumen(rows));

  drawBarChart('chartResumenIngreso', 'Ingreso total acumulado por año (S1–S' + STATE.cutoff.semana + ')', rows.map(r => String(r.ANIO)), [{ label: 'Ingreso total', data: rows.map(r => r.INGRESO_TOTAL), color: COLORS.vino }]);
  drawBarChart('chartResumenAscensos', 'Ascensos acumulados por año', rows.map(r => String(r.ANIO)), [{ label: 'Ascensos', data: rows.map(r => r.ASCENSOS), color: COLORS.naranja }]);
  drawBarChart('chartResumenPart', 'Participación del ingreso electrónico', rows.map(r => String(r.ANIO)), [{ label: 'Participación electrónica', data: rows.map(r => r.PARTICIPACION_ELECTRONICA === null ? null : r.PARTICIPACION_ELECTRONICA * 100), color: COLORS.rojoAux2, isPct: true }]);
}

function kpiCard(label, value, delta) {
  let deltaHtml = '';
  if (delta !== null && delta !== undefined) deltaHtml = '<div class="delta ' + deltaClass(delta) + '">' + fmtSigned(delta, true) + ' vs año anterior</div>';
  return '<div class="kpi"><div class="lbl">' + label + '</div><div class="val">' + value + '</div>' + deltaHtml + '</div>';
}

/* ---------------- TAB: ESTRATEGIA DE CIERRE / RESTO ---------------- */
function renderLineChecklist() {
  const c = document.getElementById('lineCheckList');
  c.innerHTML = '';
  STATE.allLineasBase.forEach(l => {
    const item = el('label', 'check-item');
    const claves = clavesDeLinea(l);
    item.innerHTML = '<input type="checkbox" data-linea="' + l + '" ' + (STATE.closureLines.has(l) ? 'checked' : '') + '> <span>Línea ' + l + '<small>' + claves.join(', ') + '</small></span>';
    c.appendChild(item);
  });
  c.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const l = parseInt(cb.dataset.linea, 10);
      if (cb.checked) STATE.closureLines.add(l); else STATE.closureLines.delete(l);
      renderCampaignTable();
      renderCierreTab(); renderRestoTab();
    });
  });
}

function renderCampaignTable() {
  const tbody = document.querySelector('#campaignTable tbody');
  tbody.innerHTML = '';
  Array.from(STATE.closureLines).sort((a, b) => a - b).forEach(l => {
    if (!STATE.campaigns[l]) STATE.campaigns[l] = { inicio: null, retiro: null, etiqueta: 'Campaña Línea ' + l };
    const camp = STATE.campaigns[l];
    const tr = el('tr');
    tr.innerHTML = '<td style="text-align:left;">Línea ' + l + '</td>' +
      '<td><input type="number" min="1" max="53" value="' + (camp.inicio !== null ? camp.inicio : '') + '" data-l="' + l + '" data-f="inicio" style="width:70px;text-align:right;"></td>' +
      '<td><input type="number" min="1" max="53" value="' + (camp.retiro !== null ? camp.retiro : '') + '" data-l="' + l + '" data-f="retiro" style="width:70px;text-align:right;"></td>' +
      '<td style="text-align:left;"><input type="text" value="' + (camp.etiqueta || '') + '" data-l="' + l + '" data-f="etiqueta"></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const l = parseInt(inp.dataset.l, 10), f = inp.dataset.f;
      if (!STATE.campaigns[l]) STATE.campaigns[l] = { inicio: null, retiro: null, etiqueta: '' };
      STATE.campaigns[l][f] = f === 'etiqueta' ? inp.value : (inp.value === '' ? null : parseInt(inp.value, 10));
    });
  });
}

function renderExceptionsPanel() {
  const c = document.getElementById('exceptionsPanel');
  const keys = Object.keys(STATE.lineExceptions);
  if (!keys.length) { c.innerHTML = '<p style="color:#999;font-size:12.5px;">No se han detectado claves con formato irregular.</p>'; return; }
  let html = '<div class="table-wrap" style="max-height:260px;"><table class="data-table"><thead><tr><th style="text-align:left;">Clave</th><th style="text-align:left;">Acción</th><th style="text-align:left;">Asignar a línea</th></tr></thead><tbody>';
  keys.forEach(k => {
    const ex = STATE.lineExceptions[k];
    html += '<tr><td style="text-align:left;">' + k + '</td>' +
      '<td style="text-align:left;"><select data-k="' + k + '" data-f="action"><option value="exclude"' + (ex.action === 'exclude' ? ' selected' : '') + '>Excluir</option><option value="override"' + (ex.action === 'override' ? ' selected' : '') + '>Asignar a línea</option></select></td>' +
      '<td style="text-align:left;"><input type="number" min="1" max="99" style="width:70px;" data-k="' + k + '" data-f="overrideLinea" value="' + (ex.overrideLinea !== null ? ex.overrideLinea : '') + '"></td></tr>';
  });
  html += '</tbody></table></div><div class="btn-row"><button class="btn btn-outline" id="btnApplyExceptions">Aplicar cambios</button></div>';
  c.innerHTML = html;
  document.getElementById('btnApplyExceptions').addEventListener('click', () => {
    c.querySelectorAll('select[data-f=action]').forEach(sel => { STATE.lineExceptions[sel.dataset.k].action = sel.value; });
    c.querySelectorAll('input[data-f=overrideLinea]').forEach(inp => { STATE.lineExceptions[inp.dataset.k].overrideLinea = inp.value === '' ? null : parseInt(inp.value, 10); });
    consolidate();
    fullRerender();
  });
}

function renderLineTableBlock(containerId, lineTable, closureContext) {
  const c = document.getElementById(containerId);
  if (!lineTable.rows.length) { c.innerHTML = '<div class="alert alert-info">No hay líneas ' + (closureContext ? 'seleccionadas para la estrategia de cierre' : 'en el resto del sistema') + '.</div>'; return; }
  let html = '';
  lineTable.rows.forEach(row => {
    html += '<div class="line-block"><div class="lh"><span>Línea ' + row.linea + '</span><span class="chev">▾</span></div><div class="lb">';
    html += '<div class="table-wrap"><table class="data-table"><thead><tr><th style="text-align:left;">Indicador</th>' + lineTable.years.map(y => '<th>' + y + '</th>').join('') + '<th>Var. ' + lineTable.years[lineTable.years.length - 1] + ' vs ' + lineTable.years[0] + '</th></tr></thead><tbody>';
    const defs = [
      { k: 'ASCENSOS', label: 'Ascensos', fmt: fmtInt, isPct: false },
      { k: 'INGRESO_TOTAL', label: 'Ingreso total', fmt: v => fmtMoney(v, 2), isPct: false },
      { k: 'DINERO_FISICO', label: 'Recaudo físico', fmt: v => fmtMoney(v, 2), isPct: false },
      { k: 'INGRESO_ELECTRONICO', label: 'Ingreso electrónico', fmt: v => fmtMoney(v, 2), isPct: false },
      { k: 'TARIFA_PROMEDIO', label: 'Tarifa promedio', fmt: v => v === null ? 'N/D' : '$' + v.toFixed(2), isPct: false },
      { k: 'PARTICIPACION_ELECTRONICA', label: 'Participación del ingreso electrónico', fmt: fmtPct, isPct: false },
      { k: 'PCT_PAGO_ELECTRONICO', label: 'Porcentaje de pago electrónico', fmt: fmtPct, isPct: false },
      { k: 'EVASION', label: 'Evasión estimada', fmt: v => v === null ? 'N/D' : fmtMoney(v, 2), isPct: false },
    ];
    defs.forEach(d => {
      html += '<tr><td>' + d.label + '</td>' + row.years.map(y => '<td' + (d.k === 'TARIFA_PROMEDIO' ? ' style="color:' + COLORS.vino + ';font-weight:700;"' : '') + '>' + d.fmt(y[d.k]) + '</td>').join('');
      const varKey = row.varsVsPrimero[d.k];
      html += (varKey !== null && varKey !== undefined) ? varCell(varKey) : '<td class="na-val">N/D</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="font-size:10.5px;color:#999;margin-top:8px;font-style:italic;">Línea agregada a partir de las claves: ' + row.claves.join(', ') + '.</div>';
    html += '</div></div>';
  });
  html += '<div id="findings-' + containerId + '"></div>';
  c.innerHTML = html;
  c.querySelectorAll('.line-block .lh').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  renderFindings(document.getElementById('findings-' + containerId), hallazgosLineTable(lineTable.rows));
}

function renderCierreTab() {
  renderLineChecklist();
  renderCampaignTable();
  renderExceptionsPanel();
  if (!STATE.historical.loaded) { document.getElementById('cierreContent').innerHTML = ''; return; }
  const lineTable = computeLineTable(Array.from(STATE.closureLines));
  renderLineTableBlock('cierreContent', lineTable, true);
}
function renderRestoTab() {
  if (!STATE.historical.loaded) { document.getElementById('restoContent').innerHTML = ''; return; }
  const resto = STATE.allLineasBase.filter(l => !STATE.closureLines.has(l));
  const lineTable = computeLineTable(resto);
  renderLineTableBlock('restoContent', lineTable, false);
}

/* ---------------- TAB: EVOLUCIÓN SEMANAL ---------------- */
function renderEvoLineChecklist() {
  const c = document.getElementById('evoLineCheckList');
  c.innerHTML = '';
  if (!STATE.evoSelectedLines.size && STATE.allLineasBase.length) {
    Array.from(STATE.closureLines).slice(0, 4).forEach(l => STATE.evoSelectedLines.add(l));
  }
  STATE.allLineasBase.forEach(l => {
    const item = el('label', 'check-item');
    item.innerHTML = '<input type="checkbox" data-evolinea="' + l + '" ' + (STATE.evoSelectedLines.has(l) ? 'checked' : '') + '> <span>Línea ' + l + '</span>';
    c.appendChild(item);
  });
  c.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const l = parseInt(cb.dataset.evolinea, 10);
      if (cb.checked) STATE.evoSelectedLines.add(l); else STATE.evoSelectedLines.delete(l);
      renderEvoCharts();
    });
  });
}

function renderEvolucionTab() {
  renderEvoLineChecklist();
  if (!STATE.historical.loaded) { document.getElementById('evoContent').innerHTML = ''; return; }
  const c = document.getElementById('evoContent');
  c.innerHTML =
    '<div class="grid grid-2">' +
    '<div class="chart-box" style="height:320px;"><canvas id="evoAscensos"></canvas></div>' +
    '<div class="chart-box" style="height:320px;"><canvas id="evoIngresoTotal"></canvas></div>' +
    '<div class="chart-box" style="height:320px;"><canvas id="evoFisico"></canvas></div>' +
    '<div class="chart-box" style="height:320px;"><canvas id="evoElectronico"></canvas></div>' +
    '<div class="chart-box" style="height:320px;"><canvas id="evoParticipacion"></canvas></div>' +
    '<div class="chart-box" style="height:320px;"><canvas id="evoPctPago"></canvas></div>' +
    '</div><div id="findingsEvo"></div>';
  renderEvoCharts();
}

function renderEvoCharts() {
  const lineas = Array.from(STATE.evoSelectedLines);
  if (!lineas.length || STATE.cutoff.anio === null) return;
  const years = [STATE.cutoff.anio];
  if (STATE.cutoff.anio - 1 && STATE.allLineasBase.length) years.unshift(STATE.cutoff.anio - 1);
  const series = computeWeeklySeries(lineas, years);
  const semLabels = Array.from({ length: STATE.cutoff.semana }, (_, i) => 'S' + (i + 1));

  const campaignLines = [];
  lineas.forEach(l => {
    const camp = STATE.campaigns[l];
    if (camp && camp.inicio) campaignLines.push({ week: camp.inicio, color: COLORS.rojoAux1, label: 'L' + l + ' inicio' });
    if (camp && camp.retiro) campaignLines.push({ week: camp.retiro, color: COLORS.rojoAux2, label: 'L' + l + ' retiro' });
  });

  function buildDatasets(metric) {
    const ds = [];
    const palette = [COLORS.vino, COLORS.naranja, COLORS.vinoOscuro, COLORS.rojoAux1, COLORS.verde, COLORS.rojoAux2];
    let i = 0;
    lineas.forEach(l => years.forEach(y => {
      ds.push({ label: 'Línea ' + l + ' · ' + y, data: series[l][y].map(s => s[metric]), color: palette[i % palette.length] });
      i++;
    }));
    return ds;
  }
  drawLineChart('evoAscensos', 'Ascensos por semana', semLabels, buildDatasets('ASCENSOS'), campaignLines);
  drawLineChart('evoIngresoTotal', 'Ingreso total por semana', semLabels, buildDatasets('INGRESO_TOTAL'), campaignLines);
  drawLineChart('evoFisico', 'Recaudo físico por semana', semLabels, buildDatasets('DINERO_FISICO'), campaignLines);
  drawLineChart('evoElectronico', 'Ingreso electrónico por semana', semLabels, buildDatasets('INGRESO_ELECTRONICO'), campaignLines);
  drawLineChart('evoParticipacion', 'Participación del ingreso electrónico', semLabels, buildDatasets('PARTICIPACION_ELECTRONICA'), campaignLines, true);
  drawLineChart('evoPctPago', 'Porcentaje de pago electrónico', semLabels, buildDatasets('PCT_PAGO_ELECTRONICO'), campaignLines, true);

  renderFindings(document.getElementById('findingsEvo'), hallazgosCampanas(lineas, years, STATE.campaigns));
}

/* ---------------- TAB: OXXO / CAUS ---------------- */
function renderOxxoCausTab() {
  const c = document.getElementById('oxxoCausContent');
  if (!STATE.historical.loaded) { c.innerHTML = ''; return; }
  if (!STATE.oxxo.loaded && !STATE.caus.loaded) {
    c.innerHTML = '<div class="alert alert-missing">Para generar las gráficas de ingreso electrónico, adjunta los archivos OXXO (.DAT) y los reportes CAUS (.xlsx).</div>';
    return;
  }
  const data = computeOxxoCausWeekly();
  let missingMsg = '';
  if (!data.tieneOxxo) missingMsg = '<div class="alert alert-warn">No se cargaron archivos OXXO. Se muestra únicamente CAUS.</div>';
  if (!data.tieneCaus) missingMsg = '<div class="alert alert-warn">No se cargaron reportes CAUS. Se muestra únicamente OXXO.</div>';

  let html = missingMsg;
  html += '<div class="grid grid-4" style="margin-bottom:18px;">';
  html += kpiCard('OXXO acumulado', data.tieneOxxo ? fmtMoneyShort(data.totalOxxo) : 'N/D', data.varOxxo);
  html += kpiCard('CAUS acumulado', data.tieneCaus ? fmtMoneyShort(data.totalCaus) : 'N/D', data.varCaus);
  html += kpiCard('Total conjunto', data.totalConjunto !== null ? fmtMoneyShort(data.totalConjunto) : 'N/D', null);
  html += kpiCard('Semana de corte', 'S' + STATE.cutoff.semana + ' · ' + STATE.cutoff.anio, null);
  html += '</div>';
  html += '<div class="chart-box" style="height:380px;"><canvas id="chartOxxoCausSemanal"></canvas></div>';
  html += '<div class="chart-box" style="height:320px;margin-top:18px;"><canvas id="chartOxxoCausAcum"></canvas></div>';
  html += '<div id="findingsOxxoCaus"></div>';
  c.innerHTML = html;

  const labels = data.series.map(s => 'S' + s.SEMANA);
  const dsWeekly = [];
  if (data.tieneOxxo) dsWeekly.push({ label: 'OXXO', data: data.series.map(s => s.OXXO), color: COLORS.vino });
  if (data.tieneCaus) dsWeekly.push({ label: 'CAUS', data: data.series.map(s => s.CAUS), color: COLORS.naranja });
  drawLineChart('chartOxxoCausSemanal', 'Ingreso semanal OXXO vs CAUS', labels, dsWeekly, []);

  const dsAcum = [];
  if (data.tieneOxxo) dsAcum.push({ label: 'OXXO acumulado', data: data.series.map(s => s.OXXO_ACUM), color: COLORS.vino });
  if (data.tieneCaus) dsAcum.push({ label: 'CAUS acumulado', data: data.series.map(s => s.CAUS_ACUM), color: COLORS.naranja });
  drawLineChart('chartOxxoCausAcum', 'Acumulado OXXO vs CAUS', labels, dsAcum, []);

  const findings = [];
  if (data.tieneOxxo && data.tieneCaus && data.totalConjunto) {
    findings.push('OXXO aporta ' + fmtPct(safeDiv(data.totalOxxo, data.totalConjunto)) + ' del ingreso electrónico conjunto y CAUS ' + fmtPct(safeDiv(data.totalCaus, data.totalConjunto)) + ', en el periodo semana 1 a semana ' + STATE.cutoff.semana + '.');
  }
  if (data.varOxxo !== null) findings.push('El acumulado OXXO se observa ' + (data.varOxxo >= 0 ? fmtPct(data.varOxxo) + ' por arriba' : fmtPct(Math.abs(data.varOxxo)) + ' por debajo') + ' del mismo periodo del año anterior.');
  if (data.varCaus !== null) findings.push('El acumulado CAUS se observa ' + (data.varCaus >= 0 ? fmtPct(data.varCaus) + ' por arriba' : fmtPct(Math.abs(data.varCaus)) + ' por debajo') + ' del mismo periodo del año anterior.');
  renderFindings(document.getElementById('findingsOxxoCaus'), findings);
}

/* ---------------- TAB: CAUS POR PUNTO DE VENTA ---------------- */
function renderCausPvTab() {
  const c = document.getElementById('causPvContent');
  if (!STATE.caus.loaded) { c.innerHTML = '<div class="alert alert-missing">Para ver el detalle por punto de venta, adjunta los reportes CAUS (.xlsx).</div>'; return; }
  const puntos = STATE.caus.puntoVenta;
  const total = puntos.reduce((s, p) => s + p.MONTO, 0);
  const top4 = puntos.slice(0, 4).reduce((s, p) => s + p.MONTO, 0);

  let html = '<div class="grid grid-4" style="margin-bottom:18px;">';
  html += kpiCard('Total CAUS', fmtMoneyShort(total), null);
  html += kpiCard('Puntos de venta', String(puntos.length), null);
  html += kpiCard('Top 5 (' + puntos.slice(0, 5).map(p => p.PUNTO_VENTA).join(', ') + ')', fmtPct(safeDiv(puntos.slice(0, 5).reduce((s, p) => s + p.MONTO, 0), total)), null);
  html += kpiCard('Concentración top 4', fmtPct(safeDiv(top4, total)), null);
  html += '</div>';
  html += '<div class="card"><h3>Filtro</h3><div class="field"><label class="f-label">Ocultar puntos con monto menor a</label><input type="number" id="pvMinFilter" value="0" style="max-width:200px;"></div></div>';
  html += '<div class="grid grid-2"><div class="chart-box" style="height:380px;"><canvas id="chartCausPvSemanal"></canvas></div><div class="chart-box" style="height:380px;"><canvas id="chartCausPvBar"></canvas></div></div>';
  html += '<div class="card" style="margin-top:18px;"><h3>Detalle por punto de venta</h3><div class="table-wrap"><table class="data-table"><thead><tr><th style="text-align:left;">Punto de venta</th><th>Monto acumulado</th><th>% del total</th></tr></thead><tbody id="pvTableBody"></tbody></table></div></div>';
  html += '<div id="findingsCausPv"></div>';
  c.innerHTML = html;

  const renderFiltered = () => {
    const minVal = parseFloat(document.getElementById('pvMinFilter').value) || 0;
    const filtered = puntos.filter(p => p.MONTO >= minVal);
    const tbody = document.getElementById('pvTableBody');
    tbody.innerHTML = filtered.map(p => '<tr><td>' + p.PUNTO_VENTA + '</td><td>' + fmtMoney(p.MONTO, 2) + '</td><td>' + fmtPct(safeDiv(p.MONTO, total)) + '</td></tr>').join('');
    drawHBarChart('chartCausPvBar', 'Ingreso CAUS por punto de venta', filtered.map(p => p.PUNTO_VENTA), filtered.map(p => p.MONTO), COLORS.vino);
  };
  document.getElementById('pvMinFilter').addEventListener('input', renderFiltered);
  renderFiltered();

  const semMax = STATE.cutoff.semana || 52;
  const anio = STATE.cutoff.anio;
  const weekLabels = Array.from({ length: semMax }, (_, i) => 'S' + (i + 1));
  const topPv = puntos.slice(0, 6).map(p => p.PUNTO_VENTA);
  const palette = [COLORS.vino, COLORS.naranja, COLORS.vinoOscuro, COLORS.rojoAux1, COLORS.verde, COLORS.rojoAux2];
  const dsWeek = topPv.map((pv, i) => {
    const series = Array.from({ length: semMax }, (_, wIdx) => {
      const rows = STATE.caus.rows.filter(r => r.PUNTO_VENTA === pv && r.ANIO_ISO === anio && r.SEMANA_ISO === wIdx + 1);
      return rows.length ? rows.reduce((s, r) => s + r.INGRESO_CAUS, 0) : null;
    });
    return { label: pv, data: series, color: palette[i % palette.length] };
  });
  drawLineChart('chartCausPvSemanal', 'Ingreso semanal por punto de venta (top 6)', weekLabels, dsWeek, []);

  renderFindings(document.getElementById('findingsCausPv'), hallazgosCausPuntoVenta(puntos));
}

/* ---------------- CHART.JS HELPERS ---------------- */
function baseChartOptions(title, isPct) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      title: { display: true, text: title, font: { family: 'Montserrat', weight: '700', size: 12.5 }, color: COLORS.vinoOscuro },
      legend: { display: true, labels: { font: { size: 10.5 } } },
      tooltip: { callbacks: {} },
    },
    scales: { y: { ticks: { callback: v => isPct ? (v + '%') : v } }, x: { ticks: { maxRotation: 0, autoSkip: true, font: { size: 9.5 } } } },
  };
}

function drawBarChart(canvasId, title, labels, datasets) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const isPct = datasets.some(d => d.isPct);
  STATE.charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: datasets.map(d => ({ label: d.label, data: d.data, backgroundColor: d.color, borderRadius: 4 })) },
    options: baseChartOptions(title, isPct),
  });
}

function drawHBarChart(canvasId, title, labels, data, color) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  // En modo horizontal (indexAxis:'y') el eje Y pasa a ser el de categorías (los
  // nombres de punto de venta), no el de valores — el callback numérico de
  // baseChartOptions pensado para el eje Y vertical no aplica aquí; si se deja, Chart.js
  // termina mostrando el índice (0,1,2…) en vez del nombre. Se define un set de scales
  // propio para este gráfico en vez de heredar el de baseChartOptions.
  const opts = baseChartOptions(title);
  opts.indexAxis = 'y';
  opts.scales = {
    y: { ticks: { font: { size: 9.5 } } },
    x: { ticks: { maxRotation: 0, autoSkip: true, font: { size: 9.5 } } },
  };
  STATE.charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: title, data, backgroundColor: color, borderRadius: 4 }] },
    options: opts,
  });
}

// Plugin ligero para líneas verticales de inicio/retiro de campaña (evita depender de librerías externas de anotación)
const campaignLinePlugin = {
  id: 'campaignLinePlugin',
  afterDraw(chart) {
    const lines = chart.options.plugins && chart.options.plugins.campaignLinesData;
    if (!lines || !lines.length) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    ctx.save();
    lines.forEach(cl => {
      const x = scales.x.getPixelForValue('S' + cl.week);
      if (x === undefined || isNaN(x)) return;
      ctx.beginPath();
      ctx.strokeStyle = cl.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    });
    ctx.restore();
  }
};
if (typeof Chart !== 'undefined') Chart.register(campaignLinePlugin);

function drawLineChart(canvasId, title, labels, datasets, campaignLines, isPct) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const opts = baseChartOptions(title, isPct);
  opts.plugins.campaignLinesData = campaignLines || [];
  STATE.charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: datasets.map(d => ({ label: d.label, data: isPct ? d.data.map(v => v === null ? null : v * 100) : d.data, borderColor: d.color, backgroundColor: d.color, spanGaps: true, tension: .25, pointRadius: 2 })) },
    options: opts,
  });
}

/* ---------------- TAB: EXPORTAR (validación previa) ---------------- */
function renderExportTab() {
  const c = document.getElementById('exportValidation');
  const checks = [];
  checks.push({ ok: STATE.historical.loaded, label: 'Base histórica cargada' });
  checks.push({ ok: STATE.cutoff.anio !== null, label: 'Semana de corte detectada (S' + STATE.cutoff.semana + ' · ' + STATE.cutoff.anio + ')' });
  checks.push({ ok: STATE.closureLines.size > 0, label: 'Al menos una línea seleccionada en la estrategia de cierre' });
  checks.push({ ok: STATE.oxxo.loaded || STATE.caus.loaded, label: 'Al menos una fuente de ingreso electrónico cargada (OXXO o CAUS)', warn: !(STATE.oxxo.loaded || STATE.caus.loaded) });
  checks.push({ ok: Object.keys(STATE.lineExceptions).length === 0, label: 'Sin claves de ruta pendientes de clasificar', warn: Object.keys(STATE.lineExceptions).length > 0 });
  let html = '';
  checks.forEach(chk => {
    const badge = chk.ok ? '<span class="badge badge-ok">OK</span>' : (chk.warn ? '<span class="badge badge-warn">Revisar</span>' : '<span class="badge badge-err">Falta</span>');
    html += '<div style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:12.5px;">' + badge + '<span>' + chk.label + '</span></div>';
  });
  c.innerHTML = html;
  const canExport = STATE.historical.loaded && STATE.cutoff.anio !== null;
  document.getElementById('btnExportPptx').disabled = !canExport;
  document.getElementById('btnExportExcel').disabled = !canExport;
}

function fullRerender() {
  renderQualityPanel();
  renderCutoffPanel();
  renderHistoricoStatus();
  const activeTab = document.querySelector('nav.app-nav button.active');
  if (activeTab) activateTab(activeTab.dataset.tab);
}

/* ==========================================================================
   8. EXPORTACIÓN A EXCEL
   ========================================================================== */
function exportExcel() {
  const statusEl = document.getElementById('excelStatus');
  statusEl.textContent = 'Generando archivo…';
  try {
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.consolidated), 'RAW_CONCATENADO');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.consolidated), 'AGRUPADO_AÑO_SEMANA_RUTA');

    const porLinea = {};
    STATE.consolidated.forEach(r => {
      const lb = rowLineaBase(r);
      if (lb === null) return;
      const key = r.ANIO + '|' + r.SEMANA + '|' + lb;
      if (!porLinea[key]) porLinea[key] = { ANIO: r.ANIO, SEMANA: r.SEMANA, LINEA: lb, ASCENSOS: 0, DINERO_FISICO: 0, INGRESO_ELECTRONICO: 0, INGRESO_TOTAL: 0 };
      const g = porLinea[key];
      g.ASCENSOS += r.ASCENSOS || 0;
      g.DINERO_FISICO += r.DINERO_FISICO || 0;
      g.INGRESO_ELECTRONICO += r.INGRESO_ELECTRONICO || 0;
      const it = ingresoTotalOf(r); if (it !== null) g.INGRESO_TOTAL += it;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(porLinea)), 'AGRUPADO_AÑO_SEMANA_LINEA');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(computeResumenSistema()), 'RESUMEN_SISTEMA');

    function flattenLineTable(lt) {
      const out = [];
      lt.rows.forEach(row => row.years.forEach(y => out.push({
        LINEA: row.linea, ANIO: y.ANIO, ASCENSOS: y.ASCENSOS, INGRESO_TOTAL: y.INGRESO_TOTAL,
        RECAUDO_FISICO: y.DINERO_FISICO, INGRESO_ELECTRONICO: y.INGRESO_ELECTRONICO,
        TARIFA_PROMEDIO: y.TARIFA_PROMEDIO, PARTICIPACION_ELECTRONICA: y.PARTICIPACION_ELECTRONICA,
        PCT_PAGO_ELECTRONICO: y.PCT_PAGO_ELECTRONICO, CLAVES: row.claves.join(' '),
      })));
      return out;
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flattenLineTable(computeLineTable(Array.from(STATE.closureLines)))), 'ESTRATEGIA_CIERRE');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flattenLineTable(computeLineTable(STATE.allLineasBase.filter(l => !STATE.closureLines.has(l))))), 'RESTO_SISTEMA');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.oxxo.weekly), 'OXXO_SEMANAL');
    const oxxoPorArchivo = Object.values(STATE.oxxo.porArchivo || {}).map(fa => ({
      ARCHIVO: fa.archivo, FILAS_LEIDAS: fa.filasLeidas, FILAS_VALIDAS: fa.filasValidas,
      DESCARTADAS_FORMATO: fa.filasDescartadasFormato, DESCARTADAS_TARJETA: fa.filasDescartadasTarjeta,
      DESCARTADAS_FECHA_IMPORTE: fa.filasDescartadasFechaImporte, MONTO: fa.monto,
      SEMANAS: Array.from(fa.semanas).sort().join(', '),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oxxoPorArchivo), 'OXXO_POR_ARCHIVO');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.caus.rows), 'CAUS_DETALLE');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.caus.weekly), 'CAUS_SEMANAL');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(STATE.quality.issues), 'CALIDAD_DATOS');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const fname = 'Analisis_Integral_Recaudo_Hermosillo_Semana' + STATE.cutoff.semana + '_' + STATE.cutoff.anio + '.xlsx';
    saveAs(blob, fname);
    statusEl.textContent = 'Descargado: ' + fname;
  } catch (err) {
    statusEl.textContent = 'Error al generar el Excel: ' + err.message;
    console.error(err);
  }
}

/* ==========================================================================
   9. EXPORTACIÓN A POWERPOINT
   ========================================================================== */
const PPTX_C = {
  vino: '960E53', vinoOscuro: '410324', naranja: 'DC7F37',
  verde: '1B7F4A', rojo: 'B91C1C', gris: '595959', cardBg: 'F7F3F5', cardBorder: 'E4E1E3',
};
const PPTX_FONT = 'Calibri';

function pptxAddHeader(slide, pres, title, subtitle) {
  slide.background = { color: 'FFFFFF' };
  slide.addText(title, { x: 0.4, y: 0.28, w: 10.6, h: 0.55, fontFace: PPTX_FONT, fontSize: 25, bold: true, color: PPTX_C.vino, align: 'left', valign: 'bottom', margin: 0 });
  if (subtitle) slide.addText(subtitle, { x: 0.4, y: 0.80, w: 12.0, h: 0.3, fontFace: PPTX_FONT, fontSize: 12.5, color: PPTX_C.gris, align: 'left', valign: 'top', margin: 0 });
  slide.addShape('rect', { x: 0.4, y: 1.14, w: 12.53, h: 0.022, fill: { color: PPTX_C.naranja }, line: { type: 'none' } });
}
function pptxAddFooter(slide, pageNum) {
  slide.addText('IMTES · Análisis integral del recaudo · Semanas 1 a ' + STATE.cutoff.semana + ' de ' + STATE.cutoff.anio, {
    x: 12.933 - 5.0, y: 7.18, w: 4.6, h: 0.26, fontFace: PPTX_FONT, fontSize: 8, color: PPTX_C.gris, align: 'right', margin: 0,
  });
  if (pageNum) slide.addText(String(pageNum), { x: 12.933 - 0.55, y: 7.18, w: 0.4, h: 0.26, fontFace: PPTX_FONT, fontSize: 8, color: PPTX_C.gris, align: 'right', margin: 0 });
}

async function exportPptx() {
  const statusEl = document.getElementById('pptxStatus');
  statusEl.innerHTML = '<span class="spinner" style="border-top-color:' + COLORS.vino + ';border-color:rgba(150,14,83,.3);"></span> Generando presentación…';
  try {
    const pres = new PptxGenJS();
    pres.defineLayout({ name: 'LAYOUT_WIDE', width: 13.333, height: 7.5 });
    pres.layout = 'LAYOUT_WIDE';
    let page = 1;

    // ---- 1. Resumen del sistema ----
    {
      const s = pres.addSlide();
      pptxAddHeader(s, pres, 'Resumen del sistema de recaudo', 'Comparación homogénea, semana 1 a semana ' + STATE.cutoff.semana + ' de ' + STATE.cutoff.anio);
      const rows = computeResumenSistema();
      const head = ['Año', 'Recaudo físico', 'Ingreso electrónico', 'Ingreso total', 'Ascensos', 'Participación electrónica', 'Var. ingreso vs año anterior'].map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PPTX_C.vinoOscuro }, fontSize: 9.5, align: 'center', valign: 'middle' } }));
      const tblRows = [head];
      rows.forEach((r, i) => {
        const fill = i % 2 === 0 ? 'FFFFFF' : 'EAF2F8';
        tblRows.push([
          { text: String(r.ANIO), options: { fontSize: 9.5, align: 'center', fill: { color: fill }, bold: true } },
          { text: fmtMoney(r.DINERO_FISICO, 2), options: { fontSize: 9, align: 'right', fill: { color: fill } } },
          { text: fmtMoney(r.INGRESO_ELECTRONICO, 2), options: { fontSize: 9, align: 'right', fill: { color: fill } } },
          { text: fmtMoney(r.INGRESO_TOTAL, 2), options: { fontSize: 9, align: 'right', fill: { color: fill }, bold: true, color: PPTX_C.vino } },
          { text: fmtInt(r.ASCENSOS), options: { fontSize: 9, align: 'right', fill: { color: fill } } },
          { text: fmtPct(r.PARTICIPACION_ELECTRONICA), options: { fontSize: 9, align: 'right', fill: { color: fill }, color: PPTX_C.naranja, bold: true } },
          { text: r.VAR_INGRESO_TOTAL === null ? 'N/D' : fmtSigned(r.VAR_INGRESO_TOTAL, true), options: { fontSize: 9, align: 'right', fill: { color: fill }, color: r.VAR_INGRESO_TOTAL === null ? PPTX_C.gris : (r.VAR_INGRESO_TOTAL < 0 ? PPTX_C.rojo : PPTX_C.verde), bold: true } },
        ]);
      });
      s.addTable(tblRows, { x: 0.4, y: 1.35, w: 12.53, colW: [1.1, 2.0, 2.0, 2.0, 1.83, 2.0, 1.6], border: { type: 'solid', color: 'E0E0E0', pt: 0.5 }, autoPage: false, rowH: 0.34 });
      const findings = hallazgosResumen(rows);
      s.addText('Hallazgos', { x: 0.4, y: 1.35 + 0.34 * tblRows.length + 0.2, w: 12.53, h: 0.26, fontFace: PPTX_FONT, fontSize: 13, bold: true, color: PPTX_C.vinoOscuro, margin: 0 });
      let fy = 1.35 + 0.34 * tblRows.length + 0.5;
      findings.forEach(f => { s.addText('✓ ' + f, { x: 0.4, y: fy, w: 12.53, h: 0.32, fontFace: PPTX_FONT, fontSize: 11, color: '222222', margin: 0 }); fy += 0.34; });
      pptxAddFooter(s, page); page++;
    }

    // ---- 2. Estrategia de cierre: comparativo semanal (última semana, semana anterior, semana de referencia) ----
    function addLineTableSlidesWeekly(lineas, sectionTitle) {
      const lt = computeLineTableWeekly(lineas);
      if (!lt.rows.length) return;
      const chunks = [];
      for (let i = 0; i < lt.rows.length; i += 4) chunks.push(lt.rows.slice(i, i + 4));
      chunks.forEach((chunkRows, ci) => {
        const s = pres.addSlide();
        const part = chunks.length > 1 ? '  ·  Parte ' + (ci + 1) + ' de ' + chunks.length : '';
        pptxAddHeader(s, pres, sectionTitle, 'Última semana: S' + lt.semUltima + ' de ' + lt.anio + ' | Referencia: inicio de campaña por línea' + part);
        const indicators = [
          { key: 'ASCENSOS', label: 'Ascensos', fmt: fmtInt },
          { key: 'INGRESO_TOTAL', label: 'Ingreso Total', fmt: v => fmtMoney(v, 2) },
          { key: 'DINERO_FISICO', label: 'Recaudo Físico', fmt: v => fmtMoney(v, 2) },
          { key: 'INGRESO_ELECTRONICO', label: 'Ingreso Electrónico', fmt: v => fmtMoney(v, 2) },
          { key: 'TARIFA_PROMEDIO', label: 'Tarifa Promedio', fmt: v => v === null ? 'N/D' : '$' + v.toFixed(2), hi: true },
          { key: 'EVASION', label: 'Evasión Estimada', fmt: v => v === null ? 'N/D' : fmtMoney(v, 2) },
        ];
        const colW = [1.3, 2.2, 1.7, 1.7, 1.7, 1.965, 1.965];
        const cellMargin = [0.02, 0.05, 0.02, 0.05];
        const head = ['Línea', 'Indicador', 'Sem. Referencia', 'Sem. Anterior', 'Última Semana', 'Var. vs Anterior', 'Var. vs Referencia']
          .map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PPTX_C.vinoOscuro }, fontSize: 8.5, align: 'right', valign: 'middle', margin: cellMargin } }));
        head[0].options.align = 'left'; head[1].options.align = 'left';
        const rows = [head];
        chunkRows.forEach((row, bi) => {
          const blockFill = bi % 2 === 0 ? 'FFFFFF' : 'F7FAFC';
          indicators.forEach((ind, ii) => {
            const vAnt = row.varsVsAnterior[ind.key];
            const vRef = row.varsVsReferencia[ind.key];
            const rowFill = ind.hi ? 'FBEFF4' : blockFill;
            const r = [];
            if (ii === 0) r.push({ text: 'Línea ' + row.linea + '\n(ref. S' + row.semReferencia + ')', options: { rowspan: indicators.length, bold: true, color: PPTX_C.vinoOscuro, fill: { color: 'EFEFEF' }, fontSize: 9.5, align: 'left', valign: 'middle', margin: cellMargin } });
            r.push({ text: ind.label, options: { bold: !!ind.hi, fontSize: 8, align: 'left', fill: { color: rowFill }, color: ind.hi ? PPTX_C.vinoOscuro : '222222', margin: cellMargin } });
            r.push({ text: ind.fmt(row.wReferencia[ind.key]), options: { fontSize: 8, align: 'right', fill: { color: rowFill }, bold: !!ind.hi, color: ind.hi ? PPTX_C.vino : '222222', margin: cellMargin } });
            r.push({ text: row.wAnterior ? ind.fmt(row.wAnterior[ind.key]) : 'N/D', options: { fontSize: 8, align: 'right', fill: { color: rowFill }, bold: !!ind.hi, color: ind.hi ? PPTX_C.vino : '222222', margin: cellMargin } });
            r.push({ text: ind.fmt(row.wUltima[ind.key]), options: { fontSize: 8, align: 'right', fill: { color: rowFill }, bold: !!ind.hi, color: ind.hi ? PPTX_C.vino : '222222', margin: cellMargin } });
            r.push({ text: (vAnt === null || vAnt === undefined) ? 'N/D' : fmtSigned(vAnt, true), options: { fontSize: 8, align: 'right', fill: { color: rowFill }, bold: !!ind.hi, color: (vAnt === null || vAnt === undefined) ? PPTX_C.gris : (vAnt < 0 ? PPTX_C.rojo : PPTX_C.verde), margin: cellMargin } });
            r.push({ text: (vRef === null || vRef === undefined) ? 'N/D' : fmtSigned(vRef, true), options: { fontSize: 8, align: 'right', fill: { color: rowFill }, bold: !!ind.hi, color: (vRef === null || vRef === undefined) ? PPTX_C.gris : (vRef < 0 ? PPTX_C.rojo : PPTX_C.verde), margin: cellMargin } });
            rows.push(r);
          });
        });
        const rowH = 0.205;
        s.addTable(rows, { x: 0.4, y: 1.30, w: colW.reduce((a, b) => a + b, 0), colW, border: { type: 'solid', color: 'E0E0E0', pt: 0.5 }, autoPage: false, rowH });
        const findings = hallazgosLineTableWeekly(chunkRows);
        let fy = 1.30 + rowH * rows.length + 0.15;
        findings.forEach(f => { s.addText('✓ ' + f, { x: 0.4, y: fy, w: 12.53, h: 0.26, fontFace: PPTX_FONT, fontSize: 9.5, color: '222222', margin: 0 }); fy += 0.28; });
        pptxAddFooter(s, page); page++;
      });
    }

    // ---- 3. Resto del sistema: comparativo anual (sin cambios) ----
    function addLineTableSlides(lineas, sectionTitle) {
      const lt = computeLineTable(lineas);
      if (!lt.rows.length) return;
      const chunks = [];
      for (let i = 0; i < lt.rows.length; i += 4) chunks.push(lt.rows.slice(i, i + 4));
      chunks.forEach((chunkRows, ci) => {
        const s = pres.addSlide();
        const part = chunks.length > 1 ? '  ·  Parte ' + (ci + 1) + ' de ' + chunks.length : '';
        pptxAddHeader(s, pres, sectionTitle, 'Semana 1 a semana ' + STATE.cutoff.semana + ' | Comparativo ' + lt.years.join('–') + part);
        const indicators = [
          { key: 'ASCENSOS', label: 'Ascensos', fmt: fmtInt },
          { key: 'INGRESO_TOTAL', label: 'Ingreso Total', fmt: v => fmtMoney(v, 2) },
          { key: 'DINERO_FISICO', label: 'Recaudo Físico', fmt: v => fmtMoney(v, 2) },
          { key: 'INGRESO_ELECTRONICO', label: 'Ingreso Electrónico', fmt: v => fmtMoney(v, 2) },
          { key: 'TARIFA_PROMEDIO', label: 'Tarifa Promedio', fmt: v => v === null ? 'N/D' : '$' + v.toFixed(2), hi: true },
          { key: 'EVASION', label: 'Evasión Estimada', fmt: v => v === null ? 'N/D' : fmtMoney(v, 2) },
        ];
        const colW = [1.5, 2.8, 2.05, 2.05, 2.05, 2.08];
        const cellMargin = [0.02, 0.06, 0.02, 0.06];
        const head = ['Línea', 'Indicador'].concat(lt.years.map(String)).concat(['Var. ' + lt.years[lt.years.length - 1] + ' vs ' + lt.years[0]])
          .map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PPTX_C.vinoOscuro }, fontSize: 9.5, align: 'right', valign: 'middle', margin: cellMargin } }));
        head[0].options.align = 'left'; head[1].options.align = 'left';
        const rows = [head];
        chunkRows.forEach((row, bi) => {
          const blockFill = bi % 2 === 0 ? 'FFFFFF' : 'F7FAFC';
          indicators.forEach((ind, ii) => {
            const v = row.varsVsPrimero[ind.key];
            const rowFill = ind.hi ? 'FBEFF4' : blockFill;
            const r = [];
            if (ii === 0) r.push({ text: 'Línea ' + row.linea, options: { rowspan: indicators.length, bold: true, color: PPTX_C.vinoOscuro, fill: { color: 'EFEFEF' }, fontSize: 10, align: 'left', valign: 'middle', margin: cellMargin } });
            r.push({ text: ind.label, options: { bold: !!ind.hi, fontSize: 8.5, align: 'left', fill: { color: rowFill }, color: ind.hi ? PPTX_C.vinoOscuro : '222222', margin: cellMargin } });
            row.years.forEach(y => r.push({ text: ind.fmt(y[ind.key]), options: { fontSize: 8.5, align: 'right', fill: { color: rowFill }, bold: !!ind.hi, color: ind.hi ? PPTX_C.vino : '222222', margin: cellMargin } }));
            r.push({ text: (v === null || v === undefined) ? 'N/D' : fmtSigned(v, true), options: { fontSize: 8.5, align: 'right', fill: { color: rowFill }, bold: !!ind.hi, color: (v === null || v === undefined) ? PPTX_C.gris : (v < 0 ? PPTX_C.rojo : PPTX_C.verde), margin: cellMargin } });
            rows.push(r);
          });
        });
        const rowH = 0.205;
        s.addTable(rows, { x: 0.4, y: 1.30, w: colW.reduce((a, b) => a + b, 0), colW, border: { type: 'solid', color: 'E0E0E0', pt: 0.5 }, autoPage: false, rowH });
        const findings = hallazgosLineTable(chunkRows);
        let fy = 1.30 + rowH * rows.length + 0.15;
        findings.forEach(f => { s.addText('✓ ' + f, { x: 0.4, y: fy, w: 12.53, h: 0.26, fontFace: PPTX_FONT, fontSize: 9.5, color: '222222', margin: 0 }); fy += 0.28; });
        pptxAddFooter(s, page); page++;
      });
    }
    addLineTableSlidesWeekly(Array.from(STATE.closureLines), 'Líneas en la estrategia de cierre del sistema de recaudo');
    addLineTableSlides(STATE.allLineasBase.filter(l => !STATE.closureLines.has(l)), 'Comportamiento del resto del sistema');

    // ---- 4. Evolución semanal (líneas de la estrategia de cierre) ----
    {
      const lineas = Array.from(STATE.closureLines).slice(0, 6);
      if (lineas.length) {
        const years = [STATE.cutoff.anio];
        const series = computeWeeklySeries(lineas, years);
        const semLabels = Array.from({ length: STATE.cutoff.semana }, (_, i) => 'S' + (i + 1));
        const s = pres.addSlide();
        pptxAddHeader(s, pres, 'Evolución semanal — ascensos y pago electrónico', 'Semana 1 a semana ' + STATE.cutoff.semana + ' de ' + STATE.cutoff.anio + ' | Líneas de la estrategia de cierre');
        const palette = [PPTX_C.vino, PPTX_C.naranja, PPTX_C.vinoOscuro, 'B94645', '1B7F4A', '9B2F3E'];
        const ascData = lineas.map((l, i) => ({ name: 'Línea ' + l, labels: semLabels, values: series[l][STATE.cutoff.anio].map(w => w.ASCENSOS) }));
        s.addText('Ascensos por semana', { x: 0.4, y: 1.25, w: 6.0, h: 0.26, fontFace: PPTX_FONT, fontSize: 12, bold: true, color: PPTX_C.vinoOscuro, margin: 0 });
        s.addChart(pres.ChartType.line, ascData, { x: 0.4, y: 1.55, w: 6.05, h: 3.4, chartColors: palette, showLegend: true, legendPos: 'b', legendFontSize: 8, catAxisLabelFontSize: 6, lineSize: 2 });
        const pctData = lineas.map((l, i) => ({ name: 'Línea ' + l, labels: semLabels, values: series[l][STATE.cutoff.anio].map(w => w.PCT_PAGO_ELECTRONICO === null ? null : w.PCT_PAGO_ELECTRONICO * 100) }));
        s.addText('Porcentaje de pago electrónico por semana', { x: 6.9, y: 1.25, w: 6.0, h: 0.26, fontFace: PPTX_FONT, fontSize: 12, bold: true, color: PPTX_C.vinoOscuro, margin: 0 });
        s.addChart(pres.ChartType.line, pctData, { x: 6.9, y: 1.55, w: 6.05, h: 3.4, chartColors: palette, showLegend: true, legendPos: 'b', legendFontSize: 8, catAxisLabelFontSize: 6, lineSize: 2 });
        pptxAddFooter(s, page); page++;
      }
    }

    // ---- 5. Ingreso electrónico OXXO vs CAUS ----
    if (STATE.oxxo.loaded || STATE.caus.loaded) {
      const data = computeOxxoCausWeekly();
      const s = pres.addSlide();
      pptxAddHeader(s, pres, 'Ingreso electrónico — OXXO y CAUS', 'Semana 1 a semana ' + STATE.cutoff.semana + ' de ' + STATE.cutoff.anio);
      const labels = data.series.map(w => 'S' + w.SEMANA);
      const chartData = [];
      if (data.tieneOxxo) chartData.push({ name: 'OXXO', labels, values: data.series.map(w => w.OXXO) });
      if (data.tieneCaus) chartData.push({ name: 'CAUS', labels, values: data.series.map(w => w.CAUS) });
      s.addChart(pres.ChartType.line, chartData, {
        x: 0.4, y: 1.3, w: 8.2, h: 4.3, chartColors: [PPTX_C.vino, PPTX_C.naranja],
        showLegend: true, legendPos: 'b', legendFontSize: 9, catAxisLabelFontSize: 7,
        showValue: true, dataLabelPosition: 't', dataLabelFontSize: 6.5, dataLabelColor: '444444',
        dataLabelFormatCode: '$#,##0,"k"',
      });
      let cy = 1.3, cx = 8.85, cw = 12.933 - 0.4 - cx, ch = 0.72, gap = 0.13;
      function card(label, val, color) {
        s.addShape('roundRect', { x: cx, y: cy, w: cw, h: ch, rectRadius: 0.06, fill: { color: PPTX_C.cardBg }, line: { color: PPTX_C.cardBorder, width: 1 } });
        s.addText(label, { x: cx + 0.12, y: cy + 0.06, w: cw - 0.24, h: 0.24, fontFace: PPTX_FONT, fontSize: 9.5, color: PPTX_C.gris, margin: 0 });
        s.addText(val, { x: cx + 0.12, y: cy + 0.30, w: cw - 0.24, h: 0.38, fontFace: PPTX_FONT, fontSize: 17, bold: true, color: color, margin: 0 });
        cy += ch + gap;
      }
      card('OXXO acumulado', data.tieneOxxo ? fmtMoney(data.totalOxxo, 2) : 'N/D', PPTX_C.vino);
      card('CAUS acumulado', data.tieneCaus ? fmtMoney(data.totalCaus, 2) : 'N/D', PPTX_C.naranja);
      card('Total Ingreso Electrónico', data.totalConjunto !== null ? fmtMoney(data.totalConjunto, 2) : 'N/D', PPTX_C.vinoOscuro);
      if (data.varOxxo !== null) card('Var. OXXO vs año anterior', fmtSigned(data.varOxxo, true), data.varOxxo >= 0 ? PPTX_C.verde : PPTX_C.rojo);
      if (data.varCaus !== null) card('Var. CAUS vs año anterior', fmtSigned(data.varCaus, true), data.varCaus >= 0 ? PPTX_C.verde : PPTX_C.rojo);
      pptxAddFooter(s, page); page++;
    } else {
      const s = pres.addSlide();
      pptxAddHeader(s, pres, 'Ingreso electrónico — OXXO y CAUS', 'Semana 1 a semana ' + STATE.cutoff.semana + ' de ' + STATE.cutoff.anio);
      s.addText('Para generar las gráficas de ingreso electrónico, adjunta los archivos OXXO (.DAT) y los reportes CAUS (.xlsx).', { x: 1.5, y: 3.2, w: 10.3, h: 1.0, fontFace: PPTX_FONT, fontSize: 16, bold: true, color: PPTX_C.vino, align: 'center', valign: 'middle', margin: 0 });
      pptxAddFooter(s, page); page++;
    }

    // ---- 6. CAUS por punto de venta ----
    if (STATE.caus.loaded) {
      const s = pres.addSlide();
      pptxAddHeader(s, pres, 'CAUS por punto de venta', 'Semana 1 a semana ' + STATE.cutoff.semana + ' de ' + STATE.cutoff.anio);
      const puntos = STATE.caus.puntoVenta;
      const total = puntos.reduce((a, p) => a + p.MONTO, 0);
      const top = puntos.slice(0, 8);
      const topForChart = top.slice().reverse(); // en gráficas de barra horizontal, el primer elemento del arreglo queda abajo — se invierte para que el de mayor ingreso quede arriba
      s.addChart(pres.ChartType.bar, [{ name: 'Ingreso CAUS', labels: topForChart.map(p => p.PUNTO_VENTA), values: topForChart.map(p => p.MONTO) }], { x: 0.4, y: 1.3, w: 7.6, h: 4.3, barDir: 'bar', chartColors: [PPTX_C.vino], showValue: true, dataLabelFormatCode: '$#,##0,"k"', showLegend: false, catAxisLabelFontSize: 9 });
      const rx = 8.2, rw = 12.933 - 0.4 - rx;
      const head = ['Punto', 'Monto', '%'].map((t, i) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PPTX_C.vinoOscuro }, fontSize: 9, align: i === 0 ? 'left' : 'right' } }));
      const tblRows = [head];
      puntos.slice(0, 8).forEach((p, i) => tblRows.push([
        { text: p.PUNTO_VENTA, options: { fontSize: 9, align: 'left', fill: { color: i % 2 === 0 ? 'FFFFFF' : 'EAF2F8' } } },
        { text: fmtMoney(p.MONTO, 2), options: { fontSize: 8.5, align: 'right', fill: { color: i % 2 === 0 ? 'FFFFFF' : 'EAF2F8' } } },
        { text: fmtPct(safeDiv(p.MONTO, total)), options: { fontSize: 9, align: 'right', fill: { color: i % 2 === 0 ? 'FFFFFF' : 'EAF2F8' }, color: PPTX_C.naranja, bold: true } },
      ]));
      s.addTable(tblRows, { x: rx, y: 1.3, w: rw, colW: [rw * 0.42, rw * 0.36, rw * 0.22], border: { type: 'solid', color: 'E0E0E0', pt: 0.5 }, autoPage: false, rowH: 0.3 });
      const findings = hallazgosCausPuntoVenta(puntos);
      let fy = 1.3 + 0.3 * tblRows.length + 0.2;
      findings.forEach(f => { s.addText('✓ ' + f, { x: rx, y: fy, w: rw, h: 0.5, fontFace: PPTX_FONT, fontSize: 9.5, color: '222222', margin: 0 }); fy += 0.55; });
      pptxAddFooter(s, page); page++;
    }

    const fname = 'Analisis_Integral_Recaudo_Hermosillo_Semana' + STATE.cutoff.semana + '_' + STATE.cutoff.anio + '.pptx';
    await pres.writeFile({ fileName: fname });
    statusEl.textContent = 'Descargado: ' + fname;
  } catch (err) {
    statusEl.textContent = 'Error al generar el PowerPoint: ' + err.message;
    console.error(err);
  }
}

/* ==========================================================================
   GOOGLE DRIVE (opcional) — conexión con carpetas "Recargas_Oxxo" / "Recargas_CAUS"
   Requiere que el propio usuario aporte su API Key y OAuth Client ID de un
   proyecto de Google Cloud (Drive API + Picker API habilitadas). Las
   credenciales se guardan únicamente en localStorage de este navegador.
   Nota de privacidad: a diferencia del resto de la app, esta función SÍ hace
   llamadas de red — pero directamente entre el navegador del usuario y los
   servidores de Google, usando la sesión propia del usuario. Nunca pasa por
   un servidor de terceros.
   ========================================================================== */
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
let gdriveTokenClient = null;
let gdriveTokenClientId = null;
let gdriveAccessToken = null;
let gdrivePickerReady = false;

// Credenciales por defecto del proyecto de Google Cloud de IMTES (paradas-project).
// No son secretas: su seguridad depende de las restricciones (referrer HTTP / APIs
// permitidas) configuradas en Google Cloud Console, no de mantenerlas ocultas.
// El panel de configuración de la app permite sobreescribirlas si algún día cambian.
const GDRIVE_DEFAULT_API_KEY = 'AIzaSyAEr_qNbI_phspN1IRc-UJ4eupCB_FCj00';
const GDRIVE_DEFAULT_CLIENT_ID = '459212884152-k0p4n13eamidd5a2guokqprq92nandpp.apps.googleusercontent.com';
// Carpetas conocidas de antemano: al conectar OXXO/CAUS se usan directo, sin pasar por
// el selector de Drive. Si algún día cambian, basta con actualizar estos dos valores.
const GDRIVE_DEFAULT_FOLDERS = {
  historico: { id: '1bIF2l_efV5j8u4fQpVgJbL_QNv-7ZaVo', name: 'Histórico' },
  oxxo: { id: '1iw89IKptMQI2SQc7DMMEH-j8NR02EVOm', name: 'Recargas OXXO' },
  caus: { id: '1WHeRQqlqUP0uxvoKlDyRo21tDrOtEk7C', name: 'Recargas CAUS' },
  sabanas: { id: '17XhSSOu07CD3KggMQAW_UQS1-76iiUpG', name: 'Sabana de Descuentos' },
};

function gdriveGetConfig() {
  const savedApiKey = localStorage.getItem('gdrive_api_key');
  const savedClientId = localStorage.getItem('gdrive_client_id');
  return {
    apiKey: savedApiKey || GDRIVE_DEFAULT_API_KEY,
    clientId: savedClientId || GDRIVE_DEFAULT_CLIENT_ID,
    isCustom: !!(savedApiKey || savedClientId),
  };
}
function gdriveSaveConfig(apiKey, clientId) {
  localStorage.setItem('gdrive_api_key', apiKey);
  localStorage.setItem('gdrive_client_id', clientId);
}
function gdriveClearConfig() {
  localStorage.removeItem('gdrive_api_key');
  localStorage.removeItem('gdrive_client_id');
  localStorage.removeItem('gdrive_folder_oxxo');
  localStorage.removeItem('gdrive_folder_caus');
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-gdrive-src="' + src + '"]')) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.defer = true;
    s.dataset.gdriveSrc = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar ' + src + ' (revisa tu conexión a internet).'));
    document.head.appendChild(s);
  });
}

async function gdriveEnsureGisLoaded() {
  await loadScriptOnce('https://accounts.google.com/gsi/client');
}

async function gdriveEnsureApisLoaded() {
  await loadScriptOnce('https://apis.google.com/js/api.js');
  if (!gdrivePickerReady) {
    await new Promise((resolve, reject) => {
      gapi.load('picker', { callback: resolve, onerror: reject });
    });
    gdrivePickerReady = true;
  }
  await gdriveEnsureGisLoaded();
}

// Cliente de OAuth reutilizable: se crea una sola vez (en cuanto GIS está disponible)
// para poder llamar requestAccessToken() de forma SÍNCRONA dentro del manejador de
// clic. Cualquier "await" antes de abrir el popup de Google —aunque se resuelva al
// instante— hace que algunos navegadores (Safari en particular) dejen de reconocerlo
// como respuesta directa al clic del usuario y lo bloqueen.
function gdriveEnsureTokenClient(clientId) {
  if (gdriveTokenClient && gdriveTokenClientId === clientId) return true;
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return false;
  gdriveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GDRIVE_SCOPE,
    callback: () => {},
  });
  gdriveTokenClientId = clientId;
  return true;
}

// Debe llamarse de forma síncrona (sin ningún await previo) desde dentro del propio
// manejador de clic, para que requestAccessToken() abra el popup en el mismo turno
// del evento de usuario.
function gdriveRequestTokenSync() {
  return new Promise((resolve, reject) => {
    gdriveTokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      gdriveAccessToken = resp.access_token;
      resolve(resp.access_token);
    };
    gdriveTokenClient.error_callback = (err) => reject(new Error(err.type || 'No se pudo obtener acceso a Google Drive (revisa si el navegador bloqueó una ventana emergente).'));
    gdriveTokenClient.requestAccessToken({ prompt: gdriveAccessToken ? '' : 'consent' });
  });
}

function gdriveOpenFolderPicker(apiKey, accessToken) {
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder');
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setTitle('Selecciona la carpeta de Drive')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          resolve({ id: doc.id, name: doc.name });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}

async function gdriveListFolderFiles(folderId, apiKey, accessToken) {
  const q = "'" + folderId + "' in parents and trashed=false";
  const allFiles = [];
  let pageToken = '';
  do {
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,modifiedTime)') +
      '&pageSize=1000&key=' + apiKey + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!resp.ok) throw new Error('Error al listar archivos de Drive (código ' + resp.status + ').');
    const data = await resp.json();
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return allFiles;
}

async function gdriveDownloadFileAsFile(fileMeta, apiKey, accessToken) {
  let url, filename = fileMeta.name;
  if (fileMeta.mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = 'https://www.googleapis.com/drive/v3/files/' + fileMeta.id + '/export?mimeType=' +
      encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') + '&key=' + apiKey;
    if (!/\.xlsx$/i.test(filename)) filename += '.xlsx';
  } else {
    url = 'https://www.googleapis.com/drive/v3/files/' + fileMeta.id + '?alt=media&key=' + apiKey;
  }
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!resp.ok) throw new Error('Error al descargar "' + filename + '" (código ' + resp.status + ').');
  const buf = await resp.arrayBuffer();
  return new File([buf], filename, { type: fileMeta.mimeType || 'application/octet-stream' });
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Sube (crea) un archivo nuevo dentro de una carpeta de Drive ya conocida. Requiere que
// el token tenga el scope drive.file — no necesita que el usuario haya "abierto" antes
// esa carpeta con el selector, basta con crear el archivo especificando su carpeta padre.
async function gdriveUploadFileToFolder(file, folderId, accessToken) {
  const metadata = { name: file.name, parents: [folderId] };
  const boundary = 'imtes_boundary_' + Math.random().toString(36).slice(2);
  const buf = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(buf);
  const body =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: ' + (file.type || 'application/octet-stream') + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data + '\r\n' +
    '--' + boundary + '--';
  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
    body,
  });
  if (!resp.ok) throw new Error('No se pudo subir "' + file.name + '" a Drive (código ' + resp.status + ').');
  return await resp.json();
}

// Procesa la(s) sábana(s) localmente (como siempre) y, si ya hay una sesión de Drive
// activa en este navegador (el usuario ya dio clic en "Conectar" alguna vez en esta
// visita), además sube cada archivo a la carpeta de sábanas en Drive.
async function handleSabanaFilesWithDriveSync(fileList) {
  const files = Array.from(fileList);
  await handleSabanaFiles(files);
  const statusEl = gdriveStatusEl('sabanas');
  if (!gdriveAccessToken) {
    if (statusEl) {
      statusEl.style.color = '#888';
      statusEl.innerHTML = 'Procesado localmente. Para que se suba sola a Drive la próxima vez, primero da clic en "Conectar con Google Drive" arriba.';
    }
    return;
  }
  const folder = GDRIVE_DEFAULT_FOLDERS.sabanas;
  for (const f of files) {
    try {
      if (statusEl) { statusEl.style.color = '#888'; statusEl.textContent = 'Subiendo "' + f.name + '" a Drive…'; }
      await gdriveUploadFileToFolder(f, folder.id, gdriveAccessToken);
      if (statusEl) { statusEl.style.color = COLORS.verde; statusEl.textContent = '✅ "' + f.name + '" procesado y subido a la carpeta de Drive.'; }
    } catch (err) {
      if (statusEl) { statusEl.style.color = COLORS.rojo; statusEl.textContent = 'Se procesó localmente, pero no se pudo subir "' + f.name + '" a Drive: ' + err.message; }
      console.error(err);
    }
  }
}

const GDRIVE_STATUS_EL = { historico: 'gdriveHistoricoStatus', oxxo: 'gdriveOxxoStatus', caus: 'gdriveCausStatus', sabanas: 'gdriveSabanasStatus' };
function gdriveStatusEl(kind) { return document.getElementById(GDRIVE_STATUS_EL[kind]); }

// IMPORTANTE: esta función NO es async y no lleva ningún await antes de
// requestAccessToken() — se llama directo desde el evento de clic para que el popup
// de Google no quede bloqueado. El resto del flujo (listar/descargar/procesar) sigue
// dentro del .then(), ya con el token en mano.
function gdriveConnectFolder(kind) {
  const statusEl = gdriveStatusEl(kind);
  const cfg = gdriveGetConfig();
  if (!cfg.apiKey || !cfg.clientId) {
    statusEl.textContent = 'Primero guarda tu API Key y Client ID arriba.';
    statusEl.style.color = COLORS.rojo;
    return;
  }
  statusEl.style.color = '#888';
  if (!gdriveEnsureTokenClient(cfg.clientId)) {
    statusEl.textContent = 'Google todavía se está cargando, espera un segundo y vuelve a dar clic.';
    return;
  }
  statusEl.textContent = 'Conectando con Google…';
  const knownFolder = GDRIVE_DEFAULT_FOLDERS[kind];
  gdriveRequestTokenSync().then(async (token) => {
    try {
      if (knownFolder) {
        localStorage.setItem('gdrive_folder_' + kind, JSON.stringify(knownFolder));
        await gdriveSyncFolder(kind, knownFolder, cfg, token);
      } else {
        if (typeof google === 'undefined' || !google.picker) {
          statusEl.textContent = 'Cargando selector de Drive…';
          await gdriveEnsureApisLoaded();
        }
        statusEl.textContent = 'Elige la carpeta en la ventana de Google…';
        const folder = await gdriveOpenFolderPicker(cfg.apiKey, token);
        if (!folder) { statusEl.textContent = 'Selección cancelada.'; return; }
        localStorage.setItem('gdrive_folder_' + kind, JSON.stringify(folder));
        await gdriveSyncFolder(kind, folder, cfg, token);
      }
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.style.color = COLORS.rojo;
      console.error(err);
    }
  }).catch(err => {
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.style.color = COLORS.rojo;
    console.error(err);
  });
}

async function gdriveSyncFolder(kind, folder, cfg, token) {
  const statusEl = gdriveStatusEl(kind);
  statusEl.style.color = '#888';
  statusEl.textContent = 'Carpeta "' + folder.name + '" — listando archivos…';
  try {
    const allFiles = await gdriveListFolderFiles(folder.id, cfg.apiKey, token);
    const wantExt = kind === 'oxxo' ? ['dat'] : ['xlsx', 'xls'];
    const matching = allFiles.filter(f => {
      if (kind !== 'oxxo' && f.mimeType === 'application/vnd.google-apps.spreadsheet') return true;
      return wantExt.includes(fileExt(f.name));
    });
    const extLabel = kind === 'oxxo' ? '.DAT' : '.xlsx';
    if (!matching.length) {
      statusEl.textContent = 'Carpeta "' + folder.name + '" conectada, pero no se encontraron archivos ' + extLabel + ' dentro.';
      return;
    }
    if (kind === 'historico') {
      // Un solo archivo esperado; si hay más de uno, toma el modificado más recientemente.
      matching.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
      const chosen = matching[0];
      statusEl.textContent = 'Descargando "' + chosen.name + '"…';
      const file = await gdriveDownloadFileAsFile(chosen, cfg.apiKey, token);
      statusEl.textContent = 'Procesando "' + chosen.name + '"…';
      await handleHistoricoFile(file);
      consolidate();
      fullRerender();
      statusEl.style.color = COLORS.verde;
      statusEl.innerHTML = '✅ "' + chosen.name + '" cargado desde Drive · <a href="#" data-resync="' + kind + '">volver a sincronizar</a>';
      wireResyncLink(kind, folder);
      return;
    }
    statusEl.textContent = 'Descargando ' + matching.length + ' archivo(s) de "' + folder.name + '"…';
    const files = [];
    for (const f of matching) files.push(await gdriveDownloadFileAsFile(f, cfg.apiKey, token));
    statusEl.textContent = 'Procesando ' + files.length + ' archivo(s)…';
    if (kind === 'oxxo') await handleOxxoFiles(files);
    else if (kind === 'caus') await handleCausFiles(files);
    else await handleSabanaFiles(files);
    consolidate();
    fullRerender();
    statusEl.style.color = COLORS.verde;
    statusEl.innerHTML = '✅ "' + folder.name + '" sincronizada (' + files.length + ' archivo(s)) · <a href="#" data-resync="' + kind + '">volver a sincronizar</a>';
    wireResyncLink(kind, folder);
  } catch (err) {
    statusEl.style.color = COLORS.rojo;
    statusEl.textContent = 'Error al sincronizar: ' + err.message;
    console.error(err);
  }
}

function wireResyncLink(kind, folder) {
  const statusEl = gdriveStatusEl(kind);
  const link = statusEl.querySelector('a[data-resync="' + kind + '"]');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const cfg2 = gdriveGetConfig();
    if (!cfg2.apiKey || !cfg2.clientId) { statusEl.textContent = 'Primero guarda tu API Key y Client ID.'; return; }
    if (!gdriveEnsureTokenClient(cfg2.clientId)) {
      statusEl.textContent = 'Google todavía se está cargando, espera un segundo y vuelve a dar clic.';
      return;
    }
    gdriveRequestTokenSync().then(tok => gdriveSyncFolder(kind, folder, cfg2, tok))
      .catch(err => { statusEl.textContent = 'Error: ' + err.message; });
  });
}

function updateGDriveConfigStatus() {
  const cfg = gdriveGetConfig();
  const box = document.getElementById('gdriveConfigStatus');
  if (!cfg.apiKey || !cfg.clientId) {
    box.innerHTML = '<span class="badge badge-warn">Faltan credenciales</span>';
  } else if (cfg.isCustom) {
    box.innerHTML = '<span class="badge badge-ok">Credenciales personalizadas guardadas en este navegador</span>';
  } else {
    box.innerHTML = '<span class="badge badge-ok">Usando credenciales incorporadas de IMTES</span> <span style="color:#888;">(puedes reemplazarlas arriba si algún día cambian)</span>';
  }
}

// Intento de conexión silenciosa: sin ventana emergente, sin pedir nada al usuario.
// Solo funciona si el navegador todavía tiene una sesión activa de Google y el usuario
// ya autorizó esta app antes (en este mismo navegador). Si no se puede, no pasa nada
// visible — el usuario simplemente da clic en "Conectar" como de costumbre.
function gdriveTrySilentConnect() {
  const cfg = gdriveGetConfig();
  if (!cfg.apiKey || !cfg.clientId) return;
  gdriveEnsureApisLoaded().then(() => {
    if (!gdriveEnsureTokenClient(cfg.clientId)) return;
    gdriveTokenClient.callback = (resp) => {
      if (resp.error) return; // silencioso: no hay sesión activa, el usuario conecta a mano
      gdriveAccessToken = resp.access_token;
      ['historico', 'oxxo', 'caus', 'sabanas'].forEach(kind => {
        const statusEl = gdriveStatusEl(kind);
        if (statusEl) { statusEl.style.color = COLORS.verde; statusEl.textContent = '✅ Conectado automáticamente con Google Drive.'; }
      });
      // Si ya había una carpeta guardada de una sesión anterior, la sincroniza sola.
      ['historico', 'oxxo', 'caus', 'sabanas'].forEach(kind => {
        const saved = localStorage.getItem('gdrive_folder_' + kind);
        const folder = saved ? JSON.parse(saved) : GDRIVE_DEFAULT_FOLDERS[kind];
        if (folder && (kind === 'historico' || kind === 'oxxo' || kind === 'caus')) gdriveSyncFolder(kind, folder, cfg, gdriveAccessToken);
      });
    };
    gdriveTokenClient.error_callback = () => {}; // silencioso
    gdriveTokenClient.requestAccessToken({ prompt: '' });
  }).catch(() => {});
}

function gdriveInitUI() {
  // Intenta conectar solo, en silencio (sin ventana emergente); si no hay sesión
  // activa de Google, no pasa nada visible y el usuario conecta a mano como siempre.
  gdriveTrySilentConnect();
  const cfg = gdriveGetConfig();
  document.getElementById('gdriveApiKey').value = cfg.apiKey;
  document.getElementById('gdriveClientId').value = cfg.clientId;
  updateGDriveConfigStatus();

  document.getElementById('btnSaveGDriveConfig').addEventListener('click', () => {
    gdriveSaveConfig(document.getElementById('gdriveApiKey').value.trim(), document.getElementById('gdriveClientId').value.trim());
    updateGDriveConfigStatus();
  });
  document.getElementById('btnClearGDriveConfig').addEventListener('click', () => {
    gdriveClearConfig();
    const cfg = gdriveGetConfig();
    document.getElementById('gdriveApiKey').value = cfg.apiKey;
    document.getElementById('gdriveClientId').value = cfg.clientId;
    updateGDriveConfigStatus();
    ['historico', 'oxxo', 'caus', 'sabanas'].forEach(k => { const el = gdriveStatusEl(k); if (el) el.innerHTML = ''; });
  });
  const btnHistorico = document.getElementById('btnGDriveHistorico');
  if (btnHistorico) btnHistorico.addEventListener('click', () => gdriveConnectFolder('historico'));
  document.getElementById('btnGDriveOxxo').addEventListener('click', () => gdriveConnectFolder('oxxo'));
  document.getElementById('btnGDriveCaus').addEventListener('click', () => gdriveConnectFolder('caus'));
  const btnSabanas = document.getElementById('btnGDriveSabanas');
  if (btnSabanas) btnSabanas.addEventListener('click', () => gdriveConnectFolder('sabanas'));

  ['historico', 'oxxo', 'caus', 'sabanas'].forEach(kind => {
    const saved = localStorage.getItem('gdrive_folder_' + kind);
    if (!saved) return;
    const folder = JSON.parse(saved);
    const statusEl = gdriveStatusEl(kind);
    if (!statusEl) return;
    statusEl.innerHTML = 'Carpeta guardada: "' + folder.name + '" · <a href="#" data-resync="' + kind + '">sincronizar ahora</a>';
    wireResyncLink(kind, folder);
  });
}

/* ==========================================================================
   10. WIRING / INIT
   ========================================================================== */

function wireUploadZone(zoneId, inputId, handler, multiple) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files && files.length) processFiles(files, handler, multiple);
  });
  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) processFiles(e.target.files, handler, multiple);
    input.value = '';
  });
}

async function processFiles(fileList, handler, multiple) {
  if (multiple) {
    await handler(fileList);
  } else {
    await handler(fileList[0]);
  }
  consolidate();
  fullRerender();
}

function wireExceptionEditsAndButtons() {
  document.getElementById('btnSelAll').addEventListener('click', () => { STATE.closureLines = new Set(STATE.allLineasBase); renderCierreTab(); renderRestoTab(); });
  document.getElementById('btnSelNone').addEventListener('click', () => { STATE.closureLines = new Set(); renderCierreTab(); renderRestoTab(); });
  document.getElementById('btnSelSuggest').addEventListener('click', () => { STATE.closureLines = new Set(CLOSURE_SUGGESTED.filter(l => STATE.allLineasBase.includes(l))); renderCierreTab(); renderRestoTab(); });
  document.getElementById('btnExportPptx').addEventListener('click', exportPptx);
  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
}

function init() {
  initTabs();
  wireUploadZone('zoneSabanas', 'inputSabanas', handleSabanaFilesWithDriveSync, true);
  wireExceptionEditsAndButtons();
  gdriveInitUI();
  renderQualityPanel();
  renderCutoffPanel();
  renderHistoricoStatus();
}

document.addEventListener('DOMContentLoaded', init);
