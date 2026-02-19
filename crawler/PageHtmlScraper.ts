import {
  AttributeSelectors,
  ProductSanitizers,
  ProductSelectors
} from '../types/db-types.js';
import {
  ProductAttribute,
  ProductAttributeGroup,
  ProductSnapshot
} from '../types/types.js';
import { Logger } from 'winston';
import sanitizeHtml from 'sanitize-html';
import { expect } from 'playwright/test';
import { CheerioAPI } from 'crawlee';

export default class PageHtmlScraper {
  selectors: ProductSelectors;
  sanitizers: ProductSanitizers | undefined;
  categoryBanList: string[];
  batchTimestamp: number;
  constructor(
    selectors: ProductSelectors,
    sanitizers: ProductSanitizers | undefined,
    categoryBanList: string[],
    batchTimestamp: number
  ) {
    this.selectors = selectors;
    this.sanitizers = sanitizers;
    this.categoryBanList = categoryBanList;
    this.batchTimestamp = batchTimestamp;
  }

  scrapePrices($: CheerioAPI): {
    listPrice: number;
    salePrice: number | undefined;
  } {
    const oldPriceLocator = this.selectors.oldPrice
      ? $(this.getSelector(this.selectors.oldPrice))
      : null;
    const oldPrice =
      oldPriceLocator?.length === 1
        ? this.evalPrice(this.selectors.oldPrice, $)
        : undefined;
    const price = this.evalPrice(this.selectors.listPrice, $);
    expect(price).toBeTruthy();
    const listPrice = oldPrice && oldPrice > 0 ? oldPrice : price;
    const salePrice = price;

    //TODO: Remove if expect is working
    if (!listPrice) throw new Error('Price not found');

    return { listPrice, salePrice };
  }

  isValidCategory(category: string) {
    if (category.length < 2) return false;
    const lowerCased = category.toLocaleLowerCase();
    if (this.categoryBanList.find((item) => item == lowerCased)) return false;
    return true;
  }

  scrapeCategories($: CheerioAPI, productName: string | undefined) {
    const { categorySplitter, categoryItemLocator, categories } =
      this.selectors;

    if (!categories) return undefined;

    if (categoryItemLocator) {
      const categoriesArray: string[] = [];
      $(this.getSelector(categories + ' ' + categoryItemLocator)).each(
        (i, categoryNode) => {
          const category = $(categoryNode).text().trim();
          if (
            category != null &&
            this.isValidCategory(category) &&
            category != productName &&
            !categoriesArray.includes(category)
          )
            categoriesArray.push(category);
        }
      );
      return categoriesArray;
    } else if (categorySplitter) {
      const categoriesString = $(categories).text();
      if (!categoriesString) return [];
      if (categorySplitter) return categoriesString.split(categorySplitter);
      return [categoriesString];
    } else return undefined;
  }

  async scrapeAttributes(
    $: CheerioAPI,
    selectors: AttributeSelectors | undefined,
    logger: Logger
  ) {
    const attributeGroups: ProductAttributeGroup[] = [];
    if (
      !selectors?.attribute ||
      !selectors.attributeLabel ||
      !selectors.attributeValue ||
      !selectors.attributesTable
    ) {
      return undefined;
    }
    const attributeTableLocator = $(
      this.getSelector(selectors.attributesTable)
    ).filter(
      (i, elem) =>
        this.hasChild($(elem), selectors.attribute, selectors.attributeValue) !=
        null
    );

    if ((await attributeTableLocator.count()) > 0) {
      for (const oneTable of await attributeTableLocator.all()) {
        const attributeGroupsLocator = selectors.attributeGroup
          ? oneTable.locator(selectors.attributeGroup).filter({
              has: oneTable
                .page()
                .locator(selectors.attribute)
                .locator(selectors.attributeLabel)
            })
          : oneTable;
        const groupCount = await attributeGroupsLocator.count();
        if (groupCount > 0) {
          for (const attributeGroupLocator of await attributeGroupsLocator.all()) {
            const groupName = selectors.attributeGroupName
              ? ((await this.evalText(
                  selectors.attributeGroupName,
                  attributeGroupLocator
                )) ?? 'Óflokkað')
              : 'Óflokkað';
            const attributeLocator = attributeGroupLocator
              .locator(selectors.attribute)
              .filter({
                has: attributeGroupLocator
                  .page()
                  .locator(selectors.attributeLabel)
              })
              .filter({
                has: attributeGroupLocator
                  .page()
                  .locator(selectors.attributeValue)
              });
            const attributes: ProductAttribute[] = [];
            for (const oneAttribute of await attributeLocator.all()) {
              try {
                const value = await this.evalText(
                  selectors.attributeValue,
                  oneAttribute
                );
                const name = await this.evalText(
                  selectors.attributeLabel,
                  oneAttribute
                );
                if (!value) throw new Error('Attribute value not found');
                if (!name) throw new Error('Attribute name not found');
                attributes.push({
                  value: value,
                  name: name
                });
              } catch (e) {
                logger.log('debug', 'Error getting attribute: %O', e);
                logger.log(
                  'debug',
                  'Attribute: %s',
                  await oneAttribute.textContent()
                );
              }
            }
            attributeGroups.push({
              name: groupName,
              attributes: attributes
            });
          }
        } else {
          throw new Error('No attribute groups found');
        }
      }
    } else {
      throw new Error('No attribute tables found');
    }

    return attributeGroups.length > 0 ? attributeGroups : undefined;
  }

