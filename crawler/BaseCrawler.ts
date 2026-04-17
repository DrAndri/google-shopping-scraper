import {
  CheerioCrawler,
  CheerioCrawlerOptions,
  Log,
  PlaywrightCrawler,
  PlaywrightCrawlerOptions,
  RequestQueue
} from 'crawlee';
import {
  ProductScrapeResult,
  ProductSnapshot,
  ScrapeResult,
  StoreConfig
} from '../types/index.js';
import { createStoreLogger } from '../logger.js';
import { Logger } from 'winston';
import {
  absoluteUrlRegExp,
  blockedNavigationPathEndings
} from './constants.js';

export default abstract class BaseCrawler {
  store: StoreConfig;
  currentDate: Date;
  updateProductInDb: (scrapedProduct: ProductSnapshot) => Promise<void>;
  result: ScrapeResult;
  crawler: CheerioCrawler | PlaywrightCrawler;
  hostname: string;
  hostnameIncludesWww: boolean;

  constructor(
    store: StoreConfig,
    currentDate: Date,
    updateProductInDb: (scrapedProduct: ProductSnapshot) => Promise<void>,
    requestQueue: RequestQueue
  ) {
    this.store = store;
    this.currentDate = currentDate;
    this.updateProductInDb = updateProductInDb;
    this.result = {
      totalRequests: 0,
      totalProcessed: 0,
      totalErrored: 0,
      descriptionError: 0,
      attributeError: 0,
      imageError: 0,
      brandError: 0,
      nameError: 0,
      inStockError: 0,
      categoriesError: 0
    };
    this.crawler = this.setupCrawler(this.getConfiguration(requestQueue));
    this.hostname = new URL(this.store.options.startUrl).hostname;
    this.hostnameIncludesWww = this.hostname.startsWith('www.');
  }

  async handleProductScrapeResult(
    logger: Logger,
    scrapeResult: ProductScrapeResult
  ) {
    const errors = scrapeResult.errors;
    if (errors.description) {
      logger.log('warn', 'Error scraping description: %O', errors.description);
      this.result.descriptionError++;
    }
    if (errors.attributes) {
      logger.log('warn', 'Error scraping attributes: %O', errors.attributes);
      this.result.attributeError++;
    }
    if (errors.image) {
      logger.log('warn', 'Error scraping image: %O', errors.image);
      this.result.imageError++;
    }
    if (errors.brand) {
      logger.log('warn', 'Error scraping brand: %O', errors.brand);
      this.result.brandError++;
    }
    if (errors.name) {
      logger.log('warn', 'Error scraping name: %O', errors.name);
      this.result.nameError++;
    }
    if (errors.inStock) {
      logger.log('warn', 'Error scraping inStock: %O', errors.inStock);
      this.result.inStockError++;
    }
    if (errors.categories) {
      logger.log('warn', 'Error scraping categories: %O', errors.categories);
      this.result.categoriesError++;
    }

    await this.updateProductInDb(scrapeResult.product);
    this.result.totalProcessed++;
  }

  handleProductScrapeError(logger: Logger, e: unknown, url?: string) {
    logger.log('error', 'Error processing product from url %s', url);
    logger.log('error', '%O', e);
    this.result.totalErrored++;
  }

  isUrlLocal(url: URL): boolean {
    // We use the hostname to filter links that point
    // to a different domain, even subdomain.
    return (
      url.hostname === this.hostname ||
      (this.hostnameIncludesWww
        ? 'www.' + url.hostname === this.hostname
        : url.hostname === 'www.' + this.hostname)
    );
  }

  anyMatchInUrl(checkList: string[], url: URL): boolean {
    return checkList.some((entry) => {
      return url.pathname.startsWith(entry);
    });
  }

  async filterAndAddLinksToQueue(links: string[]) {
    const startUrl = this.store.options.startUrl;
    const urlWhitelist = this.store.options.urlWhitelist;
    const urlBlacklist = this.store.options.urlBlacklist;

    const absoluteUrls = links.map((link) => {
      if (absoluteUrlRegExp.test(link)) return URL.parse(link);
      else return new URL(link, startUrl);
    });

    let filteredUrls = absoluteUrls
      .filter((url) => url !== null)
      .filter((url) => this.isUrlLocal(url))
      .filter(
        (url) =>
          !blockedNavigationPathEndings.find((ending) =>
            url.href.endsWith(ending)
          )
      );
    // Filter out urls that do not match whitelist or match blacklist
    if (urlWhitelist !== undefined && urlWhitelist.length > 0) {
      filteredUrls = filteredUrls.filter((url) =>
        this.anyMatchInUrl(urlWhitelist, url)
      );
    }

    if (urlBlacklist !== undefined && urlBlacklist.length > 0) {
      filteredUrls = filteredUrls.filter(
        (url) => !this.anyMatchInUrl(urlBlacklist, url)
      );
    }

    // Finally, we have to add the URLs to the queue
    await this.crawler?.addRequests(filteredUrls.map((url) => url.href));
  }

  getConfiguration(
    requestQueue: RequestQueue
  ): CheerioCrawlerOptions | PlaywrightCrawlerOptions {
    const crawlLog = new Log({ prefix: this.store.name });

    // const config = Configuration.getGlobalConfig();

    // config.set('persistStorage', 'false');
    // config.set('storageDir', '/dev/shm');

    const configuration: CheerioCrawlerOptions | PlaywrightCrawlerOptions = {
      requestQueue: requestQueue,
      statisticsOptions: {
        logIntervalSecs: 600 // 10 minutes
      },

      sessionPoolOptions: {
        persistStateKeyValueStoreId: `${this.store.safeStoreName}-keyvalue`,
        persistStateKey: `${this.store.safeStoreName}-session-pool`
      },
      maxRequestsPerCrawl: 30000,
      maxRequestsPerMinute: 30,
      maxRequestRetries: 3,
      requestHandlerTimeoutSecs: 240,
      navigationTimeoutSecs: 120,
      respectRobotsTxtFile: false,
      retryOnBlocked: true,
      autoscaledPoolOptions: {
        loggingIntervalSecs: 600,
        snapshotterOptions: {
          clientSnapshotIntervalSecs: 30,
          eventLoopSnapshotIntervalSecs: 30,
          maxBlockedMillis: 50
        }
      },
      log: crawlLog
    };
    return configuration;
  }

  async crawlSite(): Promise<void> {
    await this.crawler.run([this.store.options.startUrl]);

    const storeLogger = createStoreLogger(this.store.name);

    storeLogger.log('info', `Crawl of store ${this.store.name} completed.`);
    storeLogger.log('info', `Total requests: ${this.result.totalRequests}`);
    storeLogger.log('info', `Total processed: ${this.result.totalProcessed}`);
    storeLogger.log('info', `Total errored: ${this.result.totalErrored}`);
    storeLogger.log(
      'info',
      `Description errors: ${this.result.descriptionError}`
    );
    storeLogger.log('info', `Attribute errors: ${this.result.attributeError}`);
    storeLogger.log('info', `Image errors: ${this.result.imageError}`);
    storeLogger.log('info', `Brand errors: ${this.result.brandError}`);
    storeLogger.log('info', `Name errors: ${this.result.nameError}`);
    storeLogger.log('info', `InStock errors: ${this.result.inStockError}`);
    storeLogger.log(
      'info',
      `Categories errors: ${this.result.categoriesError}`
    );
    storeLogger.close();

    return;
  }
  abstract setupCrawler(
    configuration: CheerioCrawlerOptions | PlaywrightCrawlerOptions
  ): CheerioCrawler | PlaywrightCrawler;
}
