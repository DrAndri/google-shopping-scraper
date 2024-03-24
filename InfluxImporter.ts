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
            price: price,
            sku: sku,
            store: store.name,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            timestamp: Math.floor(new Date(o._time).getTime() / 1000),
            sale_price: o._measurement === 'sale_price'
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
      const promise = this.mongodb
        .collection<MongodbProductMetadata>('productMetadata')
        .findOne({ sku: key, store: this.store.name })
        .then((metadata) => {
          if (!metadata) {
            const onlySalePrices = value.filter((price) => price.sale_price);
            const doc: MongodbProductMetadata = {
              sku: key,
              lastSeen: value[value.length - 1].timestamp,
              store: this.store.name
            };
            if (onlySalePrices.length > 0) {
              doc.salePriceLastSeen =
                onlySalePrices[onlySalePrices.length - 1].timestamp;
            }
            return this.mongodb.collection('productMetadata').insertOne(doc);
          }
        })
        .then(() => this.mongodb.collection('priceChanges').insertMany(value));
      promises.push(promise);
    }

    return Promise.all(promises);
  }
}

export default InfluxImporter;
