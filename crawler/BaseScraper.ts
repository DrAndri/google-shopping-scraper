import { ProductSanitizers, ProductSelectors } from '../types/db-types.js';

export default abstract class BaseScraper {
  selectors: ProductSelectors;
  sanitizers: ProductSanitizers | undefined;
  categoryBanList: string[];
  constructor(
    selectors: ProductSelectors,
    sanitizers: ProductSanitizers | undefined,
    categoryBanList: string[]
  ) {
    this.selectors = selectors;
    this.sanitizers = sanitizers;
    this.categoryBanList = categoryBanList;
  }
}