  hasText($: CheerioAPI, selector: string, text: string) {
    return $(this.getSelector(selector)).filter(
      // eslint-disable-next-line @typescript-eslint/prefer-includes
      (i, element) => $(element).text().indexOf(text) > -1
    );
  }

  hasChild($: CheerioAPI, selector: string, child: string) {
    return $(this.getSelector(selector)).filter(
      (i, element) =>
        $(element)
          .children()
          .filter((i, element) => $(element).is(child)).length > 0
    );
  }

  scrapeInStock($: CheerioAPI) {
    if (!this.selectors.inStock || !this.selectors.inStockText)
      return undefined;
    const element = this.hasText(
      $,
      this.selectors.inStock,
      this.selectors.inStockText
    );
    return element.length > 0;
  }

  scrapeImage($: CheerioAPI) {
    if (!this.selectors.image) return undefined;
    const locator = $(this.getSelector(this.selectors.image));
    const src = locator.attr('src');
    return src ?? undefined;
  }

  scrapeBrand($: CheerioAPI) {
    if (!this.selectors.brand) return undefined;
    return this.evalText(this.selectors.brand, $);
  }

  scrapeDescription($: CheerioAPI) {
    if (!this.selectors.description) return undefined;
    const locator = $(this.getSelector(this.selectors.description));
    const html = locator.html();
    if (!html) return undefined;
    return sanitizeHtml(html);
  }

  scrapeProductPage($: CheerioAPI, url: string, logger: Logger) {
    const errors = {
      description: false,
      attributes: false,
      image: false,
      brand: false,
      name: false,
      inStock: false,
      categories: false
    };

    const sku = this.evalSku($, url);
    const { listPrice, salePrice } = this.scrapePrices($);

    const inStock = this.scrapeInStock($);
    const image = this.scrapeImage($);
    /*     const attributeGroups = this.scrapeAttributes(
      $,
      this.selectors.attributes,
      logger
    ).catch((e) => {
      logger.log('warn', 'Error scraping attributes: %O', e);
      errors.attributes = true;
      return undefined;
    }); */

    const name = this.evalText(this.selectors.name, $);
    const brand = this.scrapeBrand($);

    const description = this.scrapeDescription($);
    const categories = this.scrapeCategories($, name);

    const product: ProductSnapshot = {
      sku: sku,
      price: listPrice,
      sale_price: salePrice,
      title: name,
      brand: brand,
      image: image,
      description: description,
      inStock: inStock,
      //attributes: attributeGroups,
      url: url,
      categories: categories,
      gtin: undefined
    };
    logger.log('info', 'Found product: %O', product);
    if (product.attributes) {
      for (const attributeGroup of product.attributes) {
        logger.log('debug', attributeGroup.name);
        logger.log('debug', '%O', attributeGroup.attributes);
      }
    }
    return { product, errors };
  }

  getSelector(selector: string) {
    return this.selectors.productPage + ' ' + selector;
  }

  evalText(selector: string, $: CheerioAPI) {
    const textNode = $(this.getSelector(selector));
    return textNode.text().trim();
  }

  evalPrice(selector: string, $: CheerioAPI) {
    const string = this.evalText(selector, $);
    if (!string) return undefined;
    return parseInt(string.replace(/\D/g, ''));
  }

  evalSku($: CheerioAPI, url: string) {
    let string;
    if (typeof this.selectors.sku !== 'string') {
      if (this.selectors.sku.source === 'url') {
        const parts = url.split(this.selectors.sku.delimiter);
        if (this.selectors.sku.index === 'first') {
          string = parts[0].trim();
        } else if (this.selectors.sku.index === 'last') {
          string = parts[parts.length - 1].trim();
        } else {
          string = parts[this.selectors.sku.index].trim();
        }
      }
    } else {
      string = this.evalText(this.selectors.sku, $);
      if (this.sanitizers?.sku) {
        for (const sanitizer of this.sanitizers.sku) {
          string = string?.replace(sanitizer.match, sanitizer.replace);
        }
      }
    }
    string = string?.trim();
    if (!string || string.length < 2)
      throw new Error(`Sku ${string} is not valid`);
    return string;
  }
}
