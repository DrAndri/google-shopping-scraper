/* import {
  Configuration,
  Log,
  MemoryStorage,
  RequestQueue,
  type Request
} from 'crawlee';
import { CacheItems, ProductSnapshot, StoreConfig } from '../types/index.js';
import { createProductLogger, createStoreLogger } from '../logger.js';
import PageScraper from './PageScraper.js';
import { Locator, Page } from 'playwright';

const defaultImage = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IB2cksfwAAAARnQU1BAACxjwv8YQUAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAAlwSFlzAAAuIwAALiMBeKU/dgAAAAxJREFUCNdj+P//PwAF/gL+3MxZ5wAAAABJRU5ErkJggg==',
  'base64'
);
const absoluteUrlRegExp = new RegExp('^(?:[a-z+]+:)?//', 'i');
const categoryBanList = [
  'forsíða',
  'heim',
  'vörur',
  'allar vörur',
  'til baka',
  'leitarniðurstöður'
];
const blockedPageResourceTypes = [
  'image',
  'stylesheet',
  'media',
  'font',
  'websocket',
  'other'
];
const blockedNavigationPathEndings = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.webp',
  '.mp3',
  '.mp4',
  '.zip',
  '.xlsx',
  '.xls'
];
const blockedPagePathEndings = [
  ...blockedNavigationPathEndings,
  '.css',
  '.gif',
  '.webm',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf'
];
const blockedPageUrlPatterns = [
  'google-analytics.com',
  'google.com',
  'google.is',
  'googleads.g.doubleclick.net',
  'googletagmanager.com',
  'adsbygoogle.js',
  'hubspot.com',
  'hubapi.com',
  'hsappstatic.net',
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'addthis.com'
];

export default class BaseCrawler {
  store: StoreConfig;
  batchTimestamp: Date;
  updateProductInDb: (scrapedProduct: ProductSnapshot) => Promise<void>;

  constructor(
    store: StoreConfig,
    batchTimestamp: Date,
    updateProductInDb: (scrapedProduct: ProductSnapshot) => Promise<void>
  ) {
    this.store = store;
    this.batchTimestamp = batchTimestamp;
    this.updateProductInDb = updateProductInDb;
  }

  async crawlSite(): Promise<ProductSnapshot[]> {
    const safeStoreName = this.store.name.replace(/[^a-zA-Z0-9]/g, '-');
    const {
      startUrl,
      selectors,
      productPageIdentifier,
      sanitizers,
      urlWhitelist,
      urlBlacklist,
      scrollPagesToBottom,
      menuClicker
    } = this.store.options;
    const store = this.store;

    let totalRequests = 0,
      totalProcessed = 0,
      totalErrored = 0,
      descriptionError = 0,
      attributeError = 0,
      imageError = 0,
      brandError = 0,
      nameError = 0,
      inStockError = 0,
      categoriesError = 0;

    const productMap: Map<string, ProductSnapshot> = new Map<
      string,
      ProductSnapshot
    >();

    const memoryStorage = new MemoryStorage({
      persistStorage: false,
      writeMetadata: false
    });
    const requestQueue = await RequestQueue.open(safeStoreName, {
      storageClient: memoryStorage
    });

    const pageScraper = new PageScraper(selectors, sanitizers, categoryBanList);


    //requestHandler


    //const addLinksToQueue = async (page: Page) => {


    

    const crawlLog = new Log({ prefix: store.name });

    const config = Configuration.getGlobalConfig();

    config.set('persistStorage', 'false');
    // config.set('storageDir', '/dev/shm');

    //TODO: run crawler

    await requestQueue.drop();

    const storeLogger = createStoreLogger(store.name);

    storeLogger.log('info', `Crawl of store ${store.name} completed.`);
    storeLogger.log('info', `Total requests: ${totalRequests}`);
    storeLogger.log('info', `Total processed: ${totalProcessed}`);
    storeLogger.log('info', `Total errored: ${totalErrored}`);
    storeLogger.log('info', `Description errors: ${descriptionError}`);
    storeLogger.log('info', `Attribute errors: ${attributeError}`);
    storeLogger.log('info', `Image errors: ${imageError}`);
    storeLogger.log('info', `Brand errors: ${brandError}`);
    storeLogger.log('info', `Name errors: ${nameError}`);
    storeLogger.log('info', `InStock errors: ${inStockError}`);
    storeLogger.log('info', `Categories errors: ${categoriesError}`);
    storeLogger.close();

    return Array.from(productMap, ([, value]) => value);
  }
}
 */