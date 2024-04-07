import { InfluxDB, flux } from '@influxdata/influxdb-client';
import { Db } from 'mongodb';
import {
  MongodbProductMetadata,
  MongodbProductPrice,
  StoreConfig
} from './types.js';

class InfluxImporter {
  mongodb: Db;
  store: StoreConfig;
  constructor(mongodb: Db, store: StoreConfig) {
    this.mongodb = mongodb;
    this.store = store;
  }
  getAllPricePointsFromInfluxdb(): Promise<
    Record<string, MongodbProductPrice[]>
  > {
    const inFluxClient = new InfluxDB({
      url: process.env.INFLUXDB_URL ?? '',
      token: process.env.INFLUXDB_TOKEN
    });
    const inFluxQueryApi = inFluxClient.getQueryApi(
      process.env.INFLUXDB_ORG ?? ''
    );
    const store = this.store;
    return new Promise((resolve, reject) => {
      const query = flux`from(bucket: "${this.store.name}") 
      |> range(start: -5y)`;
      const priceChanges: Record<string, MongodbProductPrice[]> = {};
      inFluxQueryApi.queryRows(query, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          const sku = String(o.sku);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const price = parseInt(o._value);
          if (priceChanges[sku] === undefined) priceChanges[sku] = [];
          priceChanges[sku].push({
            sku: sku,
            price: price,
            store: store.name,
            salePrice: o._measurement === 'sale_price',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            start: Math.floor(new Date(o._time).getTime() / 1000),
            end: 0
          });
        },
        error(error) {
          console.error(error);
          reject(error);
        },
        complete() {
          resolve(priceChanges);
        }
      });
    });
  }

  insertPricePointsToMongo(
    pricesChanges: Record<string, MongodbProductPrice[]>
  ) {
    const promises = [];
    for (const [key, value] of Object.entries(pricesChanges)) {
      const onlySalePrices = value.filter((price) => price.salePrice === true);
      const onlyPrices = value.filter((price) => price.salePrice === false);
      const promise = this.mongodb
        .collection<MongodbProductMetadata>('productMetadata')
        .findOne({ sku: key, store: this.store.name })
        .then((metadata) => {
          if (!metadata) {
            const doc: MongodbProductMetadata = {
              sku: key,
              store: this.store.name
            };
            return this.mongodb.collection('productMetadata').insertOne(doc);
          }
        })
        .then(() => {
          for (let i = 0; i < onlyPrices.length; i++) {
            if (i < onlyPrices.length - 1)
              onlyPrices[i].end = onlyPrices[i + 1].start;
            else onlyPrices[i].end = 1711380463;
          }
          return this.mongodb.collection('priceChanges').insertMany(onlyPrices);
        })
        .then(() => {
          for (let i = 0; i < onlySalePrices.length; i++) {
            if (i < onlySalePrices.length - 1)
              onlySalePrices[i].end = onlySalePrices[i + 1].start;
            else onlySalePrices[i].end = 1711380463;
          }
          return this.mongodb
            .collection('priceChanges')
            .insertMany(onlySalePrices);
        });
      promises.push(promise);
    }

    return Promise.all(promises);
  }
}

export default InfluxImporter;
