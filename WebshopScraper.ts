import puppeteer, { ElementHandle, Page } from 'puppeteer';
import { ProductSnapshot, WebScraperOptions } from './types.js';

export default class WebshopScraper {
  options: WebScraperOptions;
  constructor(options: WebScraperOptions) {
    this.options = options;
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

    // let products: ProductSnapshot[] = [];
    const productMap: Map<string, ProductSnapshot> = new Map<
      string,
      ProductSnapshot
    >();
    let nextProducts = await this.scrapePage(page);
    // products = products.concat(nextProducts);
    let pageNumber = 1;

    // while (products.length < totalProducts && nextProducts.length != 0) {
    while (
      (totalProducts ? productMap.size < totalProducts : true) &&
      nextProducts.length != 0
    ) {
      await this.sleep(5);
      const nextUrl = catalogSearchUrl + '&' + pageParameter + '=' + pageNumber;
      console.log('nextUrl: ', nextUrl);
      await page.goto(nextUrl);
      nextProducts = await this.scrapePage(page);
      for (const product of nextProducts) {
        productMap.set(product.id, product);
        // if (
        //   products.filter(
        //     (existingProduct) => existingProduct.id === product.id
        //   ).length === 0
        // )
        //   products.push(product);
      }
      console.log('products size: ', productMap.size);
      pageNumber++;
      //products = products.concat(nextProducts);
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
        id: await this.evalText(productItemClasses.skuClass, element),
        price: listPrice,
        sale_price: salePrice,
        title: await this.evalText(productItemClasses.nameClass, element)
      };
      console.log(product);
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

  sleep(seconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, seconds * 1000);
    });
  }
}
