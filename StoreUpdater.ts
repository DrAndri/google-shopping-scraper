import { WithId, type Collection, type Db, type UpdateResult } from 'mongodb';
import {
  type StoreConfig,
  type ProductSnapshot,
  type MongodbProductMetadata,
  type MongodbProductPrice,
  type StoreUpdateResult,
  type UpsertManyResult
} from './types/index.js';

export default class StoreUpdater {
  pricesCollection: Collection<MongodbProductPrice>;
  metadataCollection: Collection<MongodbProductMetadata>;
  store: WithId<StoreConfig>;
  priceUpdateDocuments: WithId<MongodbProductPrice>[];
  newPriceDocuments: MongodbProductPrice[];
  metadataDocuments: MongodbProductMetadata[];
  constructor(mongodb: Db, store: WithId<StoreConfig>) {
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
    product: ProductSnapshot,
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
    product: ProductSnapshot,
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

  sanitizeProduct(product: ProductSnapshot): ProductSnapshot {
    product.sku = String(product.sku);
    if (product.gtin) product.gtin = String(product.gtin);
    if (product.brand) product.brand = String(product.brand);
    product.title = String(product.title);
    if (typeof product.price !== 'number')
      throw new Error('price is not a number');
    return product;
  }

  isPriceDifferent(
    price: MongodbProductPrice,
    product: ProductSnapshot,
    salePrice: boolean
  ): boolean {
    return price.price !== (salePrice ? product.sale_price : product.price);
  }

  isOnSale(product: ProductSnapshot): boolean {
    return (
      product.sale_price !== undefined &&
      typeof product.sale_price === 'number' &&
      product.sale_price < product.price
    );
  }

  async getLastPrice(
    product: ProductSnapshot,
    salePrice: boolean
  ): Promise<WithId<MongodbProductPrice> | null> {
    const cursor = this.pricesCollection
      .find({
        sku: product.sku,
        salePrice: salePrice,
        store_id: this.store._id
      })
      .sort({ end: -1 })
      .limit(1);
    const doc = await cursor.next();
    return Promise.resolve(doc);
  }

  getProductMetadata(product: ProductSnapshot): MongodbProductMetadata {
    const productMetadata: MongodbProductMetadata = {
      store_id: this.store._id,
      sku: product.sku,
      name: product.title,
      brand: product.brand,
      ean: product.gtin
    };
    return productMetadata;
  }

  updatePriceTimestamp(
    priceDocument: WithId<MongodbProductPrice>,
    timestamp: number
  ): void {
    priceDocument.end = timestamp;
    this.priceUpdateDocuments.push(priceDocument);
  }

  addNewPrice(
    product: ProductSnapshot,
    salePrice: boolean,
    timestamp: number
  ): void {
    const price: number | undefined = salePrice
      ? product.sale_price
      : product.price;
    if (price && this.isNumber(price)) {
      const document: MongodbProductPrice = {
        sku: product.sku,
        price: price,
        store_id: this.store._id,
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
    documents: WithId<MongodbProductPrice>[],
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
      const filter = { sku: document.sku, store_id: document.store_id };
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
