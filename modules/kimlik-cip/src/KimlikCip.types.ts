export type NfcDurumu = 'yok' | 'kapali' | 'acik';

// Çipin DG1 alanından okunan bilgiler. Tarihler YYMMDD; ad/soyad çipte Türkçe karaktersiz (ŞAHİN -> SAHIN).
export type CipSonucu = {
  soyad: string;
  ad: string;
  tc: string;
  belgeNo: string;
  dogumTarihi: string;
  sonGecerlilik: string;
  cinsiyet: 'E' | 'K' | null;
  uyruk: string;
  erisim: 'PACE' | 'BAC';
  // DG1 özeti çipteki güvenlik nesnesiyle (SOD) eşleşiyor mu
  butunluk: boolean;
};

export type KimlikCipOlaylari = {
  onDurum: (olay: { adim: 'bekleniyor' | 'okunuyor' }) => void;
};
