import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import KimlikCip, { type CipSonucu } from './modules/kimlik-cip';
import { cariEkle, cikisYap, girisYap, oturumuGetir, type Kullanici } from './src/api';
import {
  adiBirlestir,
  ggaayyyydenYymmdd,
  onYuzuAyristir,
  tcGecerliMi,
  yymmddden,
  type OnYuzBilgisi,
} from './src/kimlikAyristir';

const RENK = { yesilKoyu: '#1b5e20', yesil: '#2e7d32', krem: '#faf6ec', sinir: '#ddd6c3', soluk: '#6b6b5f', kirmizi: '#b3261e', bugday: '#d4a017' };

type Adim = 'yukleniyor' | 'giris' | 'onYuz' | 'cip' | 'onay' | 'tamam';

const bosOnYuz: OnYuzBilgisi = { ad: null, soyad: null, seriNo: null, dogumTarihi: null, sonGecerlilik: null };

export default function App() {
  const [adim, setAdim] = useState<Adim>('yukleniyor');
  const [kullanici, setKullanici] = useState<Kullanici | null>(null);
  const [hata, setHata] = useState('');
  const [mesgul, setMesgul] = useState(false);

  const [onYuz, setOnYuz] = useState<OnYuzBilgisi>(bosOnYuz);
  const [cip, setCip] = useState<CipSonucu | null>(null);
  const [cipDurumu, setCipDurumu] = useState<'bekleniyor' | 'okunuyor'>('bekleniyor');
  const [kayit, setKayit] = useState({ adSoyad: '', telefon: '', adres: '', iban: '', ciftci: true, alici: false });

  useEffect(() => {
    oturumuGetir().then((k) => {
      setKullanici(k);
      setAdim(k ? 'onYuz' : 'giris');
    });
    const abonelik = KimlikCip.addListener('onDurum', (olay) => setCipDurumu(olay.adim));
    return () => abonelik.remove();
  }, []);

  const yeniKayit = () => {
    setOnYuz(bosOnYuz);
    setCip(null);
    setKayit({ adSoyad: '', telefon: '', adres: '', iban: '', ciftci: true, alici: false });
    setHata('');
    setAdim('onYuz');
  };

  const onYuzCek = async () => {
    setHata('');
    const izin = await ImagePicker.requestCameraPermissionsAsync();
    if (!izin.granted) {
      setHata('Kamera izni verilmedi. Bilgileri aşağıya elle de girebilirsiniz.');
      return;
    }
    const sonuc = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (sonuc.canceled) return;
    setMesgul(true);
    try {
      const bilgi = onYuzuAyristir(await KimlikCip.metinOku(sonuc.assets[0].uri));
      // Okunamayan alanlar önceki (ya da elle girilmiş) değerleri silmesin
      setOnYuz((o) => ({
        ad: bilgi.ad ?? o.ad,
        soyad: bilgi.soyad ?? o.soyad,
        seriNo: bilgi.seriNo ?? o.seriNo,
        dogumTarihi: bilgi.dogumTarihi ?? o.dogumTarihi,
        sonGecerlilik: bilgi.sonGecerlilik ?? o.sonGecerlilik,
      }));
      if (!bilgi.seriNo || !bilgi.dogumTarihi || !bilgi.sonGecerlilik) {
        setHata('Bazı bilgiler okunamadı. Eksikleri elle girin ya da daha net bir fotoğraf çekin.');
      }
    } catch {
      setHata('Fotoğraftaki yazı okunamadı. Tekrar deneyin ya da bilgileri elle girin.');
    } finally {
      setMesgul(false);
    }
  };

  const cipOku = async () => {
    setHata('');
    const belgeNo = (onYuz.seriNo ?? '').toUpperCase().replace(/\s/g, '');
    const dogum = ggaayyyydenYymmdd(onYuz.dogumTarihi ?? '');
    const gecerlilik = ggaayyyydenYymmdd(onYuz.sonGecerlilik ?? '');
    if (belgeNo.length !== 9 || !dogum || !gecerlilik) {
      setHata('Seri no 9 karakter, tarihler GG.AA.YYYY biçiminde olmalı.');
      return;
    }
    const nfc = KimlikCip.nfcDurumu();
    if (nfc === 'yok') {
      setHata('Bu telefonda NFC yok; çip okunamaz.');
      return;
    }
    if (nfc === 'kapali') {
      setHata('NFC kapalı. Ayarlardan NFC\'yi açıp tekrar deneyin.');
      Linking.sendIntent('android.settings.NFC_SETTINGS').catch(() => {});
      return;
    }
    setCipDurumu('bekleniyor');
    setAdim('cip');
    try {
      const sonuc = await KimlikCip.cipOku(belgeNo, dogum, gecerlilik);
      setCip(sonuc);
      setKayit((k) => ({ ...k, adSoyad: adiBirlestir(sonuc, onYuz).adSoyad }));
      setAdim('onay');
    } catch (e) {
      const kod = (e as { code?: string }).code;
      if (kod !== 'IPTAL') setHata((e as Error).message);
      setAdim('onYuz');
    }
  };

  const kaydet = async () => {
    if (!cip) return;
    setHata('');
    if (!kayit.adSoyad.trim()) {
      setHata('Ad soyad boş olamaz.');
      return;
    }
    setMesgul(true);
    try {
      await cariEkle({
        isim_unvan: kayit.adSoyad.trim(),
        ciftci_mi: kayit.ciftci,
        alici_mi: kayit.alici,
        kimlik_turu: 'tc',
        tc_no: tcGecerliMi(cip.tc) ? cip.tc : '',
        telefon: kayit.telefon.trim(),
        adres: kayit.adres.trim(),
        iban: kayit.iban.replace(/\s/g, '').toUpperCase(),
        dogum_tarihi: yymmddden(cip.dogumTarihi, true),
        cinsiyet: cip.cinsiyet ?? '',
        kimlik_seri_no: cip.belgeNo,
        kimlik_gecerlilik: yymmddden(cip.sonGecerlilik, false),
      });
      setAdim('tamam');
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setMesgul(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.kok} behavior="height">
      <StatusBar style="light" />
      <View style={s.ust}>
        <Text style={s.ustBaslik}>🌾 Turan Tarım</Text>
        {kullanici && (
          <Pressable
            onPress={async () => {
              await cikisYap();
              setKullanici(null);
              setAdim('giris');
            }}
          >
            <Text style={s.ustCikis}>Çıkış ({kullanici.kullanici_adi})</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={s.icerik} keyboardShouldPersistTaps="handled">
        {adim === 'yukleniyor' && <ActivityIndicator size="large" color={RENK.yesil} style={{ marginTop: 40 }} />}

        {adim === 'giris' && (
          <GirisEkrani
            onGiris={(k) => {
              setKullanici(k);
              setAdim('onYuz');
            }}
          />
        )}

        {adim === 'onYuz' && (
          <View style={s.kart}>
            <Text style={s.baslik}>1. Kimliğin ön yüzü</Text>
            <Text style={s.aciklama}>
              Çipi açmak için kartın ön yüzündeki seri no, doğum tarihi ve son geçerlilik gerekir. Fotoğrafını çekin;
              okunamayanları elle düzeltebilirsiniz.
            </Text>
            <Buton yazi="📷 Ön yüzün fotoğrafını çek" onPress={onYuzCek} mesgul={mesgul} />
            <Alan etiket="Seri No" deger={onYuz.seriNo ?? ''} onChange={(v) => setOnYuz({ ...onYuz, seriNo: v.toUpperCase() })} ornek="A12B34567" />
            <Alan etiket="Doğum Tarihi" deger={onYuz.dogumTarihi ?? ''} onChange={(v) => setOnYuz({ ...onYuz, dogumTarihi: v })} ornek="GG.AA.YYYY" sayisal />
            <Alan etiket="Son Geçerlilik" deger={onYuz.sonGecerlilik ?? ''} onChange={(v) => setOnYuz({ ...onYuz, sonGecerlilik: v })} ornek="GG.AA.YYYY" sayisal />
            <Buton yazi="📶 Çipi oku" onPress={cipOku} />
          </View>
        )}

        {adim === 'cip' && (
          <View style={[s.kart, { alignItems: 'center' }]}>
            <Text style={s.baslik}>2. Kartı telefona tutun</Text>
            <Text style={{ fontSize: 64, marginVertical: 12 }}>💳</Text>
            <Text style={[s.aciklama, { textAlign: 'center' }]}>
              {cipDurumu === 'bekleniyor'
                ? 'Kimlik kartını telefonun arka yüzünün ortasına dayayın ve okuma bitene kadar kıpırdatmayın.'
                : 'Çip okunuyor, kartı çekmeyin…'}
            </Text>
            <ActivityIndicator size="large" color={RENK.yesil} style={{ marginVertical: 16 }} />
            <Buton yazi="Vazgeç" ikincil onPress={() => KimlikCip.iptal()} />
          </View>
        )}

        {adim === 'onay' && cip && (
          <View style={s.kart}>
            <Text style={s.baslik}>3. Kontrol edip kaydedin</Text>
            <View style={[s.rozet, { backgroundColor: cip.butunluk ? '#e6f2e4' : '#fff1cc' }]}>
              <Text style={{ color: cip.butunluk ? RENK.yesilKoyu : '#7a5200', fontWeight: '700' }}>
                {cip.butunluk ? '✓ Bilgiler kimlik çipinden okundu' : '⚠ Çip okundu ama bütünlük kontrolü yapılamadı'}
              </Text>
            </View>
            <Alan etiket="Ad Soyad" deger={kayit.adSoyad} onChange={(v) => setKayit({ ...kayit, adSoyad: v })} />
            <Satir etiket="TC Kimlik No" deger={tcGecerliMi(cip.tc) ? cip.tc : '— çipte bulunamadı'} />
            <Satir etiket="Doğum Tarihi" deger={yymmddden(cip.dogumTarihi, true).split('-').reverse().join('.')} />
            <Satir etiket="Cinsiyet" deger={cip.cinsiyet === 'E' ? 'Erkek' : cip.cinsiyet === 'K' ? 'Kadın' : '-'} />
            <Satir etiket="Seri No" deger={cip.belgeNo} />
            <Satir etiket="Son Geçerlilik" deger={yymmddden(cip.sonGecerlilik, false).split('-').reverse().join('.')} />
            <Alan etiket="Telefon" deger={kayit.telefon} onChange={(v) => setKayit({ ...kayit, telefon: v })} sayisal />
            <Alan etiket="Adres" deger={kayit.adres} onChange={(v) => setKayit({ ...kayit, adres: v })} />
            <Alan etiket="IBAN" deger={kayit.iban} onChange={(v) => setKayit({ ...kayit, iban: v.toUpperCase() })} ornek="TR.." />
            <Anahtar etiket="Çiftçi kaydı" deger={kayit.ciftci} onChange={(v) => setKayit({ ...kayit, ciftci: v })} />
            <Anahtar etiket="Alıcı" deger={kayit.alici} onChange={(v) => setKayit({ ...kayit, alici: v })} />
            <Buton yazi="💾 Kaydet" onPress={kaydet} mesgul={mesgul} />
            <Buton yazi="Baştan başla" ikincil onPress={yeniKayit} />
          </View>
        )}

        {adim === 'tamam' && (
          <View style={[s.kart, { alignItems: 'center' }]}>
            <Text style={{ fontSize: 56 }}>✅</Text>
            <Text style={s.baslik}>Kayıt eklendi</Text>
            <Text style={[s.aciklama, { textAlign: 'center' }]}>
              {kayit.adSoyad} Çiftçi / Cari listesine eklendi. İl/ilçe ve sözleşme bilgilerini web sitesinden
              tamamlayabilirsiniz.
            </Text>
            <Buton yazi="➕ Yeni kayıt" onPress={yeniKayit} />
          </View>
        )}

        {!!hata && <Text style={s.hata}>{hata}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GirisEkrani({ onGiris }: { onGiris: (k: Kullanici) => void }) {
  const [kullaniciAdi, setKullaniciAdi] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [mesgul, setMesgul] = useState(false);

  const gonder = async () => {
    setHata('');
    setMesgul(true);
    try {
      onGiris(await girisYap(kullaniciAdi.trim(), sifre));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setMesgul(false);
    }
  };

  return (
    <View style={s.kart}>
      <Text style={s.baslik}>🔑 Giriş Yap</Text>
      <Text style={s.aciklama}>cnrsystem.com.tr hesabınızla giriş yapın.</Text>
      <Alan etiket="Kullanıcı Adı" deger={kullaniciAdi} onChange={setKullaniciAdi} />
      <Alan etiket="Şifre" deger={sifre} onChange={setSifre} gizli />
      <Buton yazi="Giriş Yap" onPress={gonder} mesgul={mesgul} />
      {!!hata && <Text style={s.hata}>{hata}</Text>}
    </View>
  );
}

function Alan(p: { etiket: string; deger: string; onChange: (v: string) => void; ornek?: string; gizli?: boolean; sayisal?: boolean }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.etiket}>{p.etiket}</Text>
      <TextInput
        style={s.girdi}
        value={p.deger}
        onChangeText={p.onChange}
        placeholder={p.ornek}
        placeholderTextColor="#aaa"
        secureTextEntry={p.gizli}
        autoCapitalize="none"
        keyboardType={p.sayisal ? 'numbers-and-punctuation' : 'default'}
      />
    </View>
  );
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <View style={s.satir}>
      <Text style={s.etiket}>{etiket}</Text>
      <Text style={s.satirDeger}>{deger}</Text>
    </View>
  );
}

function Anahtar({ etiket, deger, onChange }: { etiket: string; deger: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[s.satir, { alignItems: 'center' }]}>
      <Text style={s.satirDeger}>{etiket}</Text>
      <Switch value={deger} onValueChange={onChange} trackColor={{ true: RENK.yesil }} />
    </View>
  );
}

function Buton({ yazi, onPress, mesgul, ikincil }: { yazi: string; onPress: () => void; mesgul?: boolean; ikincil?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={mesgul}
      style={({ pressed }) => [s.buton, ikincil && s.butonIkincil, (pressed || mesgul) && { opacity: 0.7 }]}
    >
      {mesgul ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[s.butonYazi, ikincil && { color: '#3a2a00' }]}>{yazi}</Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  kok: { flex: 1, backgroundColor: RENK.krem },
  ust: {
    backgroundColor: RENK.yesilKoyu,
    paddingTop: (RNStatusBar.currentHeight ?? 24) + 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ustBaslik: { color: '#fff', fontSize: 20, fontWeight: '700' },
  ustCikis: { color: '#eaf3e8', fontSize: 13 },
  icerik: { padding: 16, paddingBottom: 48 },
  kart: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: RENK.sinir, padding: 16 },
  baslik: { fontSize: 20, fontWeight: '700', color: RENK.yesilKoyu, marginBottom: 6 },
  aciklama: { fontSize: 15, color: RENK.soluk, lineHeight: 21, marginBottom: 8 },
  etiket: { fontSize: 13, color: RENK.soluk, fontWeight: '600', marginBottom: 4 },
  girdi: { borderWidth: 1, borderColor: RENK.sinir, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#2b2b23' },
  satir: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ebdd' },
  satirDeger: { fontSize: 16, color: '#2b2b23', fontWeight: '600' },
  rozet: { borderRadius: 8, padding: 10, marginVertical: 6 },
  buton: { backgroundColor: RENK.yesil, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  butonIkincil: { backgroundColor: RENK.bugday },
  butonYazi: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hata: { color: RENK.kirmizi, fontWeight: '600', marginTop: 12, fontSize: 15 },
});
