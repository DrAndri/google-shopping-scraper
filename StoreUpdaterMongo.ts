import {
  Collection,
  Db,
  MongoClient,
  Document,
  UpdateResult,
  InsertManyResult,
} from "mongodb";
import {
  GoogleMerchantProduct,
  MongodbDocument,
  MongodbProductMetadata,
  MongodbProductPrice,
  StoreUpdateResult,
  UpsertManyResult,
} from "./types";

class StoreUpdaterMongo {
  database: Db;
  store: string;
  priceDocuments: MongodbProductPrice[];
  metadataDocuments: MongodbProductMetadata[];
  constructor(mongoClient: MongoClient, store: string) {
    this.store = store;
    this.priceDocuments = [];
    this.metadataDocuments = [];
    this.database = mongoClient.db("google-shopping-scraper");
  }
  isNumber(val: any) {
    return typeof val === "number" && val === val;
  }

  updateProduct(product: GoogleMerchantProduct, timestamp: number) {
    let promises = [];
    const productMetadata = this.getProductMetadata(product, timestamp);
    this.metadataDocuments.push(productMetadata);
    promises.push(
      new Promise<void>((resolve, reject) => {
        this.hasPriceChanged(product, false).then((changed) => {
          if (changed) this.addPriceChange(product, false, timestamp);
          resolve();
        });
      })
    );
    if (productMetadata.on_sale) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          this.hasPriceChanged(product, true).then((changed) => {
            if (changed) this.addPriceChange(product, true, timestamp);
            resolve();
          });
        })
      );
    }
    return promises;
  }

  isOnSale(product: GoogleMerchantProduct) {
    return (
      product["g:sale_price"] !== undefined &&
      product["g:sale_price"] < product["g:price"]
    );
  }

  async hasPriceChanged(
    product: GoogleMerchantProduct,
    salePrice: boolean
  ): Promise<boolean> {
    const cursor = this.database
      .collection<MongodbProductPrice>("priceChanges")
      .find({ sku: product["g:id"], sale_price: salePrice, store: this.store })
      .sort({ timestamp: -1 })
      .limit(1);
    let price: number = 0;
    if (salePrice) {
      price = product["g:sale_price"] ? product["g:sale_price"] : 0;
    } else {
      price = product["g:price"];
    }
    const doc = await cursor.next();
    if (doc) {
      return Promise.resolve(price !== doc?.price);
    } else {
      return Promise.resolve(true);
    }
  }

  getProductMetadata(
    product: GoogleMerchantProduct,
    timestamp: number
  ): MongodbProductMetadata {
    const productMetadata: MongodbProductMetadata = {
      sku: product["g:id"],
      lastSeen: timestamp,
      salePriceLastSeen: this.isOnSale(product) ? timestamp : undefined,
      store: this.store,
    };
    return productMetadata;
  }

  addPriceChange(
    product: GoogleMerchantProduct,
    sale_price: boolean,
    timestamp: number
  ) {
    const price: any = sale_price
      ? product["g:sale_price"]
      : product["g:price"];
    if (this.isNumber(price)) {
      const numberPrice: number = price;
      const document: MongodbProductPrice = {
        sku: product["g:id"],
        price: numberPrice,
        store: this.store,
        sale_price: sale_price,
        timestamp: timestamp,
      };
      this.priceDocuments.push(document);
    }
  }

  async submitAllDocuments() {
    let results: StoreUpdateResult = {
      productMetadataResult: undefined,
      priceChangesResult: undefined,
    };
    if (this.priceDocuments.length > 0)
      results.priceChangesResult = await this.insertDocumentArray(
        this.priceDocuments,
        this.database.collection("priceChanges")
      );
    if (this.metadataDocuments.length > 0)
      results.productMetadataResult = await this.upsertProductMetadata(
        this.metadataDocuments,
        this.database.collection("productMetadata")
      );
    return results;
  }

  async upsertProductMetadata(
    documents: MongodbDocument[],
    collection: Collection<Document>
  ) {
    let promises: Promise<UpdateResult>[] = [];
    const options = { upsert: true };
    for (const document of documents) {
      const filter = { sku: document.sku, store: document.store };
      const update = { $set: document };
      promises.push(collection.updateOne(filter, update, options));
    }
    return Promise.all(promises).then((results) => {
      let result: UpsertManyResult = {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
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
  ) {
    return await collection.insertMany(documents);
  }
}

export default StoreUpdaterMongo;
