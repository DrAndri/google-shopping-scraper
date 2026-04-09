import { type InsertManyResult } from 'mongodb';
import { StoreConfig } from './db-types.js';

export interface GoogleMerchantFeed {
  rss: {
    channel: {
      item: GoogleMerchantProduct[];
    };
  };
}

export interface ProductScrapeResult {
  product: ProductSnapshot;
  errors: {
    description: boolean;
    attributes: boolean;
    image: boolean;
    brand: boolean;
    name: boolean;
    inStock: boolean;
    categories: boolean;
  };
}

export interface ScrapeResult {
  totalRequests: number;
  totalProcessed: number;
  totalErrored: number;
  descriptionError: number;
  attributeError: number;
  imageError: number;
  brandError: number;
  nameError: number;
  inStockError: number;
  categoriesError: number;
}

export interface ProductSnapshot {
  sku: string;
  price: number;
  title?: string;
  brand?: string;
  gtin?: string;
  salePrice?: number;
  image?: string;
  description?: string;
  inStock?: boolean;
  attributes?: ProductAttributeGroup[];
  url?: string;
  categories?: string[];
}

export interface ProductAttributeGroup {
  name: string;
  attributes: ProductAttribute[];
}

export interface ProductAttribute {
  name: string;
  value: string | number | boolean;
}

export interface GoogleMerchantProduct {
  'g:id': string;
  'g:price': number;
  'g:title': string;
  'g:brand'?: string;
  'g:gtin'?: string;
  'g:sale_price'?: number;
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

export interface CacheItem {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  expires: number;
}

export type CacheItems = Record<string, CacheItem>;
