import { Db, MongoClient } from 'mongodb';
import cron from 'node-cron';
import pLimit from 'p-limit';

import * as dotenv from 'dotenv';
import {
  StoreUpdateResult,
  StoreConfig,
  Store,
  WebshopCrawlerOptions,
  DbId
} from './types/index.js';
import WebshopCrawler from './crawler/WebshopCrawler.js';
import WebshopHtmlCrawler from './crawler/WebshopHtmlCrawler.js';
import { createPool, Pool } from 'mariadb';
import SQLStoreUpdater, {
  indexEverything,
  poolConfig
} from './SQLStoreUpdater.js';
import { configs } from './crawler/storeConfigs.js';
import migrate from './MongoToSQLMigrate.js';
import { MemoryStorage, RequestList, RequestQueue } from 'crawlee';

const storeConcurrencyLimit = parseInt(
  process.env.STORE_CONCURRENCY_LIMIT ?? '5'
);

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const updateAllActiveProducts = async () => {
  const limit = pLimit(storeConcurrencyLimit);
  const pool = createPool(poolConfig);
  const attributesPool = createPool(poolConfig);
  const categoriesPool = createPool(poolConfig);
  const manufacturersPool = createPool(poolConfig);
  const products = await pool.query<
    { url: string | undefined; storeId: DbId }[]
  >(
    'SELECT url, storeId FROM products JOIN prices ON products.id = prices.productId JOIN stores ON products.storeId = stores.id WHERE prices.end = stores.lastScanDate AND stores.scraperEnabled = 1'
  );
  const stores = await pool.query<Store[]>(
    'SELECT * FROM stores WHERE scraperEnabled = 1'
  );
  await pool.end();
  const storeMap = new Map<DbId, string[]>();
  for (const product of products) {
    if (product.url) {
      if (!storeMap.has(product.storeId)) {
        storeMap.set(product.storeId, []);
      }
      storeMap.get(product.storeId)?.push(product.url);
    }
  }

  const promises = [];

  for (const [storeId, urls] of storeMap.entries()) {
    const store = stores.find((s) => s.id === storeId);
    console.log(`Scraping ${urls.length} products for store ${store?.name}`);
    const options = configs.find((config) => config.storeId === storeId);

    if (options !== undefined && store !== undefined) {
      promises.push(
        limit(() =>
          updateStore(
            store,
            options,
            attributesPool,
            categoriesPool,
            manufacturersPool,
            urls.map((url) => options.startUrl + url)
          )
        )
      );
    } else {
      console.log('No config found for store ' + store?.name);
    }
  }
  await Promise.all(promises);
  await Promise.all([
    attributesPool.end(),
    categoriesPool.end(),
    manufacturersPool.end()
  ]);

  console.log('ALL ACTIVE PRODUCTS UPDATED');
};

async function updateStore(
  store: Store,
  options: WebshopCrawlerOptions,
  attributesPool: Pool,
  categoriesPool: Pool,
  manufacturersPool: Pool,
  urlList?: string[]
): Promise<StoreUpdateResult> {
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  const safeStoreName = store.name.replace(/[^a-zA-Z0-9]/g, '-');
  const storeConfig: StoreConfig = {
    options: options,
    safeStoreName: safeStoreName,
    ...store
  };
  const storeUpdater = new SQLStoreUpdater(
    storeConfig,
    currentDate,
    attributesPool,
    categoriesPool,
    manufacturersPool
  );
  const memoryStorage = new MemoryStorage({
    persistStorage: false,
    writeMetadata: false
  });
  const requestQueue = urlList
    ? undefined
    : await RequestQueue.open(safeStoreName, {
        storageClient: memoryStorage
      });
  const requestList = urlList
    ? await RequestList.open(safeStoreName, urlList)
    : undefined;
  let crawler;
  if (options.type === 'crawler') {
    crawler = new WebshopCrawler(
      storeConfig,
      currentDate,
      (scrapedProduct) => storeUpdater.updateProductInDb(scrapedProduct),
      requestQueue,
      requestList
    );
    await crawler.crawlSite();
  } else if (options.type === 'httpcrawler') {
    crawler = new WebshopHtmlCrawler(
      storeConfig,
      currentDate,
      (scrapedProduct) => storeUpdater.updateProductInDb(scrapedProduct),
      requestQueue,
      requestList
    );
    await crawler.crawlSite();
  } else
    return Promise.reject(
      new Error('Type not supported for store ' + store.name)
    );
  await requestQueue?.drop();
  await memoryStorage.teardown();
  const storesPool = createPool(poolConfig);
  await storesPool.getConnection().then(async (conn) => {
    await conn.query('UPDATE stores SET lastScanDate = ? WHERE id = ?', [
      currentDate,
      store.id
    ]);
    const result = crawler.result;
    await conn.query(
      'INSERT INTO storeScans (storeId, date, totalRequests, totalProcessed, totalErrored, descriptionError, attributeError, imageError, brandError, nameError, inStockError, categoriesError, crawler) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        store.id,
        currentDate,
        result.totalRequests,
        result.totalProcessed,
        result.totalErrored,
        result.descriptionError,
        result.attributeError,
        result.imageError,
        result.brandError,
        result.nameError,
        result.inStockError,
        result.categoriesError,
        urlList ? false : true
      ]
    );
    await conn.release();
  });
  await storesPool.end();
  return storeUpdater.result;
}

