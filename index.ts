import { Db, MongoClient, WithId } from 'mongodb';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import cron from 'node-cron';
import fetch from 'node-fetch';

import StoreUpdater from './StoreUpdater.js';

import * as dotenv from 'dotenv';
import {
  StoreUpdateResult,
  type GoogleMerchantFeed,
  StoreConfig,
  ProductSnapshot,
  FeedOptions
} from './types/index.js';
import WebshopScraper from './WebshopScraper.js';
import { exit } from 'process';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

// TODO make proper interface for google shopping feed
// https://github.com/xcommerceweb/google-merchant-feed/tree/main/src/models
async function downloadFeed(url: URL): Promise<GoogleMerchantFeed> {
  const response = await fetch(url).then((res) => res.text());
  return await new Promise<GoogleMerchantFeed>((resolve, reject) => {
    if (XMLValidator.validate(response) === true) {
      const parser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: true,
        numberParseOptions: {
          hex: true,
          leadingZeros: true,
          skipLike: /\.[0-9]*0/
        }
      });
      resolve(parser.parse(response) as GoogleMerchantFeed);
    } else reject(new Error('Validation failed'));
  });
}

async function updateStore(
  store: StoreConfig,
  storeUpdater: StoreUpdater
): Promise<StoreUpdateResult> {
  const timestamp = Math.floor(new Date().getTime() / 1000);
  const thresholdTimestamp = timestamp - 172800; //48 hours
  if (store.type === 'feed') {
    const options = store.options as FeedOptions;
    return downloadFeed(new URL(options.feedUrl))
      .then((feed) => {
        const promises = [];
        for (const item of feed.rss.channel.item) {
          const snapshot: ProductSnapshot = {
            sku: item['g:id'],
            sale_price: item['g:sale_price'],
            price: item['g:price'],
            title: item['g:title'],
            gtin: item['g:gtin'],
            brand: item['g:brand']
          };
          promises.push(
            ...storeUpdater.updateProduct(
              snapshot,
              timestamp,
              thresholdTimestamp
            )
          );
        }
        return Promise.all(promises);
      })
      .then(() => {
        return storeUpdater.submitAllDocuments();
      });
  } else if (store.type === 'scraper') {
    const scraper = new WebshopScraper(store);
    const products = await scraper.scrapeSite();
    const promises = [];
    for (const item of products) {
      promises.push(
        ...storeUpdater.updateProduct(item, timestamp, thresholdTimestamp)
      );
    }
    return Promise.all(promises).then(() => {
      return storeUpdater.submitAllDocuments();
    });
  } else return Promise.reject(new Error('Type not supported: ' + store.type));
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

async function getAllStores(db: Db): Promise<WithId<StoreConfig>[]> {
  const cursor = db.collection<StoreConfig>('stores').find(
    { scraperEnabled: true },
    {
      projection: {
        _id: 1,
        feedUrl: 1,
        name: 1,
        options: 1,
        type: 1,
        scraperEnabled: 1
      }
    }
  );
  return await cursor.toArray();
}

function updateAllStores(mongodb: Db): Promise<void> {
  return getAllStores(mongodb).then((stores) => {
    console.log(stores);
    for (const store of stores) {
      console.log('UPDATING', store.name);

      const storeUpdater = new StoreUpdater(mongodb, store);

      updateStore(store, storeUpdater)
        .then(reportResults)
        .catch((error) => {
          console.log('Error updating store ' + store.name, error);
        });
    }
  });
}
function initMongodbCollections(db: Db): Promise<void> {
  return Promise.all([
    db.collection('priceChanges').createIndex({ store_id: 1, sku: 1 }),
    db.collection('productMetadata').createIndex({ store_id: 1, sku: 1 }),
    db.collection('stores').createIndex({ apiEnabled: 1 }),
    db.collection('stores').createIndex({ scraperEnabled: 1 })
  ]).then();
}

function getMongodb(): Promise<Db> {
  if (MONGODB_URI === undefined) {
    throw new Error('MONGODB_URI not set');
  }
  const mongoClient = new MongoClient(MONGODB_URI);
  return mongoClient
    .connect()
    .then(() => mongoClient.db('google-shopping-scraper'));
}

const mongoDb = await getMongodb();
await initMongodbCollections(mongoDb);

if (process.env.RUN_STARTUP_UPDATE === 'true') {
  console.log('Running startup update');
  updateAllStores(mongoDb).catch((error) => console.log(error));
}

cron.schedule('00 12 * * *', () => {
  console.log('Updating all stores');
  getMongodb()
    .then(updateAllStores)
    .catch((error) => console.log(error));
});
console.log('Cron schedule started');
