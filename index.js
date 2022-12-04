import pLimit from "p-limit";
import https from "https";
import concat from "concat-stream";
import { InfluxDB } from "@influxdata/influxdb-client";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import cron from "node-cron";

import StoreUpdater from "./StoreUpdater.js";
import config from "./config.js";

import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.INFLUXDB_URL;
const token = process.env.INFLUXDB_TOKEN;
const org = process.env.INFLUXDB_ORG;

const inFluxClient = new InfluxDB({ url: url, token: token });
const inFluxQueryApi = inFluxClient.getQueryApi(org);
const parser = new XMLParser();
const limit = pLimit(4);

function downloadFeed(url) {
  return new Promise((resolve, reject) => {
    https.get(url, function (resp) {
      resp.on("error", function (err) {
        console.log("Error while reading", err);
        reject();
      });

      resp.pipe(
        concat(function (buffer) {
          const xmlString = buffer.toString();
          console.log("finished reading from url");
          if (XMLValidator.validate(xmlString)) {
            resolve(parser.parse(xmlString));
          } else reject();
        })
      );
    });
  });
}

function updateAllStores() {
  for (const store of config) {
    const inFluxWriteApi = inFluxClient.getWriteApi(org, store.bucket);
    const storeUpdater = new StoreUpdater(
      inFluxQueryApi,
      inFluxWriteApi,
      store.bucket
    );
    downloadFeed(store.feedUrl).then((jsonObj) => {
      const timestamp = new Date();
      let promises = [];
      for (const item of jsonObj.rss.channel.item) {
        promises.push(
          limit(() =>
            storeUpdater.writeDataPointIfPriceIsDifferent(item, timestamp)
          )
        );
      }
      Promise.all(promises).then((results) => {
        inFluxWriteApi
          .close()
          .then(() => {
            let pricesUpdated = 0;
            let salePricesUpdated = 0;
            for (const result of results) {
              if (result[0]) pricesUpdated++;
              if (result[1]) salePricesUpdated++;
            }
            console.log("FINISHED UPDATING", store.bucket);
            console.log(pricesUpdated, "prices updated");
            console.log(salePricesUpdated, "sale prices updated");
          })
          .catch((e) => {
            console.error(e);
            console.log("ERROR updateing", store.bucket);
          });
      });
    });
  }
}
console.log("Cron schedule started");
cron.schedule("30 18 * * *", () => {
  console.log("Updating all stores");
  updateAllStores();
});
