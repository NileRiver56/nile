import type {
  HomeSectionStyle,
  HomeSectionTargeting,
  HomeSectionType,
  LocalizedText,
  SiteChromeSettings,
} from './types.ts';

export type HomeSectionPresetCategory = 'hero_promo' | 'merchandising' | 'discovery_trust' | 'editorial_media';

export interface HomeSectionPreset {
  type: HomeSectionType;
  category: 'hero_promo' | 'merchandising' | 'discovery_trust' | 'editorial_media';
  label: LocalizedText;
  description: LocalizedText;
  defaultTitle: LocalizedText;
  defaultContent: Record<string, unknown>;
  defaultStyle?: HomeSectionStyle;
}

export const HOME_SECTION_PRESETS: HomeSectionPreset[] = [
  {
    type: 'hero',
    category: 'hero_promo',
    label: { en: '01 · Hero Banner / Slider', ar: '01 · الواجهة الرئيسية أو السلايدر' },
    description: {
      en: 'Primary split hero or multi-slide visual showcase with search, dual CTAs, and focal point.',
      ar: 'الواجهة الرئيسية المقسمة أو متعددة الشرائح مع بحث وأزرار إجراء ونقطة تركيز للصورة.',
    },
    defaultTitle: { en: 'Curated Commerce Across Lebanon', ar: 'تجارة منتقاة في كل لبنان' },
    defaultContent: {
      mode: 'split',
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
      focalX: 50,
      focalY: 50,
      badgeLabel: { en: 'Verified', ar: 'بائع موثق' },
      slides: [],
    },
  },
  {
    type: 'announcement_bar',
    category: 'hero_promo',
    label: { en: '02 · Inline Announcement Ribbon', ar: '02 · شريط الإعلان والتنبيه' },
    description: {
      en: 'Compact hairline promo strip with optional target link, accent token, and countdown target.',
      ar: 'شريط تنبيه مدمج مع رابط واختيار لون وعداد تنازلي اختياري.',
    },
    defaultTitle: { en: 'Nationwide Split-Seller Dispatch', ar: 'شحن مباشر ومقسم لجميع المحافظات' },
    defaultContent: {
      kicker: { en: 'Notice', ar: 'تنبيه' },
      accentToken: 'ember',
      ctaLabel: { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },
      ctaUrl: '/catalog',
      countdownEndsAt: '',
    },
  },
  {
    type: 'promo_strip',
    category: 'hero_promo',
    label: { en: '03 · Promo Split Callout', ar: '03 · بطاقة إعلان مقسمة' },
    description: {
      en: '2-column campaign spotlight with bold metric/stat highlight and direct action link.',
      ar: 'إعلان من عمودين مع رقم بارز وزر انتقال.',
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
    type: 'bento_grid',
    category: 'hero_promo',
    label: { en: '04 · Editorial Bento Grid', ar: '04 · شبكة البينتو التحريرية' },
    description: {
      en: 'Asymmetric 2 to 4 editorial feature cards with imagery, focal points, and department tints.',
      ar: 'بطاقات تحريرية غير متماثلة مع صور ونقاط تركيز وروابط مخصصة.',
    },
    defaultTitle: { en: 'Curated Collections', ar: 'تشكيلات مختارة' },
    defaultContent: {
      tiles: [
        {
          id: 'tile-1',
          span: 'wide',
          tag: { en: 'Fashion', ar: 'الأزياء' },
          title: { en: 'Mediterranean Linen', ar: 'كتان متوسطي' },
          subtitle: { en: 'Cut and tailored in Beirut.', ar: 'تصميم وخياطة في بيروت.' },
          url: '/catalog?department=fashion',
          imageUrl: '/src/assets/images/cat_fashion_linen_1795297173988.jpg',
          focalX: 50,
          focalY: 45,
          tint: 'sand',
        },
        {
          id: 'tile-2',
          span: 'normal',
          tag: { en: 'Electronics', ar: 'الإلكترونيات' },
          title: { en: 'Studio Acoustics', ar: 'صوتيات استوديو' },
          subtitle: { en: 'Verified local warranty.', ar: 'ضمان محلي موثق.' },
          url: '/catalog?department=electronics',
          imageUrl: '/src/assets/images/cat_electronics_audio_1795297173898.jpg',
          focalX: 50,
          focalY: 50,
          tint: 'cyan',
        },
        {
          id: 'tile-3',
          span: 'normal',
          tag: { en: 'Home Gadgets', ar: 'أدوات المنزل' },
          title: { en: 'Precision Home Rituals', ar: 'أدوات القهوة والمنزل' },
          subtitle: { en: 'Ceramics and brew tools.', ar: 'خزف وأدوات تحضير دقيقة.' },
          url: '/catalog?department=home-gadgets',
          imageUrl: '/src/assets/images/cat_home_gadgets_1795297173679.jpg',
          focalX: 50,
          focalY: 50,
          tint: 'sage',
        },
      ],
    },
  },
  {
    type: 'product_grid',
    category: 'merchandising',
    label: { en: '05 · Product Grid', ar: '05 · شبكة المنتجات' },
    description: {
      en: 'Displays auto-filtered live products (newest, featured, deals, top rated) or handpicked SKUs.',
      ar: 'يعرض المنتجات الحية تلقائياً أو يدوياً مع عدد أعمدة قابل للتخصيص.',
    },
    defaultTitle: { en: 'Marketplace Releases', ar: 'أحدث المنتجات المنشورة' },
    defaultContent: {
      subtitle: {
        en: 'Live SKUs published by approved Lebanese merchants.',
        ar: 'منتجات منشورة مباشرة من المتاجر اللبنانية المعتمدة.',
      },
      sourceMode: 'all',
      department: '',
      productIds: [],
      columns: 3,
      limit: 6,
      ctaLabel: { en: 'Browse Catalog', ar: 'تصفح الكتالوج' },
      ctaUrl: '/catalog',
    },
  },
  {
    type: 'product_carousel',
    category: 'merchandising',
    label: { en: '06 · Product Carousel Rail', ar: '06 · شريط تمرير المنتجات' },
    description: {
      en: 'Horizontal snap-scroll product rail with previous/next controls for high-density browsing.',
      ar: 'شريط منتجات أفقي قابل للتمرير مع أزرار تنقل.',
    },
    defaultTitle: { en: 'Trending Across Storefronts', ar: 'منتجات رائجة في المتاجر' },
    defaultContent: {
      subtitle: {
        en: 'Swipe or step through curated marketplace selections.',
        ar: 'تصفح سريع لأبرز المنتجات المختارة.',
      },
      sourceMode: 'featured',
      department: '',
      productIds: [],
      limit: 8,
      ctaLabel: { en: 'View All', ar: 'عرض الكل' },
      ctaUrl: '/catalog',
    },
  },
  {
    type: 'category_tiles',
    category: 'merchandising',
    label: { en: '07 · Category / Department Tiles', ar: '07 · بطاقات الأقسام والفئات' },
    description: {
      en: 'Structured department & category tiles with curated editorial imagery and accent tags.',
      ar: 'بطاقات منظمة للأقسام والفئات مع صور وروابط مباشرة.',
    },
    defaultTitle: { en: 'Departments', ar: 'الأقسام الرئيسية' },
    defaultContent: {
      columns: 3,
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
          focalX: 50,
          focalY: 50,
          url: '/catalog?department=fashion',
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
          focalX: 50,
          focalY: 50,
          url: '/catalog?department=electronics',
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
          focalX: 50,
          focalY: 50,
          url: '/catalog?department=home-gadgets',
        },
      ],
    },
  },
  {
    type: 'department_spotlight',
    category: 'merchandising',
    label: { en: '08 · Department Spotlight', ar: '08 · تسليط الضوء على قسم' },
    description: {
      en: 'Left editorial department intro paired with a live product grid from that department.',
      ar: 'مقدمة تحريرية لقسم محدد مع عرض منتجاته تلقائياً.',
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
    type: 'flash_sale_block',
    category: 'merchandising',
    label: { en: '09 · Flash Deals & Countdown', ar: '09 · العروض السريعة والعد التنازلي' },
    description: {
      en: 'Displays approved scheduled offers or selected flash SKUs with a live countdown clock.',
      ar: 'يعرض العروض المجدولة المعتمدة مع عداد تنازلي حي.',
    },
    defaultTitle: { en: 'Scheduled Offers & Markdowns', ar: 'العروض المجدولة والتخفيضات' },
    defaultContent: {
      subtitle: {
        en: 'Verified price reductions approved by platform governance.',
        ar: 'تخفيضات سعرية معتمدة من إدارة المنصة.',
      },
      productIds: [],
      limit: 3,
      showCountdown: true,
      ctaLabel: { en: 'All Active Deals', ar: 'كل العروض النشطة' },
      ctaUrl: '/catalog?deals=true',
    },
  },
  {
    type: 'featured_stores',
    category: 'discovery_trust',
    label: { en: '10 · Featured Storefronts', ar: '10 · المتاجر الموثقة المميزة' },
    description: {
      en: 'Showcases approved independent Lebanese storefronts (auto or handpicked) with governorate and ratings.',
      ar: 'يعرض المتاجر اللبنانية المستقلة المعتمدة مع المحافظة والتقييم.',
    },
    defaultTitle: { en: 'Verified Storefronts', ar: 'متاجر موثقة' },
    defaultContent: {
      subtitle: {
        en: 'Independent merchants approved after commercial verification.',
        ar: 'تجار مستقلون بعد مراجعة السجل التجاري.',
      },
      sellerIds: [],
      limit: 6,
    },
  },
  {
    type: 'brand_bar',
    category: 'discovery_trust',
    label: { en: '11 · Brand & Partner Strip', ar: '11 · شريط العلامات والشركاء' },
    description: {
      en: 'Clean architectural strip highlighting merchant brands, partners, or certified ateliers.',
      ar: 'شريط أفقي لعرض العلامات التجارية أو الشركاء المعتمدين.',
    },
    defaultTitle: { en: 'Verified Lebanese Houses & Brands', ar: 'بيوت وعلامات لبنانية موثقة' },
    defaultContent: {
      items: [
        { name: 'Cedar Atelier', note: { en: 'Beirut', ar: 'بيروت' }, url: '/catalog?department=fashion' },
        { name: 'Hamra Sound Lab', note: { en: 'Audio', ar: 'صوتيات' }, url: '/catalog?department=electronics' },
        { name: 'Byblos Ceramics', note: { en: 'Homeware', ar: 'خزف' }, url: '/catalog?department=home-gadgets' },
        { name: 'Tripoli Roasters', note: { en: 'Craft', ar: 'حرفي' }, url: '/catalog' },
      ],
    },
  },
  {
    type: 'trust_cells',
    category: 'discovery_trust',
    label: { en: '12 · Trust, Currency & Delivery Cells', ar: '12 · خلايا الثقة والعملات والتوصيل' },
    description: {
      en: '3-cell guarantee bar OR live 8-governorate delivery tariff matrix powered by MySQL.',
      ar: 'شريط ضمانات ثلاثي أو جدول تعرفة التوصيل للمحافظات اللبنانية الثماني.',
    },
    defaultTitle: { en: 'Platform Guarantees', ar: 'ضمانات المنصة' },
    defaultContent: {
      mode: 'guarantees',
      showSpotlightProduct: true,
      subtitle: {
        en: 'Live platform courier tariffs per governorate and dual-currency protection.',
        ar: 'تعرفة التوصيل المباشرة عبر المحافظات وحماية السعر بالدولار والليرة.',
      },
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
    type: 'social_proof',
    category: 'discovery_trust',
    label: { en: '13 · Customer Testimonials & Proof', ar: '13 · آراء المشترين وتجاربهم' },
    description: {
      en: '3-column verified customer testimonials with city, rating, and store reference.',
      ar: 'شهادات وآراء العملاء مع المدينة والتقييم واسم المتجر.',
    },
    defaultTitle: { en: 'Verified Buyer Voices', ar: 'آراء المشترين الموثقين' },
    defaultContent: {
      subtitle: {
        en: 'Feedback recorded on fulfilled multi-vendor orders across Lebanon.',
        ar: 'تقييمات من طلبات منجزة عبر المحافظات اللبنانية.',
      },
      items: [
        {
          quote: {
            en: 'Split delivery between two Beirut and Metn sellers arrived cleanly tracked in one checkout.',
            ar: 'وصل الطلب المقسم بين بائعين في بيروت والمتن بتتبع واضح وفاتورة واحدة.',
          },
          author: 'Rami K.',
          city: { en: 'Achrafieh, Beirut', ar: 'الأشرفية، بيروت' },
          rating: 5,
        },
        {
          quote: {
            en: 'Exact USD and LBP conversion at checkout with zero surprise fees on Cash on Delivery.',
            ar: 'سعر صرف دقيق بين الدولار والليرة عند الدفع بدون أي رسوم مفاجئة.',
          },
          author: 'Nour H.',
          city: { en: 'Jounieh, Mount Lebanon', ar: 'جونية، جبل لبنان' },
          rating: 5,
        },
        {
          quote: {
            en: 'Direct communication with the merchant and verified commercial registration gave me full confidence.',
            ar: 'تواصل مباشر مع المتجر وتوثيق تجاري يمنح ثقة كاملة عند الشراء.',
          },
          author: 'Karim S.',
          city: { en: 'Tripoli, North', ar: 'طرابلس، الشمال' },
          rating: 5,
        },
      ],
    },
  },
  {
    type: 'how_it_works',
    category: 'discovery_trust',
    label: { en: '14 · How It Works & Seller Plans', ar: '14 · آلية العمل وخطط البائعين' },
    description: {
      en: 'Numbered onboarding steps plus optional live database Subscription Plans grid.',
      ar: 'خطوات واضحة للبيع أو الشراء مع عرض باقات الاشتراك الفعلية.',
    },
    defaultTitle: { en: 'Launch Your Branded Storefront', ar: 'أطلق متجرك المستقل على نايل لينك' },
    defaultContent: {
      eyebrow: { en: 'Merchant Onboarding', ar: 'بوابة التجار اللبنانيين' },
      body: {
        en: 'Start on the Free tier with commercial verification, choose an accessible storefront theme, and settle earnings via Whish, OMT, or Bank IBAN.',
        ar: 'ابدأ مجاناً مع مراجعة السجل التجاري، اختر هوية متجرك، واستلم أرباحك عبر Whish أو OMT أو التحويل البنكي.',
      },
      ctaLabel: { en: 'Apply as Seller', ar: 'التقديم كبائع' },
      ctaUrl: '/seller',
      showPlans: true,
      steps: [
        {
          num: '01',
          title: { en: 'Submit Commercial KYC', ar: 'تقديم السجل التجاري' },
          desc: { en: 'Verify business identity and select your Lebanese governorate.', ar: 'توثيق الهوية التجارية وتحديد المحافظة.' },
        },
        {
          num: '02',
          title: { en: 'Publish USD or LBP SKUs', ar: 'إدراج المنتجات' },
          desc: { en: 'Add variants, stock counts, and technical specification tables.', ar: 'إضافة الخيارات والمخزون وجداول المواصفات.' },
        },
        {
          num: '03',
          title: { en: 'Fulfill & Settle Cleanly', ar: 'الشحن وتسوية الأرباح' },
          desc: { en: 'Receive automatic split sub-orders and track payouts in ledger.', ar: 'استلام الطلبات المقسمة ومتابعة السجل المالي.' },
        },
      ],
    },
  },
  {
    type: 'newsletter_box',
    category: 'editorial_media',
    label: { en: '15 · Newsletter Signup Box', ar: '15 · صندوق الاشتراك في النشرة' },
    description: {
      en: 'Persisted email dispatch signup saved directly to newsletter_subscribers in MySQL.',
      ar: 'نموذج اشتراك فعلي يحفظ البريد الإلكتروني في قاعدة البيانات.',
    },
    defaultTitle: { en: 'Marketplace Dispatch', ar: 'نشرة نايل لينك البريدية' },
    defaultContent: {
      desc: {
        en: 'Receive verified merchant launch notices and seasonal platform schedule announcements.',
        ar: 'استلم إشعارات إطلاق المتاجر الجديدة والعروض المجدولة في لبنان.',
      },
      ctaLabel: { en: 'Subscribe', ar: 'اشتراك' },
      placeholder: { en: 'you@example.com', ar: 'بريدك الإلكتروني' },
    },
  },
  {
    type: 'faq_accordion',
    category: 'editorial_media',
    label: { en: '16 · FAQ Accordion', ar: '16 · قائمة الأسئلة الشائعة' },
    description: {
      en: 'Expandable bilingual FAQ list managed visually without touching code or JSON.',
      ar: 'قائمة أسئلة وأجوبة باللغتين قابلة للتعديل البصري المباشر.',
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
    type: 'rich_block',
    category: 'editorial_media',
    label: { en: '17 · Rich Editorial / Manifesto / Table', ar: '17 · كتلة تحريرية أو بيان أو جدول مقارنة' },
    description: {
      en: 'Flexible editorial feature, full-width manifesto band, or 2-column comparison matrix.',
      ar: 'قسم تحريري مرن أو بيان علامة تجارية أو جدول مقارنة من عمودين.',
    },
    defaultTitle: { en: 'Built for Real Lebanese Commerce', ar: 'مصممة للتجارة اللبنانية الحقيقية' },
    defaultContent: {
      variant: 'editorial',
      eyebrow: { en: 'NileLink Standard', ar: 'معيار نايل لينك' },
      body: {
        en: 'Every price in integer minor units. Every seller commercially verified. Zero hidden currency spread.',
        ar: 'تسعير دقيق بالوحدات الصغرى، توثيق تجاري لكل بائع، وشفافية كاملة بين الدولار والليرة.',
      },
      imageUrl: '',
      focalX: 50,
      focalY: 50,
      ctaLabel: { en: 'Explore Catalog', ar: 'تصفح الكتالوج' },
      ctaUrl: '/catalog',
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
      ],
    },
  },
  {
    type: 'video_3d_embed',
    category: 'editorial_media',
    label: { en: '18 · Video & 3D Product Showcase', ar: '18 · عرض فيديو أو نموذج ثلاثي الأبعاد' },
    description: {
      en: 'Safe validated video highlight or interactive 3D showcase panel with poster and CTA.',
      ar: 'عرض فيديو ترويجي أو معاينة نموذج ثلاثي الأبعاد مع صورة غلاف وزر إجراء.',
    },
    defaultTitle: { en: 'Inside the Workshop', ar: 'من داخل المشغل اللبناني' },
    defaultContent: {
      eyebrow: { en: 'Craftsmanship & Specs', ar: 'الحرفية والمواصفات' },
      body: {
        en: 'Watch merchant craft stories or inspect hardware specifications in detail before ordering.',
        ar: 'شاهد قصص الصناعة المحلية أو عاين تفاصيل المنتجات قبل الطلب.',
      },
      mediaMode: 'video',
      videoUrl: '',
      posterImageUrl: '/src/assets/images/hero_beirut_editorial_1795297173320.jpg',
      focalX: 50,
      focalY: 50,
      productId: '',
      ctaLabel: { en: 'Inspect Catalog', ar: 'استكشف الكتالوج' },
      ctaUrl: '/catalog',
    },
  },
];

export const ALL_HOME_SECTION_TYPES: HomeSectionType[] = HOME_SECTION_PRESETS.map((p) => p.type);

export function getPresetForSectionType(type: string): HomeSectionPreset {
  const mappedType = mapLegacySectionType(type);
  return HOME_SECTION_PRESETS.find((p) => p.type === mappedType) || HOME_SECTION_PRESETS[16];
}

export const LEGACY_TO_V2_TYPE_MAP: Record<string, HomeSectionType> = {
  hero_split: 'hero',
  trust_strip: 'trust_cells',
  departments_bento: 'category_tiles',
  dynamic_products_grid: 'product_grid',
  verified_stores_grid: 'featured_stores',
  category_spotlight: 'department_spotlight',
  flash_deals_countdown: 'flash_sale_block',
  promo_announcement_split: 'promo_strip',
  brand_manifesto_band: 'rich_block',
  seller_recruitment_cta: 'how_it_works',
  governorates_coverage_grid: 'trust_cells',
  comparison_table: 'rich_block',
  newsletter_dispatch: 'newsletter_box',
  faq_accordion: 'faq_accordion',
  custom_rich_editorial: 'rich_block',
};

export function mapLegacySectionType(type: string): HomeSectionType {
  if (ALL_HOME_SECTION_TYPES.includes(type as HomeSectionType)) {
    return type as HomeSectionType;
  }
  return LEGACY_TO_V2_TYPE_MAP[type] || 'rich_block';
}

export function migrateLegacySectionPayload(
  rawType: string,
  rawContent: Record<string, unknown>
): {
  toType: HomeSectionType;
  content: Record<string, unknown>;
  changed: boolean;
} {
  const isAlreadyV2 = ALL_HOME_SECTION_TYPES.includes(rawType as HomeSectionType);
  const toType = mapLegacySectionType(rawType);
  const content = { ...(rawContent || {}) };

  if (isAlreadyV2) {
    return { toType, content, changed: false };
  }

  if (rawType === 'hero_split') {
    content.mode = content.mode || 'split';
    if (content.focalX === undefined) content.focalX = 50;
    if (content.focalY === undefined) content.focalY = 50;
  } else if (rawType === 'trust_strip') {
    content.mode = 'guarantees';
  } else if (rawType === 'governorates_coverage_grid') {
    content.mode = 'governorates';
  } else if (rawType === 'dynamic_products_grid') {
    content.sourceMode = content.filterMode || content.sourceMode || 'all';
    content.columns = content.columns || 3;
  } else if (rawType === 'brand_manifesto_band') {
    content.variant = 'manifesto';
    if (content.statement && !content.body) content.body = content.statement;
  } else if (rawType === 'comparison_table') {
    content.variant = 'comparison';
  } else if (rawType === 'custom_rich_editorial') {
    content.variant = 'editorial';
  } else if (rawType === 'seller_recruitment_cta') {
    content.showPlans = true;
  } else if (rawType === 'departments_bento') {
    content.columns = 3;
    if (Array.isArray(content.items)) {
      content.items = (content.items as Array<Record<string, unknown>>).map((it) => ({
        ...it,
        url: it.url || `/catalog?department=${String(it.slug || 'fashion')}`,
        focalX: it.focalX ?? 50,
        focalY: it.focalY ?? 50,
      }));
    }
  } else if (rawType === 'flash_deals_countdown') {
    content.showCountdown = true;
  }

  return { toType, content, changed: true };
}

export function normalizeTargeting(raw: unknown, legacyAudience?: string): HomeSectionTargeting {
  const base: HomeSectionTargeting =
    raw && typeof raw === 'object' ? { ...(raw as HomeSectionTargeting) } : {};
  if (!base.visitor) {
    if (legacyAudience === 'guest' || legacyAudience === 'logged_in' || legacyAudience === 'new_visitor' || legacyAudience === 'returning') {
      base.visitor = legacyAudience;
    } else {
      base.visitor = 'all';
    }
  }
  if (!base.device) base.device = 'all';
  if (!base.locale) {
    if (legacyAudience === 'arabic') base.locale = 'ar';
    else if (legacyAudience === 'english') base.locale = 'en';
    else base.locale = 'all';
  }
  return base;
}

export const DEFAULT_SITE_CHROME: SiteChromeSettings = {
  headerLinks: [
    { id: 'nav-catalog', label: { en: 'Catalog', ar: 'الكتالوج' }, url: '/catalog', visible: true },
    { id: 'nav-orders', label: { en: 'My Orders', ar: 'طلباتي' }, url: '/orders', visible: true },
    { id: 'nav-styleguide', label: { en: 'Styleguide', ar: 'دليل التصميم' }, url: '/styleguide', visible: true },
    { id: 'nav-seller', label: { en: 'Sell on NileLink', ar: 'بع على نايل لينك' }, url: '/seller', visible: true },
    { id: 'nav-admin', label: { en: 'Admin', ar: 'الإدارة' }, url: '/admin', visible: true },
  ],
  showMegaMenu: true,
  megaMenuDepartments: [
    {
      slug: 'fashion',
      title: { en: 'Fashion', ar: 'الأزياء' },
      tagline: { en: 'Lebanese Linen & Tailoring', ar: 'كتان وخياطة لبنانية' },
      links: [
        { label: { en: 'All Fashion', ar: 'كل الأزياء' }, url: '/catalog?department=fashion' },
        { label: { en: 'Deals in Fashion', ar: 'عروض الأزياء' }, url: '/catalog?department=fashion&deals=true' },
      ],
    },
    {
      slug: 'electronics',
      title: { en: 'Electronics & Mobiles', ar: 'الإلكترونيات والهواتف' },
      tagline: { en: 'Verified Warranties & Specs', ar: 'مواصفات وضمانات موثقة' },
      links: [
        { label: { en: 'All Electronics', ar: 'كل الإلكترونيات' }, url: '/catalog?department=electronics' },
        { label: { en: 'Audio & Gear', ar: 'الصوتيات والأجهزة' }, url: '/catalog?department=electronics&inStock=true' },
      ],
    },
    {
      slug: 'home-gadgets',
      title: { en: 'Home Gadgets', ar: 'أدوات المنزل' },
      tagline: { en: 'Ceramics & Precision Brew', ar: 'خزف وأدوات تحضير' },
      links: [
        { label: { en: 'All Home Gadgets', ar: 'كل أدوات المنزل' }, url: '/catalog?department=home-gadgets' },
      ],
    },
  ],
  footerColumns: [
    {
      id: 'col-directory',
      title: { en: 'Directory', ar: 'روابط سريعة' },
      links: [
        { label: { en: 'Catalog', ar: 'الكتالوج' }, url: '/catalog' },
        { label: { en: 'Styleguide', ar: 'دليل التصميم' }, url: '/styleguide' },
        { label: { en: 'Seller Hub', ar: 'لوحة البائع' }, url: '/seller' },
        { label: { en: 'Admin Console', ar: 'لوحة الإدارة' }, url: '/admin' },
      ],
    },
  ],
  footerNote: {
    en: 'Lebanese multi-vendor marketplace connecting verified independent storefronts with nationwide delivery.',
    ar: 'سوق لبناني متعدد البائعين يربط المتاجر الموثقة بالمشترين عبر المحافظات الثماني.',
  },
  paymentBadges: ['COD Lebanon', 'Whish Money', 'USD / LBP'],
  homeSeo: {
    title: {
      en: 'NileLink — Lebanese Multi-Vendor Marketplace',
      ar: 'نايل لينك — السوق اللبناني متعدد البائعين',
    },
    description: {
      en: 'Curated Lebanese merchants, verified specifications, dual USD/LBP integer pricing, and split-seller delivery across all 8 governorates.',
      ar: 'متاجر لبنانية موثقة، مواصفات واضحة، تسعير مزدوج بالدولار والليرة، وتوصيل مقسم لجميع المحافظات.',
    },
    ogImageUrl: '/src/assets/images/hero_beirut_editorial_1795297173320.jpg',
  },
};

export const STARTER_TEMPLATES: Array<{
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  sectionType: HomeSectionType;
  content: Record<string, unknown>;
}> = [
  {
    id: 'tmpl-beirut-hero',
    name: { en: 'Hero · Beirut Editorial Split', ar: 'واجهة رئيسية · تحريري بيروت' },
    description: { en: 'Hero with search bar and dual merchant/catalog buttons.', ar: 'واجهة رئيسية مع شريط بحث وزرين.' },
    sectionType: 'hero',
    content: HOME_SECTION_PRESETS[0].defaultContent,
  },
  {
    id: 'tmpl-flash-ribbon',
    name: { en: 'Promo Ribbon · Weekend Deal', ar: 'شريط ترويجي · عرض نهاية الأسبوع' },
    description: { en: 'Compact ember announcement ribbon with countdown.', ar: 'شريط تنبيه مدمج مع عداد تنازلي.' },
    sectionType: 'announcement_bar',
    content: HOME_SECTION_PRESETS[1].defaultContent,
  },
  {
    id: 'tmpl-3col-bento',
    name: { en: 'Editorial Bento · 3 Departments', ar: 'شبكة بينتو · 3 أقسام' },
    description: { en: 'Asymmetric showcase across Fashion, Electronics, Home.', ar: 'عرض غير متماثل للأقسام الرئيسية.' },
    sectionType: 'bento_grid',
    content: HOME_SECTION_PRESETS[3].defaultContent,
  },
  {
    id: 'tmpl-lebanon-zones',
    name: { en: 'Delivery · 8 Governorates Matrix', ar: 'توصيل · جدول المحافظات الثماني' },
    description: { en: 'Live delivery fees from database for all governorates.', ar: 'تعرفة التوصيل الحية عبر المحافظات.' },
    sectionType: 'trust_cells',
    content: {
      ...HOME_SECTION_PRESETS[11].defaultContent,
      mode: 'governorates',
    },
  },
];
