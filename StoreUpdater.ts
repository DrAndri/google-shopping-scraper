import { type Collection, type Db, type UpdateResult } from 'mongodb';
import {
  StoreConfig,
  type GoogleMerchantProduct,
  type MongodbProductMetadata,
  type MongodbProductPrice,
  type StoreUpdateResult,
  type UpsertManyResult
} from './types.js';

class StoreUpdater {
  pricesCollection: Collection<MongodbProductPrice>;
  metadataCollection: Collection<MongodbProductMetadata>;
  store: StoreConfig;
  priceUpdateDocuments: MongodbProductPrice[];
  newPriceDocuments: MongodbProductPrice[];
  metadataDocuments: MongodbProductMetadata[];
  constructor(mongodb: Db, store: StoreConfig) {
    this.store = store;
    this.priceUpdateDocuments = [];
    this.newPriceDocuments = [];
    this.metadataDocuments = [];
    this.pricesCollection =
      mongodb.collection<MongodbProductPrice>('priceChanges');
    this.metadataCollection =
      mongodb.collection<MongodbProductMetadata>('productMetadata');
  }

  isNumber(val: unknown): boolean {
    return typeof val === 'number' && val === val;
  }

  updateProduct(
    product: GoogleMerchantProduct,
    timestamp: number,
    thresholdTimestamp: number
  ): Promise<void>[] {
    product = this.sanitizeProduct(product);
    const onSale = this.isOnSale(product);
    const promises = [];
    const productMetadata = this.getProductMetadata(product);
    this.metadataDocuments.push(productMetadata);
    promises.push(
      this.addPriceUpsert(product, false, timestamp, thresholdTimestamp)
    );
    if (onSale) {
      promises.push(
        this.addPriceUpsert(product, true, timestamp, thresholdTimestamp)
      );
    }
    return promises;
  }

  async addPriceUpsert(
    product: GoogleMerchantProduct,
    salePrice: boolean,
    timestamp: number,
    thresholdTimestamp: number
  ) {
    const price = await this.getLastPrice(product, salePrice);
    if (price !== null) {
      if (
        this.isPriceDifferent(price, product, salePrice) &&
        thresholdTimestamp > price.end
      ) {
        this.addNewPrice(product, salePrice, timestamp);
      } else {
        this.updatePriceTimestamp(price, timestamp);
      }
    } else {
      this.addNewPrice(product, salePrice, timestamp);
    }
  }

  sanitizeProduct(product: GoogleMerchantProduct): GoogleMerchantProduct {
    product['g:id'] = String(product['g:id']);
    product['g:gtin'] = String(product['g:gtin']);
    product['g:brand'] = String(product['g:brand']);
    product['g:title'] = String(product['g:title']);
    if (typeof product['g:price'] !== 'number')
      throw new Error('price is not a number');
    return product;
  }

  isPriceDifferent(
    price: MongodbProductPrice,
    product: GoogleMerchantProduct,
    salePrice: boolean
  ): boolean {
    return (
      price.price !== (salePrice ? product['g:sale_price'] : product['g:price'])
    );
  }

  isOnSale(product: GoogleMerchantProduct): boolean {
    return (
      product['g:sale_price'] !== undefined &&
      typeof product['g:sale_price'] === 'number' &&
      product['g:sale_price'] < product['g:price']
    );
  }

  async getLastPrice(
    product: GoogleMerchantProduct,
    salePrice: boolean
  ): Promise<MongodbProductPrice | null> {
    const cursor = this.pricesCollection
      .find({
        sku: product['g:id'],
        salePrice: salePrice,
        store: this.store.name
      })
      .sort({ end: -1 })
      .limit(1);
    const doc = await cursor.next();
    return Promise.resolve(doc);
  }

  getProductMetadata(product: GoogleMerchantProduct): MongodbProductMetadata {
    const productMetadata: MongodbProductMetadata = {
      store: this.store.name,
      sku: product['g:id'],
      name: product['g:title'],
      brand: product['g:brand'],
      ean: product['g:gtin']
    };
    return productMetadata;
  }

  updatePriceTimestamp(
    priceDocument: MongodbProductPrice,
    timestamp: number
  ): void {
    priceDocument.end = timestamp;
    this.priceUpdateDocuments.push(priceDocument);
  }

  addNewPrice(
    product: GoogleMerchantProduct,
    salePrice: boolean,
    timestamp: number
  ): void {
    const price: number | undefined = salePrice
      ? product['g:sale_price']
      : product['g:price'];
    if (price && this.isNumber(price)) {
      const document: MongodbProductPrice = {
        sku: product['g:id'],
        price: price,
        store: this.store.name,
        salePrice: salePrice,
        start: timestamp,
        end: timestamp
      };
      this.newPriceDocuments.push(document);
    }
  }

  async submitAllDocuments(): Promise<StoreUpdateResult> {
    const results: StoreUpdateResult = {
      productMetadataUpsert: undefined,
      priceUpdate: undefined,
      newPrices: undefined,
      store: this.store
    };
    if (this.newPriceDocuments.length > 0) {
      results.newPrices = await this.pricesCollection.insertMany(
        this.newPriceDocuments
      );
    }
    if (this.priceUpdateDocuments.length > 0) {
      results.priceUpdate = await this.updatePrices(
        this.priceUpdateDocuments,
        this.pricesCollection
      );
    }
    if (this.metadataDocuments.length > 0) {
      results.productMetadataUpsert = await this.upsertProductMetadata(
        this.metadataDocuments,
        this.metadataCollection
      );
    }
    return results;
  }

  async updatePrices(
    documents: MongodbProductPrice[],
    collection: Collection<MongodbProductPrice>
  ): Promise<UpsertManyResult> {
    const promises: Promise<UpdateResult>[] = [];
    for (const document of documents) {
      if (document._id !== undefined) {
        const filter = { _id: document._id };
        const update = { $set: document };
        promises.push(collection.updateOne(filter, update));
      }
    }
    return await Promise.all(promises).then((results) => {
      const result: UpsertManyResult = {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0
      };
      for (const oneResult of results) {
        result.matchedCount += oneResult.matchedCount;
        result.modifiedCount += oneResult.modifiedCount;
        result.upsertedCount += oneResult.upsertedCount;
      }
      return result;
    });
  }

  async upsertProductMetadata(
    documents: MongodbProductMetadata[],
    collection: Collection<MongodbProductMetadata>
  ): Promise<UpsertManyResult> {
    const promises: Promise<UpdateResult>[] = [];
    const options = { upsert: true };
    for (const document of documents) {
      const filter = { sku: document.sku, store: document.store };
      const update = { $set: document };
      promises.push(collection.updateOne(filter, update, options));
    }
    return await Promise.all(promises).then((results) => {
      const result: UpsertManyResult = {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0
      };
      for (const oneResult of results) {
        result.matchedCount += oneResult.matchedCount;
        result.modifiedCount += oneResult.modifiedCount;
        result.upsertedCount += oneResult.upsertedCount;
      }
      return result;
    });
  }
}

export default StoreUpdater;
