import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';

// Kimlik kartı (ID-1) en/boy oranı: 85,6 × 54 mm
const KART_ORANI = 85.6 / 54;
const CERCEVE_GENISLIK = 0.88; // ekran genişliğinin oranı
const PAY = 0.04; // kırparken kart kenarları kesilmesin diye bırakılan pay

const YESIL = '#4caf50';

type Props = { gorunur: boolean; onCekildi: (uri: string) => void; onKapat: () => void };

// Canlı kamera görüntüsünde yeşil kart çerçevesi gösterir; çekilen fotoğrafı çerçeveye göre kırpar.
export default function KimlikKamerasi({ gorunur, onCekildi, onKapat }: Props) {
  const [izin, izinIste] = useCameraPermissions();
  const kamera = useRef<CameraView>(null);
  const [alan, setAlan] = useState<LayoutRectangle | null>(null);
  const [hazir, setHazir] = useState(false);
  const [fener, setFener] = useState(false);
  const [mesgul, setMesgul] = useState(false);

  const cerceve = alan && {
    genislik: alan.width * CERCEVE_GENISLIK,
    yukseklik: (alan.width * CERCEVE_GENISLIK) / KART_ORANI,
  };

  const cek = async () => {
    if (!kamera.current || !alan || !cerceve) return;
    setMesgul(true);
    try {
      const foto = await kamera.current.takePictureAsync({ quality: 0.9 });
      // Önizleme görünümü "cover" ile doldurur: fotoğrafın ekrana ölçeği ve taşan kısmı hesaplanır
      const olcek = Math.max(alan.width / foto.width, alan.height / foto.height);
      const tasmaX = (foto.width * olcek - alan.width) / 2;
      const tasmaY = (foto.height * olcek - alan.height) / 2;
      const solEkran = (alan.width - cerceve.genislik) / 2 - cerceve.genislik * PAY;
      const ustEkran = (alan.height - cerceve.yukseklik) / 2 - cerceve.yukseklik * PAY;
      const x = Math.max(0, Math.round((solEkran + tasmaX) / olcek));
      const y = Math.max(0, Math.round((ustEkran + tasmaY) / olcek));
      const g = Math.min(foto.width - x, Math.round((cerceve.genislik * (1 + 2 * PAY)) / olcek));
      const y2 = Math.min(foto.height - y, Math.round((cerceve.yukseklik * (1 + 2 * PAY)) / olcek));

      const islenmis = await ImageManipulator.manipulate(foto.uri)
        .crop({ originX: x, originY: y, width: g, height: y2 })
        .renderAsync();
      const kaydedilen = await islenmis.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
      onCekildi(kaydedilen.uri);
    } finally {
      setMesgul(false);
    }
  };

  return (
    <Modal visible={gorunur} animationType="slide" onRequestClose={onKapat} statusBarTranslucent>
      <View style={s.kok}>
        {!izin?.granted ? (
          <View style={s.izin}>
            <Text style={s.izinYazi}>Kimliğin fotoğrafını çekmek için kamera izni gerekli.</Text>
            <Pressable style={s.buton} onPress={izinIste}>
              <Text style={s.butonYazi}>İzin ver</Text>
            </Pressable>
            <Pressable onPress={onKapat}>
              <Text style={[s.ipucu, { marginTop: 16 }]}>Vazgeç</Text>
            </Pressable>
          </View>
        ) : (
          <View style={StyleSheet.absoluteFill} onLayout={(e) => setAlan(e.nativeEvent.layout)}>
            <CameraView
              ref={kamera}
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={fener}
              onCameraReady={() => setHazir(true)}
            />

            {/* Çerçeve dışını karart, içini açık bırak */}
            {cerceve && alan && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={[s.karanlik, { flex: 1 }]} />
                <View style={{ flexDirection: 'row', height: cerceve.yukseklik }}>
                  <View style={[s.karanlik, { flex: 1 }]} />
                  <View style={{ width: cerceve.genislik, height: cerceve.yukseklik }}>
                    <View style={s.cerceve} />
                    <Kose konum={{ top: -3, left: -3 }} kenarlar={{ borderTopWidth: 6, borderLeftWidth: 6, borderTopLeftRadius: 16 }} />
                    <Kose konum={{ top: -3, right: -3 }} kenarlar={{ borderTopWidth: 6, borderRightWidth: 6, borderTopRightRadius: 16 }} />
                    <Kose konum={{ bottom: -3, left: -3 }} kenarlar={{ borderBottomWidth: 6, borderLeftWidth: 6, borderBottomLeftRadius: 16 }} />
                    <Kose konum={{ bottom: -3, right: -3 }} kenarlar={{ borderBottomWidth: 6, borderRightWidth: 6, borderBottomRightRadius: 16 }} />
                    {/* Ön yüz yerleşim ipucu: fotoğraf solda */}
                    <View style={s.fotoIzi} />
                  </View>
                  <View style={[s.karanlik, { flex: 1 }]} />
                </View>
                <View style={[s.karanlik, { flex: 1, alignItems: 'center', paddingTop: 20 }]}>
                  <Text style={s.baslik}>Kartın ön yüzünü yeşil çerçeveye yerleştirin</Text>
                  <Text style={s.ipucu}>Vesikalık fotoğraf sol tarafta olsun. Parlama olmasın, kart düz dursun.</Text>
                </View>
              </View>
            )}

            <View style={s.altCubuk}>
              <Pressable onPress={onKapat} style={s.yanButon}>
                <Text style={s.yanYazi}>Vazgeç</Text>
              </Pressable>
              <Pressable onPress={cek} disabled={!hazir || mesgul} style={[s.deklansor, (!hazir || mesgul) && { opacity: 0.5 }]}>
                {mesgul ? <ActivityIndicator color={YESIL} /> : <View style={s.deklansorIc} />}
              </Pressable>
              <Pressable onPress={() => setFener((f) => !f)} style={s.yanButon}>
                <Text style={s.yanYazi}>{fener ? '🔦 Açık' : '🔦 Işık'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Kose({ konum, kenarlar }: { konum: object; kenarlar: object }) {
  return <View style={[{ position: 'absolute', width: 34, height: 34, borderColor: YESIL }, konum, kenarlar]} />;
}

const s = StyleSheet.create({
  kok: { flex: 1, backgroundColor: '#000' },
  karanlik: { backgroundColor: 'rgba(0,0,0,0.55)' },
  cerceve: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: YESIL, borderRadius: 14 },
  fotoIzi: {
    position: 'absolute',
    left: '5%',
    top: '22%',
    width: '24%',
    height: '62%',
    borderWidth: 1.5,
    borderColor: 'rgba(76,175,80,0.7)',
    borderStyle: 'dashed',
    borderRadius: 6,
  },
  baslik: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 },
  ipucu: { color: '#ddd', fontSize: 14, textAlign: 'center', paddingHorizontal: 32, marginTop: 6 },
  altCubuk: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  deklansor: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  deklansorIc: { width: 58, height: 58, borderRadius: 29, backgroundColor: YESIL },
  yanButon: { width: 90, alignItems: 'center', padding: 10 },
  yanYazi: { color: '#fff', fontSize: 16, fontWeight: '600' },
  izin: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  izinYazi: { color: '#fff', fontSize: 17, textAlign: 'center', marginBottom: 16 },
  buton: { backgroundColor: '#2e7d32', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  butonYazi: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
