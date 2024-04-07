import { Db, MongoClient } from 'mongodb';
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
  const timestamp = Math.floor(new Date().getTime() / 1000);
  return downloadFeed(new URL(store.feedUrl))
    .then((feed) => {
      const promises = [];
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

async function getAllStores(db: Db): Promise<StoreConfig[]> {
  const cursor = db
    .collection<StoreConfig>('stores')
    .find({}, { projection: { _id: 0, feedUrl: 1, name: 1 } });
  return await cursor.toArray();
}

function updateAllStores(mongodb: Db): Promise<void> {
  return getAllStores(mongodb).then((stores) => {
    for (const store of stores) {
      console.log('UPDATING', store.name);
      const storeUpdater = new StoreUpdater(mongodb, store);

      updateStore(store, storeUpdater)
        .then(reportResults)
        .catch((error) => {
          console.log('Error updating store', error);
        });
    }
  });
}
function initMongodbCollections(db: Db): Promise<void> {
  return Promise.all([
    db.collection('priceChanges').createIndex({ store: 1, sku: 1 }),
    db.collection('productMetadata').createIndex({ store: 1, sku: 1 }),
    db.collection('stores').createIndex({ storeName: 1 })
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

if (process.env.IMPORT_INFLUXDB === 'true') {
  console.log('Importing from influx');
  const mongodb = await getMongodb();
  getAllStores(mongodb)
    .then((stores) => {
      const promises = [];
      for (const store of stores) {
        const influxImporter = new InfluxImporter(mongodb, store);
        promises.push(
          influxImporter
            .getAllPricePointsFromInfluxdb()
            .then((priceChanges) =>
              influxImporter.insertPricePointsToMongo(priceChanges)
            )
        );
      }
      return Promise.all(promises);
    })
    .then(() => console.log('Finished importing'))
    .catch((error) => console.log('Error importing from influx', error));
} else {
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
}
