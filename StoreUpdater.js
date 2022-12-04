import { resolve } from "path";
import { flux, Point } from "@influxdata/influxdb-client";

class StoreUpdater {
  constructor(inFluxQueryApi, inFluxWriteApi, bucket) {
    this.inFluxQueryApi = inFluxQueryApi;
    this.inFluxWriteApi = inFluxWriteApi;
    this.bucket = bucket;
  }

  updateAmountIfDifferent(sku, measurement, amount, timestamp) {
    if (!amount) return null;
    return new Promise((resolve, reject) => {
      const query = flux`from(bucket: "${this.bucket}") 
        |> range(start: -5y)
        |> filter(fn: (r) => r._measurement == "${measurement}" and r.sku == "${sku}")
        |> last()`;
      let value;
      this.inFluxQueryApi.queryRows(query, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          value = o._value;
        },
        error(error) {
          console.error(error);
          reject(error);
        },
        complete() {
          resolve(value);
        },
      });
    }).then((value) => {
      if (value == null || value !== amount) {
        return this.writeNewPoint(sku, measurement, amount, timestamp);
      } else {
        resolve();
      }
    });
  }

  writeDataPointIfPriceIsDifferent(item, timestamp) {
    const sku = item["g:id"];
    const price = item["g:price"];
    const salePrice = item["g:sale_price"];

    const listUpdate = this.updateAmountIfDifferent(
      sku,
      "price",
      price,
      timestamp
    );
    const saleUpdate = this.updateAmountIfDifferent(
      sku,
      "sale_price",
      salePrice,
      timestamp
    );

    return Promise.all([listUpdate, saleUpdate]);
  }

  writeNewPoint(sku, measurement, price, timestamp) {
    return new Promise((resolve) => {
      const point = new Point(measurement)
        .tag("sku", sku)
        .floatField("amount", price)
        .timestamp(timestamp);

      this.inFluxWriteApi.writePoint(point);
      resolve(1);
    });
  }
}

export default StoreUpdater;
