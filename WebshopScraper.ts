import puppeteer, { ElementHandle, Page } from 'puppeteer';
import {
  ProductSnapshot,
  StoreConfig,
  WebScraperOptions
} from './types/index.js';

export default class WebshopScraper {
  store: StoreConfig;
  options: WebScraperOptions;
  constructor(store: StoreConfig) {
    this.store = store;
    this.options = store.options as WebScraperOptions;
  }

  async scrapeSite(): Promise<ProductSnapshot[]> {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const { catalogSearchUrl, pageParameter, totalProductsClass } =
      this.options;

    await page.goto(catalogSearchUrl);
    const totalElement = totalProductsClass
      ? await page.$(totalProductsClass)
      : null;
    const totalElementText = await totalElement?.evaluate(
      (node) => node.textContent
    );
    const totalProducts = totalElementText ? parseInt(totalElementText) : 0;

    const productMap: Map<string, ProductSnapshot> = new Map<
      string,
      ProductSnapshot
    >();
    let nextProducts = await this.scrapePage(page);
    let pageNumber = 1;

    while (
      (totalProducts ? productMap.size < totalProducts : true) &&
      nextProducts.length != 0
    ) {
      await this.sleep(5);
      const nextUrl = catalogSearchUrl + '&' + pageParameter + '=' + pageNumber;
      await page.goto(nextUrl);
      nextProducts = await this.scrapePage(page);
      for (const product of nextProducts) {
        productMap.set(product.id, product);
      }
      console.log(this.store.name + ' products size: ', productMap.size);
      pageNumber++;
    }
    return Array.from(productMap, ([name, value]) => value);
  }

  async scrapePage(page: Page): Promise<ProductSnapshot[]> {
    const { productItemClasses } = this.options;
    const products: ProductSnapshot[] = [];
    const elements = await page.$$(productItemClasses.itemClass);
    for (const element of elements) {
      const oldPriceElement = await element.$(productItemClasses.oldPriceClass);
      const oldPrice = oldPriceElement
        ? parseInt(
            await this.evalPrice(productItemClasses.oldPriceClass, element)
          )
        : undefined;
      const price = parseInt(
        await this.evalPrice(productItemClasses.listPriceClass, element)
      );
      const listPrice = oldPrice ? oldPrice : price;
      const salePrice = price;
      const product: ProductSnapshot = {
        id: await this.evalSku(productItemClasses.skuClass, element),
        price: listPrice,
        sale_price: salePrice,
        title: await this.evalText(productItemClasses.nameClass, element)
      };
      products.push(product);
    }
    return products;
  }

  async evalText(selector: string, element: ElementHandle) {
    const text = await element.$eval(selector, (node) => node.textContent);
    if (text === null) throw new Error(selector + ' did not match');
    return text;
  }

  async evalPrice(selector: string, element: ElementHandle) {
    const string = await this.evalText(selector, element);
    return string.replace(/\D/g, '');
  }

  async evalSku(selector: string, element: ElementHandle) {
    let string = await this.evalText(selector, element);
    if (this.options.sanitizers?.sku) {
      string = string.replace(
        this.options.sanitizers.sku.value,
        this.options.sanitizers.sku.replace
      );
    }
    return string;
  }

  sleep(seconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, seconds * 1000);
    });
  }
}
