// Kimlik kartı ön yüz fotoğrafından okunan yazıyı ayrıştırır (web sitesindeki kimlikOku.js ile aynı mantık).
// Çipi açmak için gereken seri no, doğum tarihi ve son geçerlilik buradan gelir.

export function tcGecerliMi(tc: string): boolean {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = [...tc].map(Number);
  const tekler = d[0] + d[2] + d[4] + d[6] + d[8];
  const ciftler = d[1] + d[3] + d[5] + d[7];
  if ((((tekler * 7 - ciftler) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

const temizAd = (s: string) =>
  s
    .replace(/[^A-Za-zÇĞİÖŞÜçğıöşü ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function basliginAltindaki(satirlar: string[], desen: RegExp): string | null {
  const i = satirlar.findIndex((s) => desen.test(s));
  if (i === -1) return null;
  for (const satir of satirlar.slice(i + 1, i + 3)) {
    const ad = temizAd(satir);
    if (ad.length >= 2 && !/surname|given|name|soyad|adı|adi|doğum|dogum|birth/i.test(ad)) return ad;
  }
  return null;
}

export type OnYuzBilgisi = {
  ad: string | null;
  soyad: string | null;
  seriNo: string | null;
  dogumTarihi: string | null; // GG.AA.YYYY
  sonGecerlilik: string | null; // GG.AA.YYYY
};

export function onYuzuAyristir(metin: string): OnYuzBilgisi {
  const satirlar = metin.split('\n').map((s) => s.trim()).filter(Boolean);
  // Ön yüzde iki tarih var: doğum (en eski) ve son geçerlilik (en yeni)
  const tarihler = [...metin.matchAll(/\b(\d{2})[./](\d{2})[./](\d{4})\b/g)]
    .map((t) => ({ metin: `${t[1]}.${t[2]}.${t[3]}`, sira: `${t[3]}${t[2]}${t[1]}` }))
    .sort((a, b) => a.sira.localeCompare(b.sira));
  // Seri no: harf + 2 rakam + harf + 5 rakam (ör. A12B34567); OCR'ın O/0 karışıklığı düzeltilir
  const seri = metin
    .replace(/\s/g, '')
    .toUpperCase()
    .match(/[A-Z][0-9O]{2}[A-Z][0-9O]{5}/);
  return {
    soyad: basliginAltindaki(satirlar, /soyad|surname/i),
    ad: basliginAltindaki(satirlar, /^ad[ıi]?\b|given/i),
    seriNo: seri ? seri[0][0] + seri[0].slice(1, 3).replace(/O/g, '0') + seri[0][3] + seri[0].slice(4).replace(/O/g, '0') : null,
    dogumTarihi: tarihler[0]?.metin ?? null,
    sonGecerlilik: tarihler.length > 1 ? tarihler[tarihler.length - 1].metin : null,
  };
}

// "14.03.1985" -> "850314" (çip anahtarı biçimi)
export function ggaayyyydenYymmdd(tarih: string): string | null {
  const t = tarih.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return t ? `${t[3].slice(2)}${t[2]}${t[1]}` : null;
}

// Çipten gelen "850314" -> "1985-03-14" (veritabanı biçimi). Doğum geçmişte, son geçerlilik 2000'lerde.
export function yymmddden(yymmdd: string, gecmis: boolean): string {
  const yy = Number(yymmdd.slice(0, 2));
  const yuzyil = gecmis && yy > new Date().getFullYear() % 100 ? 1900 : 2000;
  return `${yuzyil + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

// Çip adları Türkçe karaktersizdir (ŞAHİN -> SAHIN). Fotoğraftan okunan Türkçe yazım çiple
// aynı kişiyi gösteriyorsa o kullanılır; yoksa çipteki yazım esas alınır.
const turkceyiSadelestir = (s: string) =>
  s
    .toLocaleUpperCase('tr-TR')
    .replace(/Ç/g, 'C')
    .replace(/Ğ/g, 'G')
    .replace(/İ/g, 'I')
    .replace(/Ö/g, 'O')
    .replace(/Ş/g, 'S')
    .replace(/Ü/g, 'U')
    .replace(/\s+/g, ' ')
    .trim();

export const buyukHarfBasla = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .map((k) => k.charAt(0).toLocaleUpperCase('tr-TR') + k.slice(1))
    .join(' ');

export function adiBirlestir(
  cip: { ad: string; soyad: string },
  onYuz: { ad: string | null; soyad: string | null }
): { adSoyad: string; turkceYazimKullanildi: boolean } {
  const eslesir =
    onYuz.ad &&
    onYuz.soyad &&
    turkceyiSadelestir(onYuz.ad) === turkceyiSadelestir(cip.ad) &&
    turkceyiSadelestir(onYuz.soyad) === turkceyiSadelestir(cip.soyad);
  const ad = eslesir ? onYuz.ad! : cip.ad;
  const soyad = eslesir ? onYuz.soyad! : cip.soyad;
  return { adSoyad: buyukHarfBasla(`${ad} ${soyad}`), turkceYazimKullanildi: !!eslesir };
}
