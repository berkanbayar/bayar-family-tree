// SheetJS sadece içe/dışa aktarma sırasında yüklenir (≈900 KB).
const SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const SRI = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';

let loading;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.integrity = SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => {
      loading = null;
      reject(new Error('Excel kütüphanesi yüklenemedi, internet bağlantınızı kontrol edin'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function readSheetRows(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, codepage: 65001 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
}

export async function downloadXlsx(rows, filename) {
  const XLSX = await loadXLSX();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0] ?? {}).map((k) => ({ wch: Math.max(8, k.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Soy Ağacı');
  XLSX.writeFile(wb, filename);
}
