package expo.modules.kimlikcip

import android.net.Uri
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Bundle
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import net.sf.scuba.data.Gender
import net.sf.scuba.smartcards.IsoDepCardService
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.jmrtd.BACKey
import org.jmrtd.PassportService
import org.jmrtd.lds.CardAccessFile
import org.jmrtd.lds.PACEInfo
import org.jmrtd.lds.SODFile
import org.jmrtd.lds.icao.DG1File
import java.io.ByteArrayInputStream
import java.security.MessageDigest
import java.security.Security

// Türkiye Cumhuriyeti kimlik kartı çipini (ICAO 9303) NFC ile okur.
// Çipin kilidi kartın ön yüzündeki seri no, doğum tarihi ve son geçerlilik tarihiyle açılır.
// Vesikalık fotoğraf (DG2) bilerek okunmaz: yalnızca yazılı bilgiler alınır.
class KimlikCipModule : Module() {
  private var bekleyenOkuma: Promise? = null
  private var anahtar: BACKey? = null

  private val context
    get() = appContext.reactContext ?: throw CodedException("BAGLAM_YOK", "Uygulama bağlamı hazır değil", null)

  override fun definition() = ModuleDefinition {
    Name("KimlikCip")
    Events("onDurum")

    OnCreate {
      // PACE (brainpool eğrileri) Android'deki kırpılmış "BC" sağlayıcısıyla çalışmaz
      Security.removeProvider("BC")
      Security.insertProviderAt(BouncyCastleProvider(), 1)
    }

    OnDestroy { okumayiDurdur() }

    // "yok" | "kapali" | "acik"
    Function("nfcDurumu") {
      val adapter = NfcAdapter.getDefaultAdapter(context)
      when {
        adapter == null -> "yok"
        !adapter.isEnabled -> "kapali"
        else -> "acik"
      }
    }

    // Fotoğraftaki yazıyı cihaz üzerinde okur (ML Kit, Latin alfabesi — Türkçe karakterler dahil)
    AsyncFunction("metinOku") { uri: String, promise: Promise ->
      val resim = InputImage.fromFilePath(context, Uri.parse(uri))
      TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        .process(resim)
        .addOnSuccessListener { promise.resolve(it.text) }
        .addOnFailureListener { promise.reject(CodedException("OCR_HATASI", it.message ?: "Yazı okunamadı", it)) }
    }

    // belgeNo: 9 karakter seri no; dogumTarihi / sonGecerlilik: YYMMDD
    AsyncFunction("cipOku") { belgeNo: String, dogumTarihi: String, sonGecerlilik: String, promise: Promise ->
      val aktivite = appContext.currentActivity
        ?: throw CodedException("AKTIVITE_YOK", "Uygulama ön planda değil", null)
      val adapter = NfcAdapter.getDefaultAdapter(aktivite)
        ?: throw CodedException("NFC_YOK", "Bu telefonda NFC yok", null)
      if (!adapter.isEnabled) throw CodedException("NFC_KAPALI", "NFC kapalı; ayarlardan açın", null)

      bekleyenOkuma?.reject(CodedException("IPTAL", "Yeni okuma başlatıldı", null))
      bekleyenOkuma = promise
      anahtar = BACKey(belgeNo.uppercase(), dogumTarihi, sonGecerlilik)

      val ayarlar = Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 1000) }
      adapter.enableReaderMode(
        aktivite,
        { etiket -> kartBulundu(etiket) },
        NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
        ayarlar
      )
      sendEvent("onDurum", mapOf("adim" to "bekleniyor"))
    }

    AsyncFunction("iptal") {
      okumayiDurdur()
      bekleyenOkuma?.reject(CodedException("IPTAL", "Okuma iptal edildi", null))
      bekleyenOkuma = null
    }
  }

  private fun okumayiDurdur() {
    val aktivite = appContext.currentActivity ?: return
    aktivite.runOnUiThread {
      NfcAdapter.getDefaultAdapter(aktivite)?.disableReaderMode(aktivite)
    }
  }

  // NFC okuyucu geri çağrısı zaten arka plan iş parçacığında çalışır
  private fun kartBulundu(etiket: Tag) {
    val promise = bekleyenOkuma ?: return
    val anahtar = anahtar ?: return
    val isoDep = IsoDep.get(etiket) ?: return
    try {
      sendEvent("onDurum", mapOf("adim" to "okunuyor"))
      isoDep.timeout = 10_000
      val kartServisi = IsoDepCardService(isoDep)
      kartServisi.open()
      val servis = PassportService(
        kartServisi,
        PassportService.NORMAL_MAX_TRANCEIVE_LENGTH,
        PassportService.DEFAULT_MAX_BLOCKSIZE,
        false,
        false
      )
      servis.open()

      // Önce PACE (yeni kartlar), olmazsa BAC
      var pace = false
      try {
        val erisim = CardAccessFile(servis.getInputStream(PassportService.EF_CARD_ACCESS))
        erisim.securityInfos.filterIsInstance<PACEInfo>().firstOrNull()?.let { bilgi ->
          servis.doPACE(anahtar, bilgi.objectIdentifier, PACEInfo.toParameterSpec(bilgi.parameterId), null)
          pace = true
        }
      } catch (e: Exception) {
        // Kartta PACE yok ya da başarısız; BAC ile devam
      }
      servis.sendSelectApplet(pace)
      if (!pace) servis.doBAC(anahtar)

      val dg1Bayt = servis.getInputStream(PassportService.EF_DG1).readBytes()
      val mrz = DG1File(ByteArrayInputStream(dg1Bayt)).mrzInfo

      // Bütünlük: DG1'in özeti, çipteki imzalı güvenlik nesnesinde (SOD) kayıtlı özetle aynı mı?
      val butunluk = try {
        val sod = SODFile(servis.getInputStream(PassportService.EF_SOD))
        val beklenen = sod.dataGroupHashes[1]
        val hesaplanan = MessageDigest.getInstance(sod.digestAlgorithm).digest(dg1Bayt)
        beklenen != null && beklenen.contentEquals(hesaplanan)
      } catch (e: Exception) {
        false
      }

      val cinsiyet = when (mrz.gender) {
        Gender.MALE -> "E"
        Gender.FEMALE -> "K"
        else -> null
      }
      promise.resolve(
        mapOf(
          "soyad" to mrz.primaryIdentifier.replace('<', ' ').trim(),
          "ad" to mrz.secondaryIdentifier.replace('<', ' ').trim(),
          // TD1 kartlarda TC Kimlik No isteğe bağlı veri alanındadır
          "tc" to (mrz.optionalData1 ?: "").filter { it.isDigit() },
          "belgeNo" to mrz.documentNumber,
          "dogumTarihi" to mrz.dateOfBirth,
          "sonGecerlilik" to mrz.dateOfExpiry,
          "cinsiyet" to cinsiyet,
          "uyruk" to mrz.nationality,
          "erisim" to if (pace) "PACE" else "BAC",
          "butunluk" to butunluk
        )
      )
    } catch (e: Exception) {
      val mesaj = e.message ?: e.javaClass.simpleName
      promise.reject(
        if (mesaj.contains("6300") || mesaj.contains("BAC") || mesaj.contains("PACE", ignoreCase = true))
          CodedException("ANAHTAR_HATASI", "Çip açılamadı: seri no, doğum tarihi veya son geçerlilik yanlış olabilir", e)
        else
          CodedException("OKUMA_HATASI", "Kart okunamadı, kartı telefonun arkasında sabit tutup tekrar deneyin ($mesaj)", e)
      )
    } finally {
      bekleyenOkuma = null
      try { isoDep.close() } catch (_: Exception) {}
      okumayiDurdur()
    }
  }
}
