import { ObjectId, type Document, type InsertManyResult } from 'mongodb';

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
  'g:title': string;
  'g:brand': string;
  'g:gtin': string;
  'g:sale_price'?: number;
}

export interface StoreConfig extends Document {
  feedUrl: string;
  name: string;
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
