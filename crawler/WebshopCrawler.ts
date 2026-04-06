import {
  Configuration,
  Log,
  MemoryStorage,
  PlaywrightCrawler,
  PlaywrightCrawlingContext,
  PlaywrightGotoOptions,
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

export default class WebshopCrawler {
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

  async crawlSite(): Promise<void> {
    const cache: CacheItems = {};
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

    const memoryStorage = new MemoryStorage({
      persistStorage: false,
      writeMetadata: false
    });
    const requestQueue = await RequestQueue.open(safeStoreName, {
      storageClient: memoryStorage
    });

    const pageScraper = new PageScraper(selectors, sanitizers, categoryBanList);

    const once = (
      checkFn: () => Promise<false | Locator>,
      opts: { numberOfChecks: number; interval: number }
    ): Promise<false | Locator> => {
      return new Promise((resolve, reject) => {
        const numberOfChecks = opts.numberOfChecks;
        const interval = opts.interval;
        let checksPerformed = 0;
        const intervalID = setInterval(() => {
          void checkFn()
            .then((locator) => {
              if (locator) {
                clearInterval(intervalID);
                resolve(locator);
              } else if (checksPerformed >= numberOfChecks) {
                clearInterval(intervalID);
                resolve(false);
              }
              checksPerformed++;
            })
            .catch(() => reject(new Error('Error in once function')));
        }, interval);
      });
    };

    const findProductLocator = async (page: Page) => {
      try {
        const productLocator = page.locator(selectors.productPage);
        const count = await productLocator.count();
        if (count > 0) {
          const pageContent = await page.content();
          // eslint-disable-next-line @typescript-eslint/prefer-includes
          if (pageContent.indexOf(productPageIdentifier) > -1) {
            return productLocator;
          }
        }
        return false;
      } catch (e) {
        console.log('Error in findProductLocator');
        console.log(e);
        return false;
      }
    };

    const requestHandler = async ({
      request,
      page
    }: {
      request: Request;
      page: Page;
    }) => {
      totalRequests++;
      await page.waitForLoadState('load');
      // await page
      //   .waitForLoadState('networkidle', { timeout: 30000 })
      //   .catch(() => {
      //     /* wait for 30 seconds or until network is idle */
      //   });

      const productLocator = await once(() => findProductLocator(page), {
        interval: 3000,
        numberOfChecks: 7
      });

      const logger = createProductLogger(
        request.loadedUrl ?? 'default label',
        store.name,
        this.batchTimestamp.getTime()
      );

      if (productLocator) {
        //TODO: check if productLocator matches multiple elements
        logger.log('debug', 'processing url: %s', request.loadedUrl);
        try {
          const scrapeResult = await pageScraper.scrapeProductPage(
            productLocator,
            logger
          );

          if (scrapeResult !== undefined) {
            const scrapedProduct = scrapeResult.product;
            if (scrapeResult.errors.description) descriptionError++;
            if (scrapeResult.errors.attributes) attributeError++;
            if (scrapeResult.errors.image) imageError++;
            if (scrapeResult.errors.brand) brandError++;
            if (scrapeResult.errors.name) nameError++;
            if (scrapeResult.errors.inStock) inStockError++;
            if (scrapeResult.errors.categories) categoriesError++;
            totalProcessed++;
            await this.updateProductInDb(scrapedProduct);
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

      if (menuClicker && request.url === startUrl) {
        try {
          const menuLocator = page.locator(menuClicker);
          await menuLocator.click();
        } catch (e) {
          logger.log('error', 'Error clicking menu');
          logger.log('error', '%O', e);
        }
      }

      logger.close();
      await addLinksToQueue(page);
      await page.close();
    };
    const scrollToBottom = async (
      page: Page,
      lastScrollHeight?: number,
      counter = 0
    ) => {
      const scrollHeight =
        lastScrollHeight ??
        (await page.evaluate(
          () => window.document.documentElement.scrollHeight
        ));

      await page.evaluate((scrollHeight) => {
        window.scrollTo({ top: scrollHeight, behavior: 'instant' });
      }, scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const scrollHeightAfter = await page.evaluate(
        () => window.document.documentElement.scrollHeight
      );
      if (counter >= 10) return;
      counter++;
      if (scrollHeightAfter > scrollHeight)
        return scrollToBottom(page, lastScrollHeight, counter);
    };

    const addLinksToQueue = async (page: Page) => {
      if (scrollPagesToBottom) await scrollToBottom(page);
      const links = await page
        .getByRole('link')
        .all()
        .then((links) =>
          Promise.all(
            links.map(
              async (locator) =>
                await locator.getAttribute('href').catch(() => null)
            )
          )
        )
        .then((links) => links.filter((link) => link !== null));

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

    const myHook = async (
      crawlingContext: PlaywrightCrawlingContext,
      gotoOptions: PlaywrightGotoOptions
    ) => {
      const { page } = crawlingContext;
      gotoOptions.waitUntil = 'load';
      // page.on('console', (msg) => {
      //   const msgType = msg.type();
      //   crawlLog.info(`Console ${msgType} on ${page.url()}: ${msg.text()}`);
      // });
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() === 'image') {
          void route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: defaultImage
          });
        } else if (
          blockedPageResourceTypes.some(
            (blocked) => route.request().resourceType() === blocked
          ) ||
          blockedPagePathEndings.some((ending) =>
            route.request().url().endsWith(ending)
          ) ||
          blockedPageUrlPatterns.some((pattern) =>
            route.request().url().includes(pattern)
          )
        ) {
          void route.fulfill({ status: 200 });
        } else if (
          (route.request().resourceType() === 'script' ||
            route.request().url().endsWith('.js')) &&
          route.request().url().includes(startUrl)
        ) {
          const cachedResponse = cache[route.request().url()];
          if (cachedResponse && cachedResponse.expires > Date.now()) {
            void route.fulfill({
              status: cachedResponse.status,
              headers: cachedResponse.headers,
              body: cachedResponse.body
            });
          } else {
            try {
              const response = await route.fetch();
              const body = await response.body();
              const url = response.url();
              const status = response.status();
              const headers = response.headers();
              const cacheControl = headers['cache-control'] || '';
              const maxAgeMatch = /max-age=(\d+)/.exec(cacheControl);
              const maxAge =
                maxAgeMatch && maxAgeMatch.length > 1
                  ? parseInt(maxAgeMatch[1])
                  : 900;
              cache[url] = {
                status: status,
                headers: headers,
                body: body,
                expires: Date.now() + maxAge * 1000
              };
              void route.fulfill({
                status: status,
                headers: headers,
                body: body
              });
            } catch (e) {
              crawlLog.error(
                `Failed to cache script: ${route.request().url()}`
              );
              console.log(e);
            }
          }
        } else {
          void route.continue();
        }
      });
    };

    const crawlLog = new Log({ prefix: store.name });

    const config = Configuration.getGlobalConfig();

    config.set('persistStorage', 'false');
    // config.set('storageDir', '/dev/shm');

    const crawler = new PlaywrightCrawler(
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
        log: crawlLog,
        headless: true,
        browserPoolOptions: {
          maxOpenPagesPerBrowser: 20,
          retireBrowserAfterPageCount: 1000,
          retireInactiveBrowserAfterSecs: 10,
          closeInactiveBrowserAfterSecs: 1000,
          useFingerprints: false,
          fingerprintOptions: {
            useFingerprintCache: false
          }
        },
        launchContext: {
          userDataDir: '/dev/shm/chrome-user-' + new Date().getTime(),
          launchOptions: {
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              // '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--disable-gpu',
              '--no-pings',
              '--no-zygote',
              '--disable-application-cache',
              '--disable-offline-load-stale-cache',
              '--disable-gpu-shader-disk-cache',
              '--disable-web-security',
              '--disable-translate',
              '--disable-session-crashed-bubble',
              '--no-first-run',
              // '--single-process',
              '--noerrdialogs',
              '--disk-cache-dir=/dev/shm/chrome-cache-' + new Date().getTime(),
              // Additional RAM-friendly options
              '--disable-software-rasterizer',
              '--disable-extensions',
              '--disable-background-networking',
              '--disable-sync',

              // Minimize disk I/O
              '--disable-logging',
              '--log-level=3'
            ]
          }
        },
        preNavigationHooks: [myHook]
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

    return;
  }
}
