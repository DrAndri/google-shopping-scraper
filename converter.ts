import { Db, UpdateFilter, WithId } from 'mongodb';
import {
  MongodbProductMetadata,
  MongodbProductPrice,
  StoreConfig
} from './types/index.js';
async function getAllStores(db: Db): Promise<WithId<StoreConfig>[]> {
  const cursor = db
    .collection<StoreConfig>('stores')
    .find(
      {},
      { projection: { _id: 1, feedUrl: 1, name: 1, options: 1, type: 1 } }
    );
  return await cursor.toArray();
}

export const addStoreObjectIdFieldToCollections = async (mongodb: Db) => {
  const stores = await getAllStores(mongodb);
  for (const store of stores) {
    const filter = { store: store.name };
    const update: UpdateFilter<MongodbProductPrice> = {
      $set: { store_id: store._id },
      $unset: { store: '' }
    };
    await mongodb
      .collection<MongodbProductMetadata>('productMetadata')
      .updateMany(filter, update);
    await mongodb
      .collection<MongodbProductPrice>('priceChanges')
      .updateMany(filter, update);
  }
  const filter = {};
  const update: UpdateFilter<MongodbProductPrice> = { $unset: { store: '' } };
  await mongodb
    .collection<MongodbProductMetadata>('productMetadata')
    .updateMany(filter, update);
  await mongodb
    .collection<MongodbProductPrice>('priceChanges')
    .updateMany(filter, update);
};
