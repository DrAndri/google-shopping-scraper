import {
  CheerioAPI,
  CheerioCrawler,
  CheerioCrawlingContext,
  Configuration,
  LoadedRequest,
  Log,
  MemoryStorage,
  RequestHandler,
  RequestQueue,
  type Request
} from 'crawlee';
import {
  ProductSnapshot,
  StoreConfig,
  WebshopCrawlerOptions
} from '../types/index.js';
import { createProductLogger, createStoreLogger } from '../logger.js';
import PageHtmlScraper from './PageHtmlScraper.js';

const absoluteUrlRegExp = new RegExp('^(?:[a-z+]+:)?//', 'i');
const categoryBanList = [
  'forsíða',
  'heim',
  'vörur',
  'allar vörur',
  'til baka',
  'leitarniðurstöður'
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

export default class WebshopHtmlCrawler {
  store: StoreConfig;
  batchTimestamp: number;
  constructor(store: StoreConfig, batchTimestamp: number) {
    this.store = store;
    this.batchTimestamp = batchTimestamp;
  }

  async crawlSite(): Promise<ProductSnapshot[]> {
    const safeStoreName = this.store.name.replace(/[^a-zA-Z0-9]/g, '-');
    const {
      startUrl,
      selectors,
      productPageIdentifier,
      sanitizers,
      urlWhitelist,
      urlBlacklist
    } = this.store.options as WebshopCrawlerOptions;
    const store = this.store;
    const batchTimestamp = this.batchTimestamp;

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

    const pageScraper = new PageHtmlScraper(
      selectors,
      sanitizers,
      categoryBanList,
      batchTimestamp
    );

    const requestHandler: RequestHandler<
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        request: LoadedRequest<Request<any>>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } & Omit<CheerioCrawlingContext<any, any>, 'request'>
    > = async ({ request, $ }) => {
      totalRequests++;
      const productLocator = $(selectors.productPage);

      const logger = createProductLogger(
        request.loadedUrl ?? 'default label',
        store.name,
        batchTimestamp
      );
      const html = $.root().html();

      if (
        productLocator.length > 0 &&
        html &&
        // eslint-disable-next-line @typescript-eslint/prefer-includes
        html.indexOf(productPageIdentifier) > -1
      ) {
        //TODO: check if productLocator matches multiple elements
        logger.log('debug', 'processing url: %s', request.loadedUrl);
        try {
          const scrapeResult = pageScraper.scrapeProductPage(
            $,
            request.loadedUrl,
            logger
          );

          if (scrapeResult !== undefined) {
            const scrapedProduct = scrapeResult.product;
            productMap.set(scrapedProduct.sku, scrapedProduct);
            if (scrapeResult.errors.description) descriptionError++;
            if (scrapeResult.errors.attributes) attributeError++;
            if (scrapeResult.errors.image) imageError++;
            if (scrapeResult.errors.brand) brandError++;
            if (scrapeResult.errors.name) nameError++;
            if (scrapeResult.errors.inStock) inStockError++;
            if (scrapeResult.errors.categories) categoriesError++;
            totalProcessed++;
          }
        } catch (e) {
          logger.log(
            'error',
            'Error processing product from url %s',
            request.loadedUrl
          );
          logger.log('error', '%O', e);
          totalErrored++;
        }
      } else {
        logger.log('info', 'url is not a product page: %s', request.loadedUrl);
      }

      logger.close();
      await addLinksToQueue($);
    };

    const addLinksToQueue = async ($: CheerioAPI) => {
      const links: string[] = [];
      $('a').each(function (i, elem) {
        const href = $(elem).attr('href');
        if (href) links.push(href);
      });
      //.then((links) => links.filter((link) => link !== null));

      const { hostname } = new URL(startUrl);
      const hostnameIncludesWww = hostname.startsWith('www.');
      const absoluteUrls = links.map((link) => {
        if (absoluteUrlRegExp.test(link)) return URL.parse(link);
        else return new URL(link, startUrl);
      });

      // Filter out urls that do not match whitelist or match blacklist
      //TODO: remove or implement per site filter lists
      let filteredUrls = absoluteUrls.filter((url) => url !== null);
      if (urlWhitelist !== undefined && urlWhitelist.length > 0) {
        filteredUrls = filteredUrls.filter((url) => {
          return urlWhitelist.some((whitelistEntry) => {
            return url.pathname.startsWith(whitelistEntry);
          });
        });
      }

      if (urlBlacklist !== undefined && urlBlacklist.length > 0) {
        filteredUrls = filteredUrls.filter((url) => {
          return !urlBlacklist.some((blacklistEntry) => {
            return url.pathname.startsWith(blacklistEntry);
          });
        });
      }

      // We use the hostname to filter links that point
      // to a different domain, even subdomain.
      const sameHostnameLinks = filteredUrls
        .filter(
          (url) =>
            url.hostname === hostname ||
            (hostnameIncludesWww
              ? 'www.' + url.hostname === hostname
              : url.hostname === 'www.' + hostname)
        )
        .map((url) => url.href);

      // Finally, we have to add the URLs to the queue
      await crawler.addRequests(
        sameHostnameLinks.filter(
          (url) =>
            !blockedNavigationPathEndings.find((ending) => url.endsWith(ending))
        ),
        { batchSize: 10 }
      );
    };

    const crawlLog = new Log({ prefix: store.name });

    const config = Configuration.getGlobalConfig();

    config.set('persistStorage', 'false');
    // config.set('storageDir', '/dev/shm');

    const crawler = new CheerioCrawler(
      {
        failedRequestHandler({ request, log }) {
          log.info(`Request ${request.url} failed too many times.`);
        },
        // Default is to reuse requestQueue from all crawl instances
        requestQueue: requestQueue,
        statisticsOptions: {
          //logIntervalSecs: 1800 // 30 minutes
          logIntervalSecs: 600 // 10 minutes
        },
        // useSessionPool: false,
        // persistCookiesPerSession: false,

        sessionPoolOptions: {
          persistStateKeyValueStoreId: `${safeStoreName}-keyvalue`,
          persistStateKey: `${safeStoreName}-session-pool`
          // persistenceOptions: {
          //   enable: false
          // }
        },
        maxRequestsPerCrawl: 30000,
        maxRequestsPerMinute: 30,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 240,
        navigationTimeoutSecs: 120,
        respectRobotsTxtFile: false,
        retryOnBlocked: true,
        requestHandler: requestHandler,
        /*       statusMessageLoggingInterval: 600,
      statusMessageCallback: async (ctx) => {
        return ctx.crawler.setStatusMessage(
          `Cache size: ${Object.keys(cache).length}`,
          { level: 'INFO' }
        ); // log level defaults to 'DEBUG'
      }, */
        autoscaledPoolOptions: {
          loggingIntervalSecs: 600,
          snapshotterOptions: {
            clientSnapshotIntervalSecs: 30,
            eventLoopSnapshotIntervalSecs: 30,
            maxBlockedMillis: 50
          }
          // systemStatusOptions: {
          //   maxEventLoopOverloadedRatio: 0.7
          // }
        },
        log: crawlLog
        //preNavigationHooks: [myHook]
      },
      config
    );

    // Run the crawler with initial request
    await crawler.run([startUrl]);

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
