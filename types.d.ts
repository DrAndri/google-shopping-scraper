import { ObjectId, type Document, type InsertManyResult } from 'mongodb';

export interface GoogleMerchantFeed {
  rss: {
    channel: {
      item: GoogleMerchantProduct[];
    };
  };
}

export interface ProductSnapshot {
  id: string;
  price: number;
  title: string;
  brand?: string;
  gtin?: string;
  sale_price?: number;
}

export interface GoogleMerchantProduct {
  'g:id': string;
  'g:price': number;
  'g:title': string;
  'g:brand'?: string;
  'g:gtin'?: string;
  'g:sale_price'?: number;
}
enum StoreType {
  scraper = 'scraper',
  feed = 'feed'
}

export interface StoreConfig extends Document {
  feedUrl: string;
  name: string;
  type: StoreType;
  options: WebScraperOptions;
}

export interface MongodbProductMetadata extends Document {
  sku: string;
  store: string;
  name?: string;
  brand?: string;
  ean?: string;
}

export interface MongodbProductPrice extends Document {
  _id?: ObjectId;
  sku: string;
  store: string;
  salePrice: boolean;
  price: number;
  start: number;
  end: number;
}

export interface StoreUpdateResult {
  productMetadataUpsert: UpsertManyResult | undefined;
  newPrices: InsertManyResult | undefined;
  priceUpdate: UpsertManyResult | undefined;
  store: StoreConfig;
}

export interface UpsertManyResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
}

export interface WebScraperOptions {
  catalogSearchUrl: string;
  productItemClasses: ProductItemClasses;
  pageParameter: string;
  totalProductsClass: string;
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
