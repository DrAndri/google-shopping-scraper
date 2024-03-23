import https from 'https';
import { MongoClient } from 'mongodb';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import cron from 'node-cron';

import StoreUpdater from './StoreUpdater';
import config from './config.js';

import * as dotenv from 'dotenv';
import { StoreUpdateResult, type GoogleMerchantFeed } from './types';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

// TODO make proper interface for google shopping feed
// https://github.com/xcommerceweb/google-merchant-feed/tree/main/src/models
async function downloadFeed(url: URL): Promise<GoogleMerchantFeed> {
  return await new Promise<GoogleMerchantFeed>((resolve, reject) => {
    let buffer = '';
    https
      .get(url, (resp) => {
        resp.on('error', (err: string) => {
          console.log('Error while reading', err);
          reject(new Error('Error while reading ' + err));
        });

        resp.on('data', (data) => {
          buffer += data;
        });

        resp.on('end', () => {
          if (XMLValidator.validate(buffer) === true) {
            const parser = new XMLParser({
              ignoreAttributes: false,
              parseAttributeValue: true,
              numberParseOptions: {
                hex: true,
                leadingZeros: true,
                skipLike: /\.[0-9]*0/
              }
            });
            resolve(parser.parse(buffer) as GoogleMerchantFeed);
          } else reject();
        });
      })
      .end();
  });
}

async function updateStore(
  feed: GoogleMerchantFeed,
  storeUpdater: StoreUpdater,
  timestamp: number
): Promise<StoreUpdateResult> {
  const promises: Promise<void>[] = [];
  for (const item of feed.rss.channel.item) {
    promises.push(...storeUpdater.updateProduct(item, timestamp));
  }
  await Promise.all(promises);
  return await storeUpdater.submitAllDocuments();
}

function updateAllStores(mongodbUri: string): void {
  const mongoClient = new MongoClient(mongodbUri);
  mongoClient
    .connect()
    .then(() => {
      for (const store of config) {
        console.log('UPDATING', store.storeName);
        const storeUpdater = new StoreUpdater(mongoClient, store.storeName);
        const timestamp = new Date().getTime();
        downloadFeed(new URL(store.feedUrl))
          .then((feed) => updateStore(feed, storeUpdater, timestamp))
          .then((results: StoreUpdateResult) => {
            console.log('FINISHED UPDATING', store.storeName);
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
          })
          .catch((error) => {
            console.log('Error updating store', error);
          });
      }
    })
    .catch((error) => {
      console.log('Error connecting to mongodb', error);
    });
}
if (MONGODB_URI === undefined) {
  console.log('MONGODB_URI not set');
} else {
  console.log('Running startup update');
  updateAllStores(MONGODB_URI);

  cron.schedule('00 12 * * *', () => {
    console.log('Updating all stores');
    updateAllStores(MONGODB_URI);
  });
  console.log('Cron schedule started');
}
