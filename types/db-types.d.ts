import { type ObjectId } from 'mongodb';

export interface StoreConfig {
  name: string;
  type: StoreType;
  scraperEnabled: boolean;
  apiEnabled: boolean;
  options: WebScraperOptions | FeedOptions;
}

export interface MongodbProductMetadata {
  sku: string;
  store: string;
  name?: string;
  brand?: string;
  ean?: string;
}

export interface MongodbProductPrice {
  _id?: ObjectId;
  sku: string;
  store: string;
  salePrice: boolean;
  price: number;
  start: number;
  end: number;
}

export interface WebScraperOptions {
  catalogSearchUrl: string;
  productItemClasses: ProductItemClasses;
  pageParameter: string;
  totalProductsClass: string;
  sanitizers?: ProductSanitizers;
}

export interface ProductSanitizers {
  sku: ProductSanitizer;
}

export interface ProductSanitizer {
  value: string;
  replace: string;
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
