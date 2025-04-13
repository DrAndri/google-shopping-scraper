import { ObjectId, type InsertManyResult } from 'mongodb';

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
