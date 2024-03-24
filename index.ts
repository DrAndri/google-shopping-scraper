import { MongoClient } from 'mongodb';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import cron from 'node-cron';
import fetch from 'node-fetch';

import StoreUpdater from './StoreUpdater.js';

import * as dotenv from 'dotenv';
import {
  StoreUpdateResult,
  type GoogleMerchantFeed,
  StoreConfig
} from './types.js';
import InfluxImporter from './InfluxImporter.js';

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
    } else reject();
  });
}

async function updateStore(
  store: StoreConfig,
  storeUpdater: StoreUpdater
): Promise<StoreUpdateResult> {
  const timestamp = new Date().getTime();
  return downloadFeed(new URL(store.feedUrl))
    .then((feed) => {
      const promises: Promise<void>[] = [];
      for (const item of feed.rss.channel.item) {
        promises.push(...storeUpdater.updateProduct(item, timestamp));
      }
      return Promise.all(promises);
    })
    .then(() => {
      return storeUpdater.submitAllDocuments();
    });
}

function reportResults(results: StoreUpdateResult): void {
  console.log('FINISHED UPDATING', results.store.name);
  console.log(
    results.priceChangesResult?.insertedCount ?? 0,
    ' prices changes inserted'
  );
  console.log(
    results.productMetadataResult?.matchedCount ?? 0,
    ' productMetadata matched'
  );
  console.log(
    results.productMetadataResult?.upsertedCount ?? 0,
    ' productMetadata upserted'
  );
  console.log(
    results.productMetadataResult?.modifiedCount ?? 0,
    ' productMetadata modified'
  );
}

async function getAllStores(mongoClient: MongoClient): Promise<StoreConfig[]> {
  const cursor = mongoClient
    .db('google-shopping-scraper')
    .collection<StoreConfig>('stores')
    .find();
  return await cursor.toArray();
}

function updateAllStores(mongodbUri: string): void {
  const mongoClient = new MongoClient(mongodbUri);
  mongoClient
    .connect()
    .then(() => getAllStores(mongoClient))
    .then((stores) => {
      for (const store of stores) {
        console.log('UPDATING', store.name);
        const storeUpdater = new StoreUpdater(mongoClient, store);

        updateStore(store, storeUpdater)
          .then(reportResults)
          .catch((error) => {
            console.log('Error updating store', error);
          });
      }
    })
    .then(() => mongoClient.close())
    .catch((error) => {
      console.log('Error connecting to mongodb', error);
    });
}
function initMongodbCollections(mongodbUri: string): void {
  const mongoClient = new MongoClient(mongodbUri);
  mongoClient
    .connect()
    .then(() => {
      const db = mongoClient.db('google-shopping-scraper');
      return Promise.all([
        db.collection('priceChanges').createIndex({ store: 1, sku: 1 }),
        db.collection('productMetadata').createIndex({ store: 1, sku: 1 }),
        db.collection('stores').createIndex({ storeName: 1 })
      ]);
    })
    .then(() => mongoClient.close())
    .catch((error) => {
      console.log('Error initializing mongodb', error);
    });
}

if (MONGODB_URI === undefined) {
  console.log('MONGODB_URI not set');
} else {
  console.log('Running startup update');
  initMongodbCollections(MONGODB_URI);
  updateAllStores(MONGODB_URI);

  cron.schedule('00 12 * * *', () => {
    console.log('Updating all stores');
    updateAllStores(MONGODB_URI);
  });
  console.log('Cron schedule started');

  if (process.env.IMPORT_INFLUXDB === 'true') {
    console.log('Importing from influx');
    const mongoClient = new MongoClient(MONGODB_URI);
    mongoClient
      .connect()
      .then(() => getAllStores(mongoClient))
      .then((stores) => {
        const promises = [];
        for (const store of stores) {
          const influxImporter = new InfluxImporter(
            mongoClient.db('google-shopping-scraper'),
            store
          );
          promises.push(
            influxImporter
              .getAllPricePointsFromInfluxdb()
              .then((priceChanges) =>
                influxImporter.insertPricePointsToMongo(priceChanges)
              )
          );
        }
        return Promise.all(promises).then(() => mongoClient.close());
      })
      .catch((error) => console.log('Error importing from influx', error));
  }
}
