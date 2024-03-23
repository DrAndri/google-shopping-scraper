import { type Document, type InsertManyResult } from 'mongodb';

export interface StoreConfig {
  feedUrl: string;
  storeName: string;
}

export interface GoogleMerchantFeed {
  rss: {
    channel: {
      item: GoogleMerchantProduct[];
    };
  };
}

export interface GoogleMerchantProduct {
  'g:id': string;
  'g:price': number;
  'g:sale_price'?: number;
}

export interface MongodbDocument extends Document {
  sku: string;
  store: string;
}

export interface MongodbProductMetadata extends MongodbDocument {
  sku: string;
  lastSeen: number;
  salePriceLastSeen?: number;
}

export interface MongodbProductPrice extends MongodbDocument {
  sku: string;
  sale_price: boolean;
  price: number;
  timestamp: number;
}

export interface StoreUpdateResult {
  productMetadataResult: UpsertManyResult | undefined;
  priceChangesResult: InsertManyResult | undefined;
  store: StoreConfig;
}

export interface UpsertManyResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
}
