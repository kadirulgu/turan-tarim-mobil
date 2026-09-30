import * as SecureStore from 'expo-secure-store';

export const SUNUCU = 'https://cnrsystem.com.tr/api';
const TOKEN_ANAHTARI = 'token';

export class ApiHatasi extends Error {
  constructor(
    message: string,
    public durum: number
  ) {
    super(message);
  }
}

async function istek<T>(yol: string, secenekler: RequestInit = {}): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_ANAHTARI);
  const yanit = await fetch(`${SUNUCU}${yol}`, {
    ...secenekler,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...secenekler.headers,
    },
  });
  const govde = yanit.status === 204 ? null : await yanit.json().catch(() => null);
  if (!yanit.ok) throw new ApiHatasi(govde?.detay || govde?.error || `Sunucu hatası (${yanit.status})`, yanit.status);
  return govde as T;
}

export type Kullanici = { id: number; kullanici_adi: string; ad_soyad: string | null };

export async function girisYap(kullanici_adi: string, sifre: string): Promise<Kullanici> {
  const veri = await istek<{ token: string; kullanici: Kullanici }>('/auth/giris', {
    method: 'POST',
    body: JSON.stringify({ kullanici_adi, sifre }),
  });
  await SecureStore.setItemAsync(TOKEN_ANAHTARI, veri.token);
  return veri.kullanici;
}

export async function oturumuGetir(): Promise<Kullanici | null> {
  if (!(await SecureStore.getItemAsync(TOKEN_ANAHTARI))) return null;
  try {
    return await istek<Kullanici>('/auth/ben');
  } catch (hata) {
    if (hata instanceof ApiHatasi && hata.durum === 401) await cikisYap();
    return null;
  }
}

export const cikisYap = () => SecureStore.deleteItemAsync(TOKEN_ANAHTARI);

export type YeniCari = {
  isim_unvan: string;
  ciftci_mi: boolean;
  alici_mi: boolean;
  kimlik_turu: 'tc';
  tc_no: string;
  telefon: string;
  adres: string;
  iban: string;
  dogum_tarihi: string;
  cinsiyet: string;
  kimlik_seri_no: string;
  kimlik_gecerlilik: string;
};

export const cariEkle = (cari: YeniCari) => istek<{ id: number }>('/cariler', { method: 'POST', body: JSON.stringify(cari) });
