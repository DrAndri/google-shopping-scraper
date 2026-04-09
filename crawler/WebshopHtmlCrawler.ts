import {
  CheerioAPI,
  CheerioCrawler,
  CheerioCrawlerOptions,
  CheerioCrawlingContext,
  LoadedRequest,
  RequestHandler,
  type Request
} from 'crawlee';
import { createProductLogger } from '../logger.js';
import PageHtmlScraper from './PageHtmlScraper.js';
import BaseCrawler from './BaseCrawler.js';
import { categoryBanList } from './constants.js';

export default class WebshopHtmlCrawler extends BaseCrawler {
  setupCrawler(configuration: CheerioCrawlerOptions) {
    const { selectors, productPageIdentifier, sanitizers } = this.store.options;
    const store = this.store;
    const batchTimestamp = this.currentDate;

    const pageScraper = new PageHtmlScraper(
      selectors,
      sanitizers,
      categoryBanList
    );

    const requestHandler: RequestHandler<
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        request: LoadedRequest<Request<any>>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } & Omit<CheerioCrawlingContext<any, any>, 'request'>
    > = async ({ request, $ }) => {
      this.result.totalRequests++;

      const logger = createProductLogger(
        request.loadedUrl ?? 'default label',
        store.name,
        batchTimestamp
      );
      const productLocator = $(selectors.productPage);
      const html = $.root().html();
      const identifierInHtml = html
        ? // eslint-disable-next-line @typescript-eslint/prefer-includes
          html.indexOf(productPageIdentifier) > -1
        : false;
      if (productLocator.length > 0 && identifierInHtml) {
        logger.log(
          'debug',
          'selector: %s, identifier: %s',
          productLocator.length > 0,
          identifierInHtml
        );
        //TODO: check if productLocator matches multiple elements
        logger.log('debug', 'processing url: %s', request.loadedUrl);
        try {
          const scrapeResult = pageScraper.scrapeProductPage(
            $,
            request.loadedUrl,
            logger
          );

          await this.handleProductScrapeResult(scrapeResult);
        } catch (e) {
          this.handleProductScrapeError(logger, e, request.loadedUrl);
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

      await this.filterAndAddLinksToQueue(links);
    };

    const crawler = new CheerioCrawler({
      ...configuration,
      requestHandler: requestHandler,
      failedRequestHandler({ request, log }) {
        log.info(`Request ${request.url} failed too many times.`);
      }
    });
    return crawler;
  }
}
