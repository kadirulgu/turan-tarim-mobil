# Turan Tarım — Kimlik Çipi ile Çiftçi Kaydı (Android)

Kimlik kartının NFC çipini okuyup Turan Tarım sistemine (cnrsystem.com.tr)
çiftçi/cari kaydı ekleyen Android uygulaması.

## Akış

1. **Giriş:** cnrsystem.com.tr kullanıcı adı ve şifresi. Oturum telefonda
   şifreli saklanır (expo-secure-store).
2. **Ön yüz:** Kartın ön yüzünün fotoğrafı çekilir; seri no, doğum tarihi ve son
   geçerlilik cihaz üzerinde okunur (ML Kit). Bunlar çipin kilidini açan anahtardır;
   okunamayanlar elle girilir.
3. **Çip:** Kart telefonun arkasına tutulur. Çip PACE (yoksa BAC) ile açılır, DG1
   okunur: ad, soyad, TC Kimlik No, doğum tarihi, cinsiyet, seri no, son geçerlilik.
   DG1 özeti çipteki güvenlik nesnesiyle (SOD) karşılaştırılır.
4. **Onay:** Telefon, adres, IBAN eklenir ve kayıt siteye gönderilir.

Gizlilik: vesikalık fotoğraf (DG2) okunmaz. Kart fotoğrafı yalnızca telefonda
işlenir, hiçbir yere yüklenmez.

Çipteki adlar Türkçe karaktersizdir (ŞAHİN → SAHIN). Ön yüz fotoğrafından okunan
Türkçe yazım çipteki adla aynı kişiyi gösteriyorsa o kullanılır.

## Yapı

- `App.tsx` — ekranlar
- `src/api.ts` — site API'si (`https://cnrsystem.com.tr/api`)
- `src/kimlikAyristir.ts` — ön yüz yazısını ayrıştırma, TC doğrulama
- `modules/kimlik-cip/` — yerel Expo modülü (Kotlin): NFC çip okuma (JMRTD) ve
  metin tanıma (ML Kit)

## Derleme (Windows, yerel)

Proje yolu Türkçe karakter/boşluk içermemeli (Gradle/CMake sorun çıkarıyor).

```powershell
$env:JAVA_HOME = "C:\Users\kadir\AndroidDev\jdk17-home"
$env:ANDROID_HOME = "C:\Users\kadir\AndroidDev\sdk"
npx expo prebuild -p android
cd android; .\gradlew.bat assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk`. Telefona kopyalayıp
kurulur ("bilinmeyen kaynaklara izin ver" gerekir).

`android/` klasörü üretilir (Continuous Native Generation); elle düzenlenmez,
ayarlar `app.json` ve config plugin'lerle yapılır.

Not: Sürüm imzası şimdilik Expo'nun hata ayıklama anahtarıyla yapılır. Play Store'a
yüklenecekse kendi imza anahtarı oluşturulmalı.
