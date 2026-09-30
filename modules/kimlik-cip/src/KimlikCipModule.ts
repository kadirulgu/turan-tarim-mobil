import { NativeModule, requireNativeModule } from 'expo';

import type { CipSonucu, KimlikCipOlaylari, NfcDurumu } from './KimlikCip.types';

declare class KimlikCipModule extends NativeModule<KimlikCipOlaylari> {
  nfcDurumu(): NfcDurumu;
  metinOku(uri: string): Promise<string>;
  cipOku(belgeNo: string, dogumTarihi: string, sonGecerlilik: string): Promise<CipSonucu>;
  iptal(): Promise<void>;
}

export default requireNativeModule<KimlikCipModule>('KimlikCip');
