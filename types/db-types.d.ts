import { type ObjectId } from 'mongodb';
import { ProductAttributeGroup } from './types.js';

export interface StoreConfig extends Store {
  options: WebshopCrawlerOptions;
  safeStoreName: string;
}

export interface MongodbProductMetadata {
  sku: string;
  storeId: ObjectId;
  name?: string;
  brand?: string;
  ean?: string;
  attributes?: ProductAttributeGroup[];
  image?: string;
  description?: string;
  inStock?: boolean;
  url?: string;
}

export interface MongodbProductPrice {
  sku: string;
  storeId: ObjectId;
  salePrice: boolean;
  price: number;
  start: number;
  end: number;
}

//Mariadb types

export type DbId = number | bigint;

export interface IdLookup {
  id: DbId;
}

export interface Store {
  id: DbId;
  name: string;
  createdDate: Date;
  lastScanDate: Date;
  scraperEnabled: boolean;
  apiEnabled: boolean;
}

export interface Product {
  id: DbId;
  storeId: DbId;
  manufacturerId?: DbId;
  categoryId?: DbId;
  sku: string;
  name?: string;
  image?: string;
  ean?: string;
  description?: string;
  url?: string;
  inStock?: boolean;
  firstSeenDate: Date;
  lastChangeDate: Date;
}

export interface ProductPrice {
  productId: DbId;
  price: number;
  start: Date;
  end: Date;
}

export interface Category {
  id: DbId;
  parentId?: DbId;
  name: string;
}

export interface Manufacturer {
  id: DbId;
  name: string;
}

export interface AttributeGroup {
  id: DbId;
  name: string;
}

export interface Attribute {
  id: DbId;
  groupId: DbId;
  name: string;
}

export interface AttributeToProduct {
  attributeId: DbId;
  productId: DbId;
  value: string;
}

//END Mariadb types

export interface WebshopCrawlerOptions {
  storeId: DbId;
  type: 'httpcrawler' | 'crawler';
  startUrl: string;
  selectors: ProductSelectors;
  sanitizers?: ProductSanitizers;
  productPageIdentifier: string;
  urlWhitelist?: string[];
  urlBlacklist?: string[];
  scrollPagesToBottom?: boolean;
  menuClicker?: string;
}

export interface ProductSanitizers {
  sku: ProductSanitizer[];
}

export interface ProductSanitizer {
  match: string;
  replace: string;
}

export interface ProductSelector {
  source: 'url' | 'DOM' | 'script';
  delimiter: string;
  index: number | 'first' | 'last';
}

export interface ProductSelectors {
  productPage: string;
  oldPrice?: string;
  listPrice: string;
  name: string;
  sku: string | ProductSelector;
  image?: string;
  brand?: string;
  description?: string;
  inStock?: string;
  inStockText?: string;
  clickers?: string[];
  categories?: string;
  categorySplitter?: string;
  categoryItemLocator?: string;
  attributes?: AttributeSelectors;
}

export interface AttributeSelectors {
  attributesTable: string;
  attributeGroup?: string;
  attribute: string;
  attributeLabel: string;
  attributeValue: string;
  attributeGroupName?: string;
}

export interface ProductItemClasses {
  itemClass: string;
  oldPriceClass: string;
  listPriceClass: string;
  nameClass: string;
  skuClass: string;
  imageClass: string;
  totalProductsClass: string;
  brandClass: string;
}

export interface FeedOptions {
  feedUrl: string;
}