function reportResults(results: StoreUpdateResult, storeName: string): void {
  console.log('FINISHED UPDATING', storeName);
  console.log('New products:', results.newProducts);
  console.log('Updated products:', results.updatedProducts);
  console.log('New prices:', results.newPrices);
  console.log('Updated prices:', results.updatedPrices);
  console.log('New sale prices:', results.newSalePrices);
  console.log('Updated sale prices:', results.updatedSalePrices);
  console.log('New attributes:', results.newAttributes);
  // console.log('Updated attributes:', results.updatedAttributes);
  console.log('New categories:', results.newCategories);
  console.log('Updated categories:', results.updatedCategories);
  console.log('New manufacturers:', results.newManufacturers);
  console.log('Updated manufacturers:', results.updatedManufacturers);
  console.log('New attribute groups:', results.newAttributeGroups);
  console.log('New attributes to products:', results.newAttributesToProducts);
  console.log(
    'Updated attributes to products:',
    results.updatedAttributesToProducts
  );
  console.log(
    'Deleted attributes to products:',
    results.deletedAttributesToProducts
  );
  console.log('Name updates:', results.nameUpdates);
  console.log('Description updates:', results.descriptionUpdates);
  console.log('Image updates:', results.imageUpdates);
  console.log('In-stock updates:', results.inStockUpdates);
  console.log('GTIN updates:', results.gtinUpdates);
  console.log('URL updates:', results.urlUpdates);
}

async function getAllStores(storesPool: Pool): Promise<Store[]> {
  return storesPool.getConnection().then(async (conn) => {
    const res = conn.query<Store[]>(
      'SELECT * FROM stores WHERE scraperEnabled = true'
    );
    await conn.release();
    return res;
  });
}

async function updateAllStores(): Promise<void> {
  const limit = pLimit(storeConcurrencyLimit);
  const storesPool = createPool(poolConfig);
  const attributesPool = createPool(poolConfig);
  const categoriesPool = createPool(poolConfig);
  const manufacturersPool = createPool(poolConfig);
  const stores = await getAllStores(storesPool);
  await storesPool.end();
  console.log(stores);
  const promises = [];
  for (const store of stores) {
    console.log('UPDATING', store.name);
    const options = configs.find((config) => config.storeId === store.id);
    if (options !== undefined) {
      promises.push(
        limit(() =>
          updateStore(
            store,
            options,
            attributesPool,
            categoriesPool,
            manufacturersPool
          )
            .then((results) => reportResults(results, store.name))
            .catch((error) => {
              console.log('Error updating store ' + store.name, error);
            })
        )
      );
    } else {
      console.log('No config found for store ' + store.name);
    }
  }
  await Promise.all(promises);
  await Promise.all([
    attributesPool.end(),
    categoriesPool.end(),
    manufacturersPool.end()
  ]);

  console.log('ALL STORES UPDATED');
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

if (process.env.RUN_MONGO_TO_SQL_MIGRATION === 'true') {
  console.log('Running migration');
  const mongoDb = await getMongodb();
  await initMongodbCollections(mongoDb);
  await migrate(mongoDb).catch((error) => console.log(error));
}

if (process.env.INDEX_EVERYTHING === 'true') {
  console.log('Running index everything');
  await indexEverything();
}

if (process.env.RUN_STARTUP_UPDATE === 'true') {
  console.log('Running startup update');
  await updateAllActiveProducts();
  // await updateAllStores();
}

if (process.env.CRON_SCHEDULE) {
  cron.schedule(process.env.CRON_SCHEDULE, () => {
    console.log('Updating all stores');
    updateAllStores().catch((error) => console.log(error));
  });
  console.log('Cron schedule started');
}

if (process.env.CRON_ACTIVE_SCHEDULE) {
  cron.schedule(process.env.CRON_ACTIVE_SCHEDULE, () => {
    console.log('Updating active products');
    updateAllActiveProducts().catch((error) => console.log(error));
  });
  console.log('Cron schedule started');
}
