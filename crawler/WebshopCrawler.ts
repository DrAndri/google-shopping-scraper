import {
  Log,
  PlaywrightCrawler,
  PlaywrightCrawlerOptions,
  PlaywrightCrawlingContext,
  PlaywrightGotoOptions,
  type Request
} from 'crawlee';
import { CacheItems } from '../types/index.js';
import { createProductLogger } from '../logger.js';
import PageScraper from './PageScraper.js';
import { Locator, Page } from 'playwright';
import BaseCrawler from './BaseCrawler.js';
import {
  blockedPagePathEndings,
  blockedPageResourceTypes,
  blockedPageUrlPatterns,
  categoryBanList,
  defaultImage
} from './constants.js';

export default class WebshopCrawler extends BaseCrawler {
  setupCrawler(configuration: PlaywrightCrawlerOptions) {
    const cache: CacheItems = {};
    const {
      startUrl,
      selectors,
      productPageIdentifier,
      sanitizers,
      scrollPagesToBottom,
      menuClicker
    } = this.store.options;
    const store = this.store;

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
      this.result.totalRequests++;
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
        this.currentDate
      );

      if (productLocator) {
        //TODO: check if productLocator matches multiple elements
        logger.log('debug', 'processing url: %s', request.loadedUrl);
        try {
          const scrapeResult = await pageScraper.scrapeProductPage(
            productLocator,
            logger
          );

          await this.handleProductScrapeResult(scrapeResult);
        } catch (e) {
          this.handleProductScrapeError(logger, e, request.loadedUrl);
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

      await this.filterAndAddLinksToQueue(links);
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

    // const config = Configuration.getGlobalConfig();

    // config.set('persistStorage', 'false');
    // config.set('storageDir', '/dev/shm');

    const crawler = new PlaywrightCrawler({
      ...configuration,
      failedRequestHandler({ request, log }) {
        log.info(`Request ${request.url} failed too many times.`);
      },
      requestHandler: requestHandler,
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
    });

    return crawler;
  }
}
