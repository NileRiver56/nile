import type { HomeSectionType, LocalizedText } from './types.ts';

export interface HomeSectionPreset {
  type: HomeSectionType;
  label: LocalizedText;
  description: LocalizedText;
  defaultTitle: LocalizedText;
  defaultContent: Record<string, unknown>;
}

export const HOME_SECTION_PRESETS: HomeSectionPreset[] = [
  {
    type: 'hero_split',
    label: { en: '01 · Hero Split Editorial', ar: '01 · الواجهة الرئيسية المقسمة' },
    description: {
      en: 'Primary split hero with search bar, dual CTAs, and editorial visual panel.',
      ar: 'القسم الرئيسي مع شريط البحث وأزرار الإجراء والصورة التحريرية.',
    },
    defaultTitle: { en: 'Curated Commerce Across Lebanon', ar: 'تجارة منتقاة في كل لبنان' },
    defaultContent: {
      kicker: { en: 'Beirut · Mount Lebanon · North · South · Bekaa', ar: 'بيروت · جبل لبنان · الشمال · الجنوب · البقاع' },
      subline: {
        en: 'Independent Lebanese merchants, verified specs, dual USD/LBP pricing, and nationwide delivery split cleanly by seller.',
        ar: 'متاجر لبنانية مستقلة، مواصفات موثقة، تسعير مزدوج بالدولار والليرة، وتوصيل لجميع المحافظات مقسم بوضوح لكل بائع.',
      },
      primaryCtaLabel: { en: 'Explore Catalog', ar: 'تصفح الكتالوج' },
      primaryCtaUrl: '/catalog',
      secondaryCtaLabel: { en: 'Start Selling', ar: 'ابدأ البيع على المنصة' },
      secondaryCtaUrl: '/seller',
      showSearch: true,
      imageUrl: '/src/assets/images/hero_beirut_editorial_1795297173320.jpg',
      badgeLabel: { en: 'Verified', ar: 'بائع موثق' },
    },
  },
  {
    type: 'trust_strip',
    label: { en: '02 · Trust & Currency Strip', ar: '02 · شريط الثقة والعملات' },
    description: {
      en: '3-cell platform guarantee row for currency ledger, merchant verification, and delivery.',
      ar: 'شريط ثلاثي الخلايا لضمانات المنصة: العملات وتوثيق المتاجر والتوصيل.',
    },
    defaultTitle: { en: 'Platform Guarantees', ar: 'ضمانات المنصة' },
    defaultContent: {
      showSpotlightProduct: true,
      cells: [
        {
          icon: 'wallet',
          title: { en: 'Dual Currency Ledger', ar: 'سجل مالي مزدوج العملة' },
          desc: {
            en: 'Integer minor-unit accounting in USD and LBP with transparent rates.',
            ar: 'محاسبة دقيقة بالوحدات الصغرى للدولار والليرة وسعر صرف واضح.',
          },
        },
        {
          icon: 'shield',
          title: { en: 'Verified Merchants', ar: 'تجار موثقون' },
          desc: {
            en: 'Commercial registration checked before every store goes live.',
            ar: 'مراجعة السجل التجاري والهوية قبل تفعيل أي متجر.',
          },
        },
        {
          icon: 'truck',
          title: { en: 'Nationwide Logistics', ar: 'توصيل لجميع المحافظات' },
          desc: {
            en: 'Platform courier or seller fleet across all 8 Lebanese governorates.',
            ar: 'أسطول البائع أو التوصيل المركزي عبر المحافظات اللبنانية الثماني.',
          },
        },
      ],
    },
  },
  {
    type: 'departments_bento',
    label: { en: '03 · Departments Bento Grid', ar: '03 · شبكة الأقسام الرئيسية' },
    description: {
      en: '3-column department directory cards linking to Fashion, Electronics, and Home Gadgets.',
      ar: 'ثلاث بطاقات للأقسام الرئيسية: الأزياء والإلكترونيات وأدوات المنزل.',
    },
    defaultTitle: { en: 'Departments', ar: 'الأقسام الرئيسية' },
    defaultContent: {
      items: [
        {
          slug: 'fashion',
          tint: 'var(--sand)',
          tag: { en: 'Editorial Lookbook · Size Guide', ar: 'أسلوب تحريري · مقاسات دقيقة' },
          title: { en: 'Fashion', ar: 'الأزياء' },
          desc: {
            en: 'Mediterranean linen, artisanal leather, and Beirut tailoring.',
            ar: 'كتان متوسطي، جلود حرفية، وخياطة بيروتية معاصرة.',
          },
          image: '/src/assets/images/cat_fashion_linen_1795297173988.jpg',
        },
        {
          slug: 'electronics',
          tint: 'var(--cyan)',
          tag: { en: 'Spec Tables · Verified Warranty', ar: 'مواصفات تقنية · ضمانات موثقة' },
          title: { en: 'Electronics & Mobiles', ar: 'الإلكترونيات والهواتف' },
          desc: {
            en: 'Studio audio, mechanical hardware, and verified warranties.',
            ar: 'صوتيات استوديو، لوحات ميكانيكية، وضمانات معتمدة.',
          },
          image: '/src/assets/images/cat_electronics_audio_1795297173898.jpg',
        },
        {
          slug: 'home-gadgets',
          tint: 'var(--sage)',
          tag: { en: 'Home Rituals · Precision Gear', ar: 'أدوات عملية · خزف وقهوة' },
          title: { en: 'Home Gadgets', ar: 'أدوات المنزل' },
          desc: {
            en: 'Precision brew gear, smart ceramics, and quiet home tools.',
            ar: 'أدوات قهوة دقيقة، خزف مطفي، وتجهيزات منزلية ذكية.',
          },
          image: '/src/assets/images/cat_home_gadgets_1795297173679.jpg',
        },
      ],
    },
  },
  {
    type: 'dynamic_products_grid',
    label: { en: '04 · Live Products Grid', ar: '04 · شبكة المنتجات الحية' },
    description: {
      en: 'Dynamically pulls published products from MySQL filtered by newest, featured, or deals.',
      ar: 'يعرض المنتجات المنشورة مباشرة حسب الأحدث أو المميزة أو العروض.',
    },
    defaultTitle: { en: 'Marketplace Releases', ar: 'أحدث المنتجات المنشورة' },
    defaultContent: {
      subtitle: {
        en: 'Live SKUs published by approved Lebanese merchants.',
        ar: 'منتجات منشورة مباشرة من المتاجر اللبنانية المعتمدة.',
      },
      filterMode: 'all',
      department: '',
      limit: 6,
      ctaLabel: { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },
      ctaUrl: '/catalog',
    },
  },
  {
    type: 'verified_stores_grid',
    label: { en: '05 · Verified Storefronts Grid', ar: '05 · شبكة المتاجر الموثقة' },
    description: {
      en: 'Showcases approved independent Lebanese storefronts from the database.',
      ar: 'يعرض المتاجر اللبنانية المعتمدة مباشرة من قاعدة البيانات.',
    },
    defaultTitle: { en: 'Verified Storefronts', ar: 'متاجر موثقة' },
    defaultContent: {
      subtitle: {
        en: 'Independent merchants approved after commercial verification.',
        ar: 'تجار مستقلون بعد مراجعة السجل التجاري.',
      },
      limit: 6,
    },
  },
  {
    type: 'category_spotlight',
    label: { en: '06 · Department Spotlight', ar: '06 · تسليط الضوء على قسم' },
    description: {
      en: 'Focused editorial intro + filtered products from a chosen department.',
      ar: 'تعريف تحريري مع منتجات قسم محدد.',
    },
    defaultTitle: { en: 'Electronics & Studio Hardware', ar: 'الإلكترونيات ومعدات الاستوديو' },
    defaultContent: {
      department: 'electronics',
      description: {
        en: 'Full technical specification tables, verified warranty coverage, and USD/LBP transparent checkout.',
        ar: 'جداول مواصفات تقنية كاملة مع ضمان موثق ودفع بالدولار أو الليرة.',
      },
      ctaLabel: { en: 'View Department', ar: 'عرض القسم' },
      limit: 3,
    },
  },
  {
    type: 'flash_deals_countdown',
    label: { en: '07 · Active Offers & Countdown', ar: '07 · العروض النشطة والعد التنازلي' },
    description: {
      en: 'Displays approved platform & seller offers with live countdown timer when scheduled.',
      ar: 'يعرض العروض المعتمدة مع عداد تنازلي للوقت المتبقي عند التوقيت.',
    },
    defaultTitle: { en: 'Scheduled Offers & Markdowns', ar: 'العروض المجدولة والتخفيضات' },
    defaultContent: {
      subtitle: {
        en: 'Verified price reductions approved by platform governance.',
        ar: 'تخفيضات سعرية معتمدة من إدارة المنصة.',
      },
      limit: 3,
    },
  },
  {
    type: 'promo_announcement_split',
    label: { en: '08 · Promo Announcement Split', ar: '08 · إعلان ترويجي مقسم' },
    description: {
      en: '2-column editorial campaign callout with bold typographic highlight and CTA.',
      ar: 'بطاقة حملة ترويجية من عمودين مع عنوان بارز وزر انتقال.',
    },
    defaultTitle: { en: 'Direct Sub-Order Logistics', ar: 'شحن مقسم بوضوح لكل بائع' },
    defaultContent: {
      kicker: { en: 'Platform Architecture', ar: 'بنية المنصة' },
      body: {
        en: 'Every multi-store order splits cleanly at checkout so each Lebanese merchant fulfills directly with transparent delivery fees.',
        ar: 'ينقسم كل طلب متعدد المتاجر تلقائياً إلى طلبات فرعية واضحة التكلفة لكل تاجر.',
      },
      statLabel: { en: 'Governorates Covered', ar: 'المحافظات المغطاة' },
      statValue: '8 / 8',
      ctaLabel: { en: 'Explore Storefronts', ar: 'استكشف المتاجر' },
      ctaUrl: '/catalog',
    },
  },
  {
    type: 'brand_manifesto_band',
    label: { en: '09 · Brand Manifesto Band', ar: '09 · بيان الهوية التجارية' },
    description: {
      en: 'Full-width typographic manifesto statement honoring the Hairline Grid system.',
      ar: 'شريط نصي واسع يعبر عن مبادئ المنصة.',
    },
    defaultTitle: { en: 'Built for Real Lebanese Commerce', ar: 'مصممة للتجارة اللبنانية الحقيقية' },
    defaultContent: {
      eyebrow: { en: 'NileLink Standard', ar: 'معيار نايل لينك' },
      statement: {
        en: 'Every price in integer minor units. Every seller commercially verified. Zero hidden currency spread.',
        ar: 'تسعير دقيق بالوحدات الصغرى، توثيق تجاري لكل بائع، وشفافية كاملة بين الدولار والليرة.',
      },
      ctaLabel: { en: 'Inspect Styleguide', ar: 'استعراض دليل التصميم' },
      ctaUrl: '/styleguide',
    },
  },
  {
    type: 'seller_recruitment_cta',
    label: { en: '10 · Seller Recruitment CTA', ar: '10 · دعوة انضمام التجار' },
    description: {
      en: 'Merchant onboarding split showing real subscription plans from the database.',
      ar: 'قسم مخصص لدعوة البائعين مع عرض خطط الاشتراك الفعلية.',
    },
    defaultTitle: { en: 'Launch Your Branded Storefront', ar: 'أطلق متجرك المستقل على نايل لينك' },
    defaultContent: {
      body: {
        en: 'Start on the Free tier with commercial verification, choose an accessible storefront theme, and settle earnings via Whish, OMT, or Bank IBAN.',
        ar: 'ابدأ مجاناً مع مراجعة السجل التجاري، اختر هوية متجرك، واستلم أرباحك عبر Whish أو OMT أو التحويل البنكي.',
      },
      ctaLabel: { en: 'Apply as Seller', ar: 'التقديم كبائع' },
      ctaUrl: '/seller',
    },
  },
  {
    type: 'governorates_coverage_grid',
    label: { en: '11 · Lebanon Delivery Zones Table', ar: '11 · جدول التوصيل للمحافظات' },
    description: {
      en: 'Displays live platform courier fees and delivery ETAs across all 8 Lebanese governorates.',
      ar: 'يعرض رسوم التوصيل ومدة التسليم عبر جميع المحافظات اللبنانية الثماني.',
    },
    defaultTitle: { en: 'Lebanon Courier Coverage & Rates', ar: 'التغطية والتوصيل في محافظات لبنان' },
    defaultContent: {
      subtitle: {
        en: 'Live platform courier tariffs per governorate (sellers may also enable direct fleet rates).',
        ar: 'التعرفة المعتمدة للتوصيل عبر المحافظات (مع إمكانية تسعير الأسطول الخاص للبائع).',
      },
    },
  },
  {
    type: 'comparison_table',
    label: { en: '12 · Comparison Matrix', ar: '12 · جدول المقارنة' },
    description: {
      en: 'Clean two-column spec comparison table editable in JSON or Admin Builder.',
      ar: 'جدول مقارنة من عمودين قابل للتعديل بالكامل من لوحة الإدارة.',
    },
    defaultTitle: { en: 'Fulfillment Models Compared', ar: 'مقارنة خيارات التوصيل والتجارة' },
    defaultContent: {
      colAHeader: { en: 'Platform Courier', ar: 'توصيل المنصة المركزي' },
      colBHeader: { en: 'Seller Direct Fleet', ar: 'أسطول البائع الخاص' },
      rows: [
        {
          label: { en: 'Zone Pricing', ar: 'تسعير المناطق' },
          colA: { en: 'Standard 8-governorate table', ar: 'تعرفة موحدة للمحافظات الثماني' },
          colB: { en: 'Custom per governorate', ar: 'تسعير مخصص لكل محافظة' },
        },
        {
          label: { en: 'Sub-Order Tracking', ar: 'تتبع الطلب الفرعي' },
          colA: { en: 'Integrated courier status', ar: 'تحديثات مباشرة للحالة' },
          colB: { en: 'Direct merchant dispatch', ar: 'تجهيز وشحن مباشر من المتجر' },
        },
        {
          label: { en: 'COD & Whish Settlement', ar: 'التحصيل والتسوية' },
          colA: { en: 'Automated double-entry ledger', ar: 'سجل مالي مزدوج القيد' },
          colB: { en: 'Tracked in Seller Hub', ar: 'متابعة كاملة في لوحة البائع' },
        },
      ],
    },
  },
  {
    type: 'newsletter_dispatch',
    label: { en: '13 · Editorial Dispatch Box', ar: '13 · صندوق النشرة البريدية' },
    description: {
      en: 'Inline email dispatch sign-up band placed anywhere on the landing page.',
      ar: 'قسم الاشتراك في تنبيهات المنصة داخل الصفحة الرئيسية.',
    },
    defaultTitle: { en: 'Marketplace Dispatch', ar: 'نشرة نايل لينك البريدية' },
    defaultContent: {
      desc: {
        en: 'Receive verified merchant launch notices and seasonal platform schedule announcements.',
        ar: 'استلم إشعارات إطلاق المتاجر الجديدة والعروض المجدولة في لبنان.',
      },
      ctaLabel: { en: 'Subscribe', ar: 'اشتراك' },
    },
  },
  {
    type: 'faq_accordion',
    label: { en: '14 · Bilingual FAQ Accordion', ar: '14 · الأسئلة الشائعة القابلة للفتح' },
    description: {
      en: 'Expandable bilingual FAQ list managed completely from Admin Console.',
      ar: 'قائمة أسئلة شائعة باللغتين قابلة للإدارة من لوحة التحكم.',
    },
    defaultTitle: { en: 'Frequently Asked Questions', ar: 'الأسئلة الشائعة' },
    defaultContent: {
      items: [
        {
          q: {
            en: 'How does multi-seller checkout splitting work?',
            ar: 'كيف يتم تقسيم الطلب عند الشراء من أكثر من متجر؟',
          },
          a: {
            en: 'Your cart automatically groups items by seller into independent sub-orders with clear delivery fees and tracking per merchant.',
            ar: 'تقوم الحقيبة بتجميع المنتجات تلقائياً حسب البائع في طلبات فرعية مستقلة مع رسوم توصيل وتتبع واضح لكل متجر.',
          },
        },
        {
          q: {
            en: 'How are USD and LBP prices calculated?',
            ar: 'كيف يتم احتساب الأسعار بالدولار والليرة اللبنانية؟',
          },
          a: {
            en: 'All ledger amounts use integer USD minor units and convert cleanly using the live rate configured in Admin Console.',
            ar: 'تُحفظ المبالغ بوحدات الدولار الصغرى وتُحوّل بدقة وفق سعر الصرف المعتمد في لوحة الإدارة.',
          },
        },
      ],
    },
  },
  {
    type: 'custom_rich_editorial',
    label: { en: '15 · Custom Rich Editorial Block', ar: '15 · كتلة تحريرية مخصصة' },
    description: {
      en: 'Flexible custom content block with bilingual copy, optional image URL, and CTA.',
      ar: 'كتلة محتوى حرة مع نص ثنائي اللغة وصورة اختيارية ورابط إجراء.',
    },
    defaultTitle: { en: 'Editorial Feature', ar: 'مساحة تحريرية مخصصة' },
    defaultContent: {
      eyebrow: { en: 'Curated Note', ar: 'ملاحظة تحريرية' },
      body: {
        en: 'Customize this section directly from Admin Console → Home Builder.',
        ar: 'يمكنك تعديل هذا القسم بالكامل من لوحة الإدارة ← منشئ الصفحة الرئيسية.',
      },
      imageUrl: '',
      ctaLabel: { en: 'Explore Catalog', ar: 'تصفح الكتالوج' },
      ctaUrl: '/catalog',
    },
  },
];

export function getPresetForSectionType(type: HomeSectionType): HomeSectionPreset {
  return HOME_SECTION_PRESETS.find((p) => p.type === type) || HOME_SECTION_PRESETS[14];
}
