import type { DeliveryZone, LocalizedText } from './types.ts';

export interface GovernorateData {
  code: string;
  name: LocalizedText;
  districts: {
    code: string;
    name: LocalizedText;
    towns: LocalizedText[];
  }[];
}

export const LEBANON_GOVERNORATES: GovernorateData[] = [
  {
    code: 'beirut',
    name: { en: 'Beirut', ar: 'بيروت' },
    districts: [
      {
        code: 'achrafieh',
        name: { en: 'Achrafieh', ar: 'الأشرفية' },
        towns: [
          { en: 'Gemmayze', ar: 'الجميزة' },
          { en: 'Mar Mikhael', ar: 'مار مخايل' },
          { en: 'Sassine', ar: 'ساسين' },
        ],
      },
      {
        code: 'hamra',
        name: { en: 'Hamra & Ras Beirut', ar: 'الحمرا ورأس بيروت' },
        towns: [
          { en: 'Hamra', ar: 'الحمرا' },
          { en: 'Manara', ar: 'المنارة' },
          { en: 'Ain El Mreisseh', ar: 'عين المريسة' },
        ],
      },
      {
        code: 'verdun',
        name: { en: 'Verdun & Mazraa', ar: 'فردان والمزرعة' },
        towns: [
          { en: 'Verdun', ar: 'فردان' },
          { en: 'Sanayeh', ar: 'الصنائع' },
          { en: 'Tariq El Jdideh', ar: 'طريق الجديدة' },
        ],
      },
    ],
  },
  {
    code: 'mount-lebanon',
    name: { en: 'Mount Lebanon', ar: 'جبل لبنان' },
    districts: [
      {
        code: 'metn',
        name: { en: 'Metn', ar: 'المتن' },
        towns: [
          { en: 'Dbayeh', ar: 'ضبيه' },
          { en: 'Antelias', ar: 'أنطلياس' },
          { en: 'Broummana', ar: 'برمانا' },
          { en: 'Bikfaya', ar: 'بكفيا' },
        ],
      },
      {
        code: 'keserwan',
        name: { en: 'Keserwan', ar: 'كسروان' },
        towns: [
          { en: 'Jounieh', ar: 'جونيه' },
          { en: 'Kaslik', ar: 'الكسليك' },
          { en: 'Zouk Mosbeh', ar: 'ذوق مصبح' },
        ],
      },
      {
        code: 'baabda',
        name: { en: 'Baabda', ar: 'بعبدا' },
        towns: [
          { en: 'Hazmieh', ar: 'الحازمية' },
          { en: 'Hadath', ar: 'الحدث' },
          { en: 'Baabda', ar: 'بعبدا' },
        ],
      },
      {
        code: 'chouf-aley',
        name: { en: 'Chouf & Aley', ar: 'الشوف وعاليه' },
        towns: [
          { en: 'Aley', ar: 'عاليه' },
          { en: 'Bhamdoun', ar: 'بحمدون' },
          { en: 'Beiteddine', ar: 'بيت الدين' },
        ],
      },
    ],
  },
  {
    code: 'north',
    name: { en: 'North Lebanon', ar: 'لبنان الشمالي' },
    districts: [
      {
        code: 'tripoli',
        name: { en: 'Tripoli', ar: 'طرابلس' },
        towns: [
          { en: 'Al Mina', ar: 'الميناء' },
          { en: 'Al Tall', ar: 'التل' },
          { en: 'Dam w Farz', ar: 'الضم والفرز' },
        ],
      },
      {
        code: 'batroun',
        name: { en: 'Batroun & Byblos Corridor', ar: 'البترون' },
        towns: [
          { en: 'Batroun', ar: 'البترون' },
          { en: 'Chekka', ar: 'شكا' },
          { en: 'Ehden', ar: 'إهدن' },
        ],
      },
    ],
  },
  {
    code: 'south',
    name: { en: 'South Lebanon', ar: 'لبنان الجنوبي' },
    districts: [
      {
        code: 'sidon',
        name: { en: 'Sidon (Saida)', ar: 'صيدا' },
        towns: [
          { en: 'Saida City', ar: 'مدينة صيدا' },
          { en: 'Abra', ar: 'عبرا' },
          { en: 'Haret Saida', ar: 'حارة صيدا' },
        ],
      },
      {
        code: 'tyre',
        name: { en: 'Tyre (Sour)', ar: 'صور' },
        towns: [
          { en: 'Sour City', ar: 'مدينة صور' },
          { en: 'Abbasiyeh', ar: 'العباسية' },
        ],
      },
    ],
  },
  {
    code: 'bekaa',
    name: { en: 'Bekaa', ar: 'البقاع' },
    districts: [
      {
        code: 'zahle',
        name: { en: 'Zahle', ar: 'زحلة' },
        towns: [
          { en: 'Zahle City', ar: 'مدينة زحلة' },
          { en: 'Chtaura', ar: 'شتورة' },
          { en: 'Riyak', ar: 'رياق' },
        ],
      },
    ],
  },
  {
    code: 'nabatieh',
    name: { en: 'Nabatieh', ar: 'النبطية' },
    districts: [
      {
        code: 'nabatieh-dist',
        name: { en: 'Nabatieh', ar: 'النبطية' },
        towns: [
          { en: 'Nabatieh City', ar: 'مدينة النبطية' },
          { en: 'Kfar Reman', ar: 'كفررمان' },
        ],
      },
    ],
  },
  {
    code: 'akkar',
    name: { en: 'Akkar', ar: 'عكار' },
    districts: [
      {
        code: 'halba',
        name: { en: 'Halba', ar: 'حلبا' },
        towns: [
          { en: 'Halba', ar: 'حلبا' },
          { en: 'Qobayat', ar: 'القبيات' },
        ],
      },
    ],
  },
  {
    code: 'baalbek-hermel',
    name: { en: 'Baalbek-Hermel', ar: 'بعلبك-الهرمل' },
    districts: [
      {
        code: 'baalbek',
        name: { en: 'Baalbek', ar: 'بعلبك' },
        towns: [
          { en: 'Baalbek City', ar: 'مدينة بعلبك' },
          { en: 'Deir El Ahmar', ar: 'دير الأحمر' },
        ],
      },
    ],
  },
];

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { governorateCode: 'beirut', name: { en: 'Beirut', ar: 'بيروت' }, platformFeeUsdCents: 300, etaDays: '24h' },
  { governorateCode: 'mount-lebanon', name: { en: 'Mount Lebanon', ar: 'جبل لبنان' }, platformFeeUsdCents: 400, etaDays: '1-2d' },
  { governorateCode: 'north', name: { en: 'North Lebanon', ar: 'لبنان الشمالي' }, platformFeeUsdCents: 500, etaDays: '2-3d' },
  { governorateCode: 'south', name: { en: 'South Lebanon', ar: 'لبنان الجنوبي' }, platformFeeUsdCents: 500, etaDays: '2-3d' },
  { governorateCode: 'bekaa', name: { en: 'Bekaa', ar: 'البقاع' }, platformFeeUsdCents: 550, etaDays: '2-3d' },
  { governorateCode: 'nabatieh', name: { en: 'Nabatieh', ar: 'النبطية' }, platformFeeUsdCents: 550, etaDays: '2-3d' },
  { governorateCode: 'akkar', name: { en: 'Akkar', ar: 'عكار' }, platformFeeUsdCents: 650, etaDays: '3-4d' },
  { governorateCode: 'baalbek-hermel', name: { en: 'Baalbek-Hermel', ar: 'بعلبك-الهرمل' }, platformFeeUsdCents: 650, etaDays: '3-4d' },
];
