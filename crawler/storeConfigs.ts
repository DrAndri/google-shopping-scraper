import { WebshopCrawlerOptions } from '../types/db-types.js';

export const configs: WebshopCrawlerOptions[] = [
  {
    storeId: 1,
    startUrl: 'https://ofar.is',
    type: 'crawler',
    productPageIdentifier: 'Vörulýsing',
    urlBlacklist: [
      '/blogg',
      '/frettir',
      '/um-okkur',
      '/sidan-min',
      '/afgreidslutimar-og-stadsetning',
      '/afhendingarmatar',
      '/verkstaedi',
      '/voruskil',
      '/hafa-samband',
      '/tryggingar',
      '/bokhald-og-innheimta',
      '/abendingar',
      '/vidburdir',
      '/postlisti',
      '/lausnir',
      '/fjolmidlatorg',
      '/starfstaekifaeri',
      '/leitarnidurstodur'
    ],
    selectors: {
      productPage: '#main > div',
      oldPrice:
        'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > div > div > div:nth-child(2) > p:has-text("kr.")',
      listPrice:
        'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > div > div > div:nth-child(2) > div > p:has-text("kr.")',
      name: 'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > h1',
      sku: 'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > p',
      image:
        'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(1) > div:nth-child(1) > div > div:nth-child(2) > div.large-swiper > div.swiper > div > div.swiper-slide.swiper-slide-visible > div > div > div > img',
      description:
        'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(1) > div:has-text("Vörulýsing") > div',
      categories: 'div:nth-child(1)',
      inStock:
        'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > div > div:has-text("Hvar er varan til?") > div > div:nth-child(1) > p',
      inStockText: 'Netverslun',
      categoryItemLocator: 'nav a',
      brand: '',
      attributes: {
        attributesTable:
          'div:nth-child(2) > div:nth-child(1) > div > div:nth-child(1) > div:nth-child(3) > div > div:nth-child(2) > div > div',
        attribute: 'div > div > div',
        attributeLabel: 'p:nth-child(1)',
        attributeValue: 'p:nth-child(2)'
      }
    }
  },
  {
    storeId: 2,
    startUrl: 'https://tolvutek.is',
    type: 'crawler',
    productPageIdentifier: 'Hvar er varan til?',
    scrollPagesToBottom: true,
    urlWhitelist: ['/SelectCat', '/SelectProd'],
    selectors: {
      productPage: '#page',
      oldPrice: '.tolvutek-prices .list-price',
      listPrice: '.payinfo .price',
      name: 'h1.prod-name',
      sku: '.payinfo .prod-number',
      image: '.image-gallery-slides > div:nth-child(1) > img',
      description: '#product-description',
      categories: '#breadcrumbs',
      inStock: '.payinfo .availability',
      inStockText: 'Til í netverslun',
      categoryItemLocator: 'span.breadcrumb-item',
      brand: '',
      attributes: {
        attributesTable: '#technical-description tbody',
        attribute: 'tr',
        attributeLabel: 'td:nth-child(1)',
        attributeValue: 'td:nth-child(2)'
      }
    },
    sanitizers: {
      sku: [
        {
          match: 'Vörunúmer:',
          replace: ''
        }
      ]
    }
  },
  {
    storeId: 3,
    startUrl: 'https://tl.is',
    type: 'httpcrawler',
    productPageIdentifier: 'BaseProductPageLayout',
    urlBlacklist: [
      '/giftcard',
      '/contact',
      '/catalogsearch',
      '/greioslumatar',
      '/afhendingarmatar',
      '/verkstaedi',
      '/abyrg',
      '/vi-botartrygging',
      '/skilarettur',
      '/algengar-spurningar',
      '/innkollun',
      '/um-tolvulistann',
      '/atvinna',
      '/giftcard',
      '/styrktarsjodur',
      '/vidskiptaskilmalar',
      '/vafrakokur',
      '/netklubbur',
      '/fyrirtaekjapjonusta'
    ],
    selectors: {
      productPage:
        '#__next > div > div > div.rz-main-content-backup > div > main > div > div',
      oldPrice:
        '.product-details > .section-price > .product-sale > span > strike',
      listPrice: '.product-details > .section-price > h4',
      name: '.product-details .title-content > h1',
      sku: '.product-details .title-content > p',
      image: '.section-gallery .image-large-display img',
      description: '.detail-desc div.rz-magento-html',
      categories: '.page-breadcrumb > ul',
      inStock: '.available-stores-info',
      inStockText: 'Til á lager',
      clickers: ['.detail-spec > .section-title'],
      categoryItemLocator: 'li',
      attributes: {
        attributesTable:
          '.detail-spec > .section-content:not(.closed) > div > div',
        attribute: '.product-spec-group > div',
        attributeLabel: '.product-spec-label > p',
        attributeValue: '.product-spec-content > p',
        attributeGroup: 'div',
        attributeGroupName: '.product-spec-group-label > p'
      }
    }
  },
  {
    storeId: 4,
    startUrl: 'https://elko.is',
    type: 'httpcrawler',
    productPageIdentifier: 'isProductPage',
    urlWhitelist: ['/vorur', '/voruflokkar'],
    selectors: {
      productPage: 'main > div',
      oldPrice:
        'div:nth-child(4) > div > div > div:nth-child(1) > div:nth-child(3) > div > div > div.notDutyFree > div:nth-child(2) > span',
      listPrice:
        'div:nth-child(4) > div > div > div:nth-child(1) > div:nth-child(3) > div > div > div.notDutyFree > div:nth-child(1) > span',
      name: 'div:nth-child(4) > div > div > div:nth-child(1) > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > h2',
      sku: 'div:nth-child(4) > div > div > div:nth-child(1) > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > span',
      image:
        'div:nth-child(4) > div > div > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div > div:nth-child(1) > div > picture > img',
      description:
        'div:nth-child(4) > div > div > div:nth-child(2) > div:nth-child(2) > div',
      categories: 'nav > div > div > div:nth-child(2)',
      inStock:
        'div:nth-child(4) > div > div > div:nth-child(1) > div:nth-child(3) > div:nth-child(6) > div:nth-child(1) > div > div:nth-child(1) > span',
      inStockText: 'Til á lager',
      categoryItemLocator: 'a',
      attributes: {
        attributesTable:
          'div:nth-child(4) > div > div > div:nth-child(2) > div:nth-child(3) > dl',
        attribute: 'div',
        attributeLabel: 'dt',
        attributeValue: 'dd'
      }
    }
  },
  {
    storeId: 5,
    startUrl: 'https://computer.is',
    type: 'httpcrawler',
    productPageIdentifier: 'class="single-product"',
    urlWhitelist: ['/is/product'],
    selectors: {
      productPage: '#cartdivcontent',
      oldPrice: '.pantavoru .olderPrice',
      listPrice: '.pantavoru .displayPrice',
      name: '.single-product > h2',
      sku: '.pantavoru > div:nth-child(4)',
      image:
        '.productImg > .product-image-main .owl-item:nth-child(1) img.mainimg',
      description: '.product-desc > .tab-content',
      categories: '.breadcrumb',
      inStock: '.status',
      inStockText: 'Til á lager',
      categoryItemLocator: 'li',
      brand: '.pantavoru > .extraInfo:nth-child(3) > a',
      attributes: {
        attributesTable: '.col-sm-6',
        attribute: 'tbody > tr',
        attributeLabel: 'td:nth-child(1)',
        attributeValue: 'td:nth-child(2)',
        attributeGroup: 'table.spectable',
        attributeGroupName: 'tbody > tr:nth-child(1) > th'
      }
    },
    sanitizers: {
      sku: [
        {
          match: 'Framl.númer:',
          replace: ''
        }
      ]
    }
  },
  {
    storeId: 7,
    startUrl: 'https://kd.is/',
    type: 'crawler',
    productPageIdentifier: 'Vörulýsing',
    urlWhitelist: ['/category'],
    selectors: {
      productPage: 'div.product',
      oldPrice: 'header > .title > h4',
      listPrice: 'header > .title h3',
      name: 'h1',
      sku: 'h5',
      description: '.description',
      attributes: {
        attributesTable: 'table',
        attribute: 'tr',
        attributeLabel: 'td:nth-child(1)',
        attributeValue: 'td:nth-child(2)'
      }
    },
    sanitizers: {
      sku: [
        {
          match: 'Vörunúmer:',
          replace: ''
        }
      ]
    }
  },
  {
    storeId: 8,
    startUrl: 'https://ht.is',
    type: 'httpcrawler',
    productPageIdentifier: 'product-details',
    urlBlacklist: [
      '/giftcard',
      '/contact',
      '/catalogsearch',
      '/greioslumatar',
      '/afhendingarmatar',
      '/verkstaedi',
      '/abyrg',
      '/vidbotartrygging',
      '/skilarettur',
      '/algengar-spurningar',
      '/innkollun',
      '/um-heimilistaeki',
      '/atvinna',
      '/giftcard',
      '/autostore',
      '/styrktarsjodur',
      '/vidskiptaskilmalar',
      '/vafrakokur',
      '/opnunartimi',
      '/jafnlaunastefna',
      '/jafnrettisaaetlun'
    ],
    selectors: {
      productPage: '#__next > div > div > div.rz-main-content-backup',
      oldPrice: '.product-details > .section-price > .product-sale strike',
      listPrice: '.product-details > .section-price > h4',
      name: '.product-details .title-content > h1',
      sku: '.product-details .title-content > p',
      image: '.section-gallery .image-large-display .rz-image-view img',
      description:
        '.page-section-left-wrapper .page-details-section .product-detail-section.detail-desc > div.section-content .rz-magento-html',
      categories: '.page-breadcrumb ul',
      inStock: '.available-stores-container',
      inStockText: 'Til á lager',
      categoryItemLocator: 'p',
      brand: '',
      attributes: {
        attributesTable:
          '.page-product-section .product-detail-section.detail-spec > div.section-content > div > div',
        attribute: '.product-spec-group > div',
        attributeLabel: '.product-spec-label > p',
        attributeValue: '.product-spec-content > p',
        attributeGroup: 'div',
        attributeGroupName: '.product-spec-group-label'
      },
      clickers: [
        '.page-product-section .product-detail-section.detail-spec .section-title'
      ]
    }
  },
  {
    storeId: 9,
    startUrl: 'https://vefverslun.ok.is/',
    type: 'httpcrawler',
    productPageIdentifier: 'swift_products-details-images-modal',
    urlBlacklist: ['/vidskiptaskilmalar', '/cart', '/skra-inn', '/vorur'],
    selectors: {
      productPage: '#content',
      oldPrice: '.item_description__short__custom strong',
      listPrice:
        '.item_swift_productprice_productdetailpage_custom .text-price',
      name: 'h1.item_swift_productheader',
      sku: 'div.item_swift_productnumber',
      image:
        '.item_swift_productdetailsimage .carousel .carousel-item.active img',
      description:
        '.item_swift_productlongdescription > div > div:nth-child(2)',
      categories: '.breadcrumb',
      inStock: '.item_swift_productaddtocart_custom .js-add-to-cart-button',
      inStockText: 'Bæta í körfu',
      categoryItemLocator: 'a'
    }
  },
  {
    storeId: 10,
    startUrl: 'https://epli.is',
    type: 'httpcrawler',
    productPageIdentifier: 'product-layout',
    urlBlacklist: [
      '/uppitaka',
      '/um-okkur',
      '/thjonustuvefur',
      '/epliogumhverfid',
      '/minar-sidur',
      '/hafdu-samband',
      '/leit'
    ],
    selectors: {
      productPage: '.main',
      oldPrice: '#product-prices > p.product-info__price--old',
      listPrice: '#product-prices > p:last-child',
      name: '#product-title',
      sku: '#product-sku',
      image: '.swiper-slide-active img',
      description: '#product-description',
      categories: '.breadcrumbs',
      categoryItemLocator: 'a'
    }
  },

  {
    storeId: 11,
    startUrl: 'https://kronan.is',
    type: 'httpcrawler',
    productPageIdentifier: 'Innihald:</p>',
    urlWhitelist: ['/vara', '/voruurval'],
    selectors: {
      productPage:
        'body > main > div:nth-child(1) > div:nth-child(1) > main > div:nth-child(2) > div > div > div:nth-child(1)',
      oldPrice: '',
      listPrice:
        'div:nth-child(2) > div:nth-child(2) > div > div:nth-child(2) > div > div > p:nth-child(1)',
      name: 'div:nth-child(2) > div:nth-child(2) > div > div:nth-child(1)',
      sku: {
        source: 'url',
        index: 'first',
        delimiter: '-'
      },
      image: '.w-full > .border-none > img.w-full',
      description:
        'div:nth-child(2) > div:nth-child(2) > div > div:nth-child(6)',
      categories: 'div:nth-child(1)',
      inStock: 'div:nth-child(2) > div:nth-child(2) > div > div:nth-child(4)',
      inStockText: 'Í vöruúrvali',
      categoryItemLocator: 'a'
    }
  },
  {
    storeId: 12,
    startUrl: 'https://hagkaup.is',
    type: 'httpcrawler',
    productPageIdentifier: 'Vörulýsing',
    urlBlacklist: [
      '/opnunartimi',
      '/um-okkur',
      '/grein',
      '/jafnlaunastefna',
      '/skilmalar',
      '/starfsmannamal',
      '/skrifstofa',
      '/afhendingarmoguleikar',
      '/skilareglur',
      '/algengar-spurningar',
      '/veislurettir-spurningar',
      '/vidskiptakort',
      '/gjafakort',
      '/leit'
    ],
    selectors: {
      productPage: '#main-content',
      oldPrice: '',
      listPrice: 'p:has-text("Verð:")',
      name: 'div > div > p.font-serif',
      sku: 'p:has-text("Vörunúmer:")',
      image: '.w-full img',
      description: '#accordion__panel-0',
      categories: 'div:nth-child(1)',
      inStock: 'button.uppercase',
      inStockText: 'Setja í körfu',
      categoryItemLocator: 'a',
      brand: 'div > div > a > p'
    },
    sanitizers: {
      sku: [
        {
          match: 'Vörunúmer:',
          replace: ''
        }
      ]
    }
  },
  {
    storeId: 13,
    startUrl: 'https://nexus.is',
    type: 'httpcrawler',
    productPageIdentifier: 'Vörunúmer',
    urlWhitelist: ['/voruflokkur', '/vara'],
    selectors: {
      productPage: '.product-container',
      oldPrice: '',
      listPrice: '.product-page-price > .amount',
      name: 'h1.product-title',
      sku: '.sku_wrapper > .sku',
      image: '.wp-post-image',
      description: '.product-page-sections div:nth-child(1) .panel',
      categories: '.breadcrumbs',
      inStock: '.stock',
      inStockText: 'Á lager',
      categoryItemLocator: 'a',
      brand: 'span.tagged_as:has-text("Vörumerki:") > a:nth-child(1)'
    }
  },
  {
    storeId: 14,
    startUrl: 'https://vefverslun.advania.is',
    type: 'crawler',
    productPageIdentifier: 'Almennar upplýsingar',
    urlWhitelist: ['/voruflokkar'],
    menuClicker: 'span:has-text("Vöruflokkar")',
    selectors: {
      productPage: '.product-details__wrapper',
      oldPrice: '',
      listPrice: 'p.text-price',
      name: 'h1.details__product-name',
      sku: '.details > div:nth-child(1)',
      image: '.image-carousel ol > li:nth-child(1) > img',
      description: '.details__description',
      categories: '.breadcrumbs > ul',
      inStock: '.detail__actions',
      inStockText: 'Bæta í körfu',
      categoryItemLocator: 'li',
      attributes: {
        attributesTable: '#info-tabs .tabs__panel > div',
        attribute: 'div > div',
        attributeLabel: 'p',
        attributeValue: 'div',
        attributeGroup: 'div',
        attributeGroupName: 'h4'
      }
    }
  },
  {
    storeId: 15,
    startUrl: 'https://www.bauhaus.is',
    type: 'httpcrawler',
    productPageIdentifier: 'Vörulýsing',
    urlBlacklist: [
      '/afgreidslutimar',
      '/fyrirtaekjasvid-bauhaus',
      '/fs',
      '/thjonusta',
      '/kataloger',
      '/skila-og-skipta',
      '/vefverslun',
      '/sitereview',
      '/gjafakort',
      '/verdoryggi',
      '/hafdu-samband',
      '/her-er-BAUHAUS',
      '/upplysingar',
      '/postlisti',
      '/skilmalar',
      '/atvinna-i-bauhaus',
      '/gildin-okkar',
      '/jafnlaunastefna',
      '/leikjaskilyrdi',
      '/um-okkur',
      '/umhverfisstefna',
      '/gagnavernd',
      '/bauhaus-styrkveitingar',
      '/cookie-policy'
    ],
    selectors: {
      productPage: 'body',
      oldPrice: '',
      listPrice:
        ' .price-wrapper > .price-final_price > .price-block__price > .amount-default > .price-wrapper',
      name: 'h1.page-title > span',
      sku: 'tr:has-text("Strikamerki") > td',
      image: '#interactive-0',
      description: 'div.description',
      categories: '.breadcrumbs',
      inStock: '.delivery-type-switcher',
      inStockText: 'stk. á lager',
      categoryItemLocator: 'li > a',
      attributes: {
        attributesTable: '.product-details__item table > tbody',
        attribute: 'tr',
        attributeLabel: 'th',
        attributeValue: 'td'
      }
    }
  },
  {
    storeId: 16,
    startUrl: 'https://byko.is',
    type: 'httpcrawler',
    productPageIdentifier: 'id="product-ean-numbers"',
    urlWhitelist: ['/vara', '/voruflokkar'],
    menuClicker: '.menuButton',
    selectors: {
      productPage: '#wrapper',
      oldPrice:
        'div:nth-child(2) div:nth-child(2) div:has-text("VERÐ ÁÐUR") > div:nth-child(1) > div:nth-child(2) > span',
      listPrice:
        'div:nth-child(2) div:nth-child(2) div:has-text("VERÐ") > div:nth-child(1) > div:nth-child(1) > span',
      name: 'h2',
      sku: 'p:has-text("VNR.")',
      image: 'div > div:nth-child(1) > img',
      description:
        'div.visible > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(3)',
      categories: 'div:nth-child(1) > div:nth-child(1)',
      inStock:
        'div.visible > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(8)',
      inStockText: 'Til á lager',
      categoryItemLocator: 'div > a > p'
    },
    sanitizers: {
      sku: [
        {
          match: 'VNR.',
          replace: ''
        }
      ]
    }
  },
  {
    storeId: 17,
    startUrl: 'https://vefverslun.siminn.is',
    type: 'httpcrawler',
    productPageIdentifier: 'Setja í körfu',
    urlBlacklist: [
      '/en',
      '/is/filterSearch',
      '/is/compareproducts',
      '/is/wishlist',
      '/is/register',
      '/is/login',
      '/is/cart',
      '/startpakkinn-2'
    ],
    selectors: {
      productPage:
        '#product-details-form > div.productsimple > div:nth-child(1) > div.product-essential.varacontainer',
      listPrice: '.product-price > p',
      name: 'h1.varaheading',
      sku: 'div.vara-sku',
      image: '.picture-gallery > .picture > img',
      description: '.short-description',
      categories: '.breadcrumb',
      inStock: '.lagerstadawrap',
      inStockText: 'Til á lager',
      categoryItemLocator: 'ul > li > a > span',
      brand: 'div.vara-sku > span:nth-child(1)'
    }
  },
  {
    storeId: 18,
    startUrl: 'https://utilif.is',
    type: 'httpcrawler',
    productPageIdentifier: 'BaseProductPageLayoutWrapper',
    urlBlacklist: [
      '/customer',
      '/cart',
      '/blog-list',
      '/TNF-algengarSpurningar',
      '/verslanir',
      '/jardsambandid_skraning',
      '/gjafakort',
      '/verkstaedi',
      '/thjonusta',
      '/algengarspurningar',
      '/umutilif',
      '/starfsumsokn',
      '/vafrakokur',
      '/skilmalar',
      '/personuverndarstefna',
      '/catalogsearch'
    ],
    selectors: {
      productPage: 'div.rz-main-content-backup > div > main > div > div',
      listPrice: '.section-price > h4',
      name: '.title-content > h1',
      sku: '.title-content > p',
      image: '.image-item:nth-child(1) > div > img',
      categories: '.page-breadcrumb > ul',
      inStock: '.stocks-delivery-wrapper',
      inStockText: 'Til á lager',
      categoryItemLocator: 'li > a > p',
      brand: '.brand-wrapper > a > p'
    }
  },
  {
    storeId: 19,
    startUrl: 'https://hverslun.is',
    type: 'httpcrawler',
    productPageIdentifier: 'Sjá fleiri vörur',
    urlBlacklist: [
      '/is/nyskraning-i-h-klubbinn',
      '/is/moya',
      '/is/vefverslun/leit',
      '/is/um-okkur',
      '/is/hafa-samband',
      '/is/afhendingar-og-sendingarmati',
      '/is/skilarettur',
      '/is/algengar-spurningar',
      '/is/fridindi-fyrir-h-felaga',
      '/is/personuverndaryfirlysing-h-verslunar',
      '/is/skilmalar'
    ],
    selectors: {
      productPage: '#main > div > div > div > div',
      oldPrice:
        '.storeProductForm > .storePrice > .value > .hasDiscount > .overwritten',
      listPrice: '.storeProductForm > .storePrice .price',
      name: 'h1.title',
      sku: '.variantReference .value',
      image: '.coverImage .swiper-slide-active img',
      description: '.extraDesc .wrap',
      categories: '.seeMoreInCategory > a',
      inStock: '.controls > .cartSubmit',
      inStockText: 'Setja í körfu',
      categorySplitter: ':'
    },
    sanitizers: {
      sku: [
        {
          match: 'Vnr.',
          replace: ''
        }
      ]
    }
  },
  {
    storeId: 20,
    startUrl: 'https://ikea.is',
    type: 'crawler',
    productPageIdentifier: 'class="productBox',
    urlWhitelist: ['/is/products'],
    selectors: {
      productPage: '.contentWrapper-container',
      oldPrice: '.itemOldPrice > .oldValue > .price__integer',
      listPrice: '.price > span > .price__integer',
      name: '.itemInfo h6',
      sku: '.productNumber',
      image: '#react-product-gallery > div:nth-child(1) img',
      description: '.product-desc-wrapper',
      categories: 'ol.breadcrumb',
      inStock: '.stock-wrapper',
      inStockText: 'Til á lager',
      categoryItemLocator: 'a',
      attributes: {
        attributesTable: '#collapsePackageWeight',
        attribute: 'tr',
        attributeLabel: 'td:nth-child(1)',
        attributeValue: 'td:nth-child(2)'
      },
      clickers: ['a#modal-product-size']
    }
  },
  {
    storeId: 21,
    startUrl: 'https://www.vinbudin.is',
    type: 'httpcrawler',
    productPageIdentifier: 'Varan fæst í eftirfarandi Vínbúðum',
    urlWhitelist: ['/heim/vorur'],
    selectors: {
      productPage: '#wrapper > .content',
      listPrice: '.price > .money',
      name: 'h3.title > span:nth-child(1)',
      sku: 'h3.title > .product-number-text',
      image: '#first_image',
      description: '.category-description-text .entire-text',
      categories: '#breadcrumbs > ul',
      inStock: '#cart-link',
      inStockText: 'Setja í körfu',
      categoryItemLocator: 'li > a',
      brand: '#ctl00_ctl01_Label_Producer',
      attributes: {
        attributesTable: '.product-packaging-info',
        attribute: 'div',
        attributeLabel: 'span.title',
        attributeValue: 'span.value'
      }
    },
    sanitizers: {
      sku: [
        {
          match: '(',
          replace: ''
        },
        {
          match: ')',
          replace: ''
        }
      ]
    }
  }
];
