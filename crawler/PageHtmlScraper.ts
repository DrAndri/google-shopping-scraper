import {
  ProductAttribute,
  ProductAttributeGroup,
  ProductScrapeErrors,
  ProductScrapeResult,
  ProductSnapshot
} from '../types/types.js';
import { Logger } from 'winston';
import sanitizeHtml from 'sanitize-html';
import { CheerioAPI } from 'crawlee';
import BaseScraper from './BaseScraper.js';

export default class PageHtmlScraper extends BaseScraper {
  scrapePrices($: CheerioAPI): {
    listPrice: number;
    salePrice: number | undefined;
  } {
    const oldPrice = this.selectors.oldPrice
      ? this.evalPrice(this.selectors.oldPrice, $)
      : undefined;
    const price = this.evalPrice(this.selectors.listPrice, $);
    const listPrice = oldPrice && oldPrice > 0 ? oldPrice : price;
    const salePrice = price;

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
      if (categoriesArray.length == 0)
        throw new Error('No valid categories found');
      return categoriesArray;
    } else if (categorySplitter) {
      const categoriesString = $(categories).text();
      if (!categoriesString) throw new Error('No valid categories found');
      if (categorySplitter) return categoriesString.split(categorySplitter);
      return [categoriesString];
    } else return undefined;
  }

  scrapeAttributes($: CheerioAPI, logger: Logger) {
    const selectors = this.selectors.attributes;
    const attributeGroups: ProductAttributeGroup[] = [];
    try {
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
      ).filter(function () {
        //TODO: reduntant code
        if (selectors.attributeGroup) {
          const attributeGroups = $(this)
            .find(selectors.attributeGroup)
            .filter(function () {
              const attributes = $(this).find(selectors.attribute);
              return (
                attributes.filter(function () {
                  return (
                    $(this).find(selectors.attributeLabel).length > 0 &&
                    $(this).find(selectors.attributeValue).length > 0
                  );
                }).length > 0
              );
            });
          return attributeGroups.length > 0;
        } else {
          const attributes = $(this).find(selectors.attribute);
          return (
            attributes.filter(function () {
              return (
                $(this).find(selectors.attributeLabel).length > 0 &&
                $(this).find(selectors.attributeValue).length > 0
              );
            }).length > 0
          );
        }
      });

      if (attributeTableLocator.length > 0) {
        for (const oneTable of attributeTableLocator.toArray()) {
          const attributeGroupsLocator = selectors.attributeGroup
            ? $(oneTable)
                .find(selectors.attributeGroup)
                .filter(function () {
                  const attributes = $(this).find(selectors.attribute);
                  return (
                    attributes.filter(function () {
                      return (
                        $(this).find(selectors.attributeLabel).length > 0 &&
                        $(this).find(selectors.attributeValue).length > 0
                      );
                    }).length > 0
                  );
                })
            : $(oneTable);
          const groupCount = attributeGroupsLocator.length;
          if (groupCount > 0) {
            for (const attributeGroupLocator of attributeGroupsLocator.toArray()) {
              const groupName = selectors.attributeGroupName
                ? ($(attributeGroupLocator)
                    .find(selectors.attributeGroupName)
                    .first()
                    .text()
                    .trim() ?? undefined)
                : undefined;
              const attributeLocator = $(attributeGroupLocator)
                .find(selectors.attribute)
                .filter(function () {
                  return (
                    $(this).find(selectors.attributeLabel).length > 0 &&
                    $(this).find(selectors.attributeValue).length > 0
                  );
                });

              const attributes: ProductAttribute[] = [];
              for (const oneAttribute of attributeLocator.toArray()) {
                try {
                  const value = $(oneAttribute)
                    .find(selectors.attributeValue)
                    .first()
                    .text();
                  const name = $(oneAttribute)
                    .find(selectors.attributeLabel)
                    .first()
                    .text();
                  if (!value) throw new Error('Attribute value not found');
                  if (!name) throw new Error('Attribute name not found');
                  attributes.push({
                    value: value,
                    name: name
                  });
                } catch (e) {
                  logger.log('debug', 'Error getting attribute: %O', e);
                  logger.log('debug', 'Attribute: %s', $(oneAttribute).text());
                }
              }
              if (attributes.length > 0) {
                attributeGroups.push({
                  name: groupName,
                  attributes: attributes
                });
              }
            }
          } else {
            throw new Error('No attribute groups found');
          }
        }
      } else {
        throw new Error('No attribute tables found');
      }
    } catch (e) {
      logger.log('warn', 'Error scraping attributes: %O', e);
    }

    return attributeGroups.length > 0 ? attributeGroups : undefined;
  }

  hasText($: CheerioAPI, selector: string, text: string) {
    const node = $(this.getSelector(selector));
    if (node.length == 0)
      throw new Error(`Selector ${selector} not found for inStock evaluation`);
    return $(this.getSelector(selector)).filter(
      // eslint-disable-next-line @typescript-eslint/prefer-includes
      (i, element) => $(element).text().indexOf(text) > -1
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

  scrapeProductPage(
    $: CheerioAPI,
    url: string,
    logger: Logger
  ): ProductScrapeResult {
    const sku = this.evalSku($, url);
    const { listPrice, salePrice } = this.scrapePrices($);
    const errors: ProductScrapeErrors = {
      description: false,
      attributes: false,
      image: false,
      brand: false,
      name: false,
      inStock: false,
      categories: false
    };
    let inStock, image, name, brand, description, attributeGroups, categories;
    try {
      inStock = this.scrapeInStock($);
    } catch (e) {
      errors.inStock = e;
    }
    try {
      image = this.scrapeImage($);
    } catch (e) {
      errors.image = e;
    }
    try {
      attributeGroups = this.scrapeAttributes($, logger);
    } catch (e) {
      errors.attributes = e;
    }
    try {
      name = this.evalText(this.selectors.name, $);
    } catch (e) {
      errors.name = e;
    }
    try {
      brand = this.scrapeBrand($);
    } catch (e) {
      errors.brand = e;
    }
    try {
      description = this.scrapeDescription($);
    } catch (e) {
      errors.description = e;
    }
    try {
      categories = this.scrapeCategories($, name);
    } catch (e) {
      errors.categories = e;
    }
    const product: ProductSnapshot = {
      sku: sku,
      price: listPrice,
      salePrice: salePrice,
      title: name,
      brand: brand,
      image: image,
      description: description,
      inStock: inStock,
      attributes: attributeGroups,
      url: this.getRelativeUrl(url),
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
    return textNode.first().text().trim();
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
