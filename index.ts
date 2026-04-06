import { Db, MongoClient } from 'mongodb';
import cron from 'node-cron';
import pLimit from 'p-limit';

import * as dotenv from 'dotenv';
import {
  StoreUpdateResult,
  StoreConfig,
  Store,
  WebshopCrawlerOptions
} from './types/index.js';
import WebshopCrawler from './crawler/WebshopCrawler.js';
import WebshopHtmlCrawler from './crawler/WebshopHtmlCrawler.js';
import { createPool } from 'mariadb';
import SQLStoreUpdater, { poolConfig } from './SQLStoreUpdater.js';
import { configs } from './crawler/storeConfigs.js';
import migrate from './MongoToSQLMigrate.js';

const storeConcurrencyLimit = parseInt(
  process.env.STORE_CONCURRENCY_LIMIT ?? '5'
);
const limit = pLimit(storeConcurrencyLimit);

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const storesPool = createPool(poolConfig);
const attributesPool = createPool(poolConfig);
const categoriesPool = createPool(poolConfig);
const manufacturersPool = createPool(poolConfig);

async function updateStore(
  store: Store,
  options: WebshopCrawlerOptions
): Promise<StoreUpdateResult> {
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const storeConfig: StoreConfig = { options: options, ...store };
  const storeUpdater = new SQLStoreUpdater(
    storeConfig,
    currentDate,
    attributesPool,
    categoriesPool,
    manufacturersPool
  );

  if (options.type === 'crawler') {
    const crawler = new WebshopCrawler(
      storeConfig,
      currentDate,
      (scrapedProduct) => storeUpdater.updateProductInDb(scrapedProduct)
    );
    await crawler.crawlSite();
  } else if (options.type === 'httpcrawler') {
    const crawler = new WebshopHtmlCrawler(
      storeConfig,
      currentDate,
      (scrapedProduct) => storeUpdater.updateProductInDb(scrapedProduct)
    );
    await crawler.crawlSite();
  } else
    return Promise.reject(
      new Error('Type not supported for store ' + store.name)
    );

  await storesPool.getConnection().then(async (conn) => {
    await conn.query('UPDATE stores SET lastScanDate = ? WHERE id = ?', [
      currentDate,
      store.id
    ]);
    await conn.release();
  });
  return {
    store: storeConfig,
    productMetadataUpsert: undefined,
    priceUpdate: undefined,
    newPrices: undefined
  };
}

function reportResults(results: StoreUpdateResult): void {
  console.log('FINISHED UPDATING', results.store.name);
  console.log(results.priceUpdate?.modifiedCount ?? 0, ' prices modified');
  console.log(results.newPrices?.insertedCount ?? 0, ' prices inserted');
  console.log(
    results.productMetadataUpsert?.matchedCount ?? 0,
    ' productMetadata matched'
  );
  console.log(
    results.productMetadataUpsert?.upsertedCount ?? 0,
    ' productMetadata upserted'
  );
  console.log(
    results.productMetadataUpsert?.modifiedCount ?? 0,
    ' productMetadata modified'
  );
}

async function getAllStores(): Promise<Store[]> {
  return storesPool.getConnection().then(async (conn) => {
    const res = conn.query<Store[]>(
      'SELECT * FROM stores WHERE scraperEnabled = true'
    );
    await conn.release();
    return res;
  });
}

async function updateAllStores(): Promise<void> {
  const stores = await getAllStores();
  console.log(stores);
  const promises = [];
  for (const store of stores) {
    console.log('UPDATING', store.name);
    const options = configs.find((config) => config.storeId === store.id);
    if (options !== undefined) {
      promises.push(
        limit(() =>
          updateStore(store, options)
            .then(reportResults)
            .catch((error) => {
              console.log('Error updating store ' + store.name, error);
            })
        )
      );
    } else {
      console.log('No config found for store ' + store.name);
    }
  }
  await Promise.all(promises).then(() => {
    console.log('ALL STORES UPDATED');
  });
}
async function initMongodbCollections(db: Db): Promise<string[]> {
  return Promise.all([
    db.collection('priceChanges').createIndex({ store_id: 1, sku: 1 }),
    db.collection('productMetadata').createIndex({ store_id: 1, sku: 1 }),
    db.collection('stores').createIndex({ apiEnabled: 1 }),
    db.collection('stores').createIndex({ scraperEnabled: 1 })
  ]);
}

async function getMongodb(): Promise<Db> {
  if (MONGODB_URI === undefined) {
    throw new Error('MONGODB_URI not set');
  }
  const mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  return mongoClient.db('google-shopping-scraper');
}

const mongoDb = await getMongodb();
await initMongodbCollections(mongoDb);

if (process.env.RUN_MONGO_TO_SQL_MIGRATION === 'true') {
  console.log('Running migration');
  await migrate(mongoDb).catch((error) => console.log(error));
}

if (process.env.RUN_STARTUP_UPDATE === 'true') {
  console.log('Running startup update');
  updateAllStores().catch((error) => console.log(error));
}

if (process.env.CRON_SCHEDULE) {
  cron.schedule(process.env.CRON_SCHEDULE, () => {
    console.log('Updating all stores');
    getMongodb()
      .then(updateAllStores)
      .catch((error) => console.log(error));
  });
  console.log('Cron schedule started');
}
