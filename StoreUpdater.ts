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
  priceDocuments: MongodbProductPrice[];
  metadataDocuments: MongodbProductMetadata[];
  constructor(mongodb: Db, store: StoreConfig) {
    this.store = store;
    this.priceDocuments = [];
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
    timestamp: number
  ): Promise<void>[] {
    product = this.sanitizeProduct(product);
    const onSale = this.isOnSale(product);
    const promises = [];
    const productMetadata = this.getProductMetadata(product, onSale, timestamp);
    this.metadataDocuments.push(productMetadata);
    promises.push(
      this.hasPriceChanged(product, false).then((changed) => {
        if (changed) this.addPriceChange(product, false, timestamp);
      })
    );
    if (onSale) {
      promises.push(
        this.hasPriceChanged(product, true).then((changed) => {
          if (changed) this.addPriceChange(product, true, timestamp);
        })
      );
    }
    return promises;
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

  isOnSale(product: GoogleMerchantProduct): boolean {
    return (
      product['g:sale_price'] !== undefined &&
      typeof product['g:sale_price'] === 'number' &&
      product['g:sale_price'] < product['g:price']
    );
  }

  async hasPriceChanged(
    product: GoogleMerchantProduct,
    salePrice: boolean
  ): Promise<boolean> {
    const cursor = this.pricesCollection
      .find(
        {
          sku: product['g:id'],
          sale_price: salePrice,
          store: this.store.name
        },
        {
          projection: {
            price: 1
          }
        }
      )
      .sort({ timestamp: -1 })
      .limit(1);
    let price = 0;
    if (salePrice) {
      price = product['g:sale_price'] ?? 0;
    } else {
      price = product['g:price'];
    }
    const doc = await cursor.next();
    if (doc != null) {
      return await Promise.resolve(price !== doc?.price);
    } else {
      return await Promise.resolve(true);
    }
  }

  getProductMetadata(
    product: GoogleMerchantProduct,
    onSale: boolean,
    timestamp: number
  ): MongodbProductMetadata {
    const productMetadata: MongodbProductMetadata = {
      store: this.store.name,
      sku: product['g:id'],
      name: product['g:title'],
      brand: product['g:brand'],
      ean: product['g:gtin'],
      lastSeen: timestamp
    };
    if (onSale) {
      productMetadata.salePriceLastSeen = timestamp;
    }
    return productMetadata;
  }

  addPriceChange(
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
        sale_price: salePrice,
        timestamp
      };
      this.priceDocuments.push(document);
    }
  }

  async submitAllDocuments(): Promise<StoreUpdateResult> {
    const results: StoreUpdateResult = {
      productMetadataResult: undefined,
      priceChangesResult: undefined,
      store: this.store
    };
    if (this.priceDocuments.length > 0) {
      results.priceChangesResult = await this.pricesCollection.insertMany(
        this.priceDocuments
      );
    }
    if (this.metadataDocuments.length > 0) {
      results.productMetadataResult = await this.upsertProductMetadata(
        this.metadataDocuments,
        this.metadataCollection
      );
    }
    return results;
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
