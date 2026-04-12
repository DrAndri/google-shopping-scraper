import { Locator } from 'playwright';
import { AttributeSelectors } from '../types/db-types.js';
import {
  ProductAttribute,
  ProductAttributeGroup,
  ProductScrapeErrors,
  ProductSnapshot
} from '../types/types.js';
import { Logger } from 'winston';
import sanitizeHtml from 'sanitize-html';
import { expect } from 'playwright/test';
import BaseScraper from './BaseScraper.js';

export default class PageScraper extends BaseScraper {
  async scrapePrices(productLocator: Locator): Promise<{
    listPrice: number;
    salePrice: number | undefined;
  }> {
    let oldPrice: number | undefined = undefined;
    if (this.selectors.oldPrice) {
      const oldPriceLocator = productLocator.locator(this.selectors.oldPrice);
      oldPrice =
        oldPriceLocator && (await oldPriceLocator.count()) === 1
          ? await this.evalPrice(this.selectors.oldPrice, productLocator)
          : undefined;
    }
    const price = await this.evalPrice(
      this.selectors.listPrice,
      productLocator
    );
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

  async scrapeCategories(
    productLocator: Locator,
    productName: string | undefined
  ) {
    const { categorySplitter, categoryItemLocator, categories } =
      this.selectors;

    if (!categories) return undefined;

    const locator = productLocator.locator(categories);

    if (categoryItemLocator) {
      const categories: string[] = [];
      const categoryItems = locator.locator(categoryItemLocator);
      for (const categoryItemLocator of await categoryItems.all()) {
        const category = await categoryItemLocator
          .textContent()
          .then((str) => str?.trim());
        if (
          category != null &&
          this.isValidCategory(category) &&
          category != productName &&
          !categories.includes(category)
        )
          categories.push(category);
      }
      return categories;
    } else if (categorySplitter) {
      const categoriesString = await locator.textContent();
      if (!categoriesString) return [];
      if (categorySplitter) return categoriesString.split(categorySplitter);
      return [categoriesString];
    } else return undefined;
  }

  async scrapeAttributes(
    productLocator: Locator,
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
    const attributeTableLocator = productLocator
      .locator(selectors.attributesTable)
      .filter({
        has: selectors.attributeGroup
          ? productLocator
              .page()
              .locator(selectors.attributeGroup)
              .locator(selectors.attribute)
              .locator(selectors.attributeValue)
          : productLocator
              .page()
              .locator(selectors.attribute)
              .locator(selectors.attributeValue)
      });
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

  async scrapeInStock(productLocator: Locator) {
    if (!this.selectors.inStock) return undefined;
    const count = await productLocator
      .locator(this.selectors.inStock)
      .filter({ hasText: this.selectors.inStockText })
      .count();
    return count > 0;
  }

  async scrapeImage(productLocator: Locator) {
    if (!this.selectors.image) return undefined;
    const locator = productLocator.locator(this.selectors.image);
    const src = await locator.getAttribute('src');
    return src ?? undefined;
  }

  async scrapeBrand(productLocator: Locator) {
    if (!this.selectors.brand) return undefined;
    return await this.evalText(this.selectors.brand, productLocator);
  }

  async scrapeDescription(productLocator: Locator) {
    if (!this.selectors.description) return undefined;
    const locator = productLocator.locator(this.selectors.description);
    const html = await locator.innerHTML();
    return sanitizeHtml(html);
  }

  async scrapeProductPage(productLocator: Locator, logger: Logger) {
    const errors: ProductScrapeErrors = {
      description: false,
      attributes: false,
      image: false,
      brand: false,
      name: false,
      inStock: false,
      categories: false
    };
    if (this.selectors.clickers) {
      for (const selector of this.selectors.clickers) {
        try {
          const clickLocator = productLocator.locator(selector);
          if ((await clickLocator.count()) != 1)
            logger.log('warn', 'Clicker %s did not match 1 element', selector);
          await clickLocator.click({ force: true, timeout: 5000 });
        } catch (e) {
          logger.log('warn', 'Clicker %s errored', selector);
          logger.log('debug', e);
        }
      }
    }
    const sku = await this.evalSku(productLocator);
    const { listPrice, salePrice } = await this.scrapePrices(productLocator);

    const inStock = await this.scrapeInStock(productLocator).catch((e) => {
      errors.inStock = e;
      return undefined;
    });
    const image = await this.scrapeImage(productLocator).catch((e) => {
      errors.image = e;
      return undefined;
    });
    const attributeGroups = await this.scrapeAttributes(
      productLocator,
      this.selectors.attributes,
      logger
    ).catch((e) => {
      errors.attributes = e;
      return undefined;
    });

    const name = await this.evalText(this.selectors.name, productLocator).catch(
      (e) => {
        errors.name = e;
        return undefined;
      }
    );
    const brand = await this.scrapeBrand(productLocator).catch((e) => {
      errors.brand = e;
      return undefined;
    });

    const description = await this.scrapeDescription(productLocator).catch(
      (e) => {
        errors.description = e;
        return undefined;
      }
    );
    const categories = await this.scrapeCategories(productLocator, name).catch(
      (e) => {
        errors.categories = e;
        return undefined;
      }
    );

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
      url: productLocator.page().url(),
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

  async evalText(selector: string, locator: Locator) {
    const textLocator = locator.locator(selector);
    const text = await textLocator.textContent();
    return text?.trim();
  }

  async evalPrice(selector: string, locator: Locator) {
    const string = await this.evalText(selector, locator);
    if (!string) return undefined;
    return parseInt(string.replace(/\D/g, ''));
  }

  async evalSku(locator: Locator) {
    let string;
    if (typeof this.selectors.sku !== 'string') {
      if (this.selectors.sku.source === 'url') {
        const url = locator.page().url();
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
      string = await this.evalText(this.selectors.sku, locator);
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
