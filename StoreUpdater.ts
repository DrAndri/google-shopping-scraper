import {
  type Collection,
  type Db,
  type MongoClient,
  type Document,
  type UpdateResult,
  type InsertManyResult
} from 'mongodb';
import {
  type GoogleMerchantProduct,
  type MongodbDocument,
  type MongodbProductMetadata,
  type MongodbProductPrice,
  type StoreUpdateResult,
  type UpsertManyResult
} from './types';

class StoreUpdater {
  database: Db;
  store: string;
  priceDocuments: MongodbProductPrice[];
  metadataDocuments: MongodbProductMetadata[];
  constructor(mongoClient: MongoClient, store: string) {
    this.store = store;
    this.priceDocuments = [];
    this.metadataDocuments = [];
    this.database = mongoClient.db('google-shopping-scraper');
  }

  isNumber(val: unknown): boolean {
    return typeof val === 'number' && val === val;
  }

  updateProduct(
    product: GoogleMerchantProduct,
    timestamp: number
  ): Promise<void>[] {
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

  isOnSale(product: GoogleMerchantProduct): boolean {
    return (
      product['g:sale_price'] !== undefined &&
      product['g:sale_price'] < product['g:price']
    );
  }

  async hasPriceChanged(
    product: GoogleMerchantProduct,
    salePrice: boolean
  ): Promise<boolean> {
    const cursor = this.database
      .collection<MongodbProductPrice>('priceChanges')
      .find({ sku: product['g:id'], sale_price: salePrice, store: this.store })
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
      sku: product['g:id'],
      lastSeen: timestamp,
      store: this.store
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
        store: this.store,
        sale_price: salePrice,
        timestamp
      };
      this.priceDocuments.push(document);
    }
  }

  async submitAllDocuments(): Promise<StoreUpdateResult> {
    const results: StoreUpdateResult = {
      productMetadataResult: undefined,
      priceChangesResult: undefined
    };
    if (this.priceDocuments.length > 0) {
      results.priceChangesResult = await this.insertDocumentArray(
        this.priceDocuments,
        this.database.collection('priceChanges')
      );
    }
    if (this.metadataDocuments.length > 0) {
      results.productMetadataResult = await this.upsertProductMetadata(
        this.metadataDocuments,
        this.database.collection('productMetadata')
      );
    }
    return results;
  }

  async upsertProductMetadata(
    documents: MongodbDocument[],
    collection: Collection<Document>
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

  async insertDocumentArray(
    documents: MongodbDocument[],
    collection: Collection<Document>
  ): Promise<InsertManyResult> {
    return await collection.insertMany(documents);
  }
}

export default StoreUpdater;
