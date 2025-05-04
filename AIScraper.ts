import { AIScraperOptions, StoreConfig } from './types/db-types.js';
// import { ProductSnapshot } from './types/types.js';

import { chromium } from 'playwright';
// import puppeteer, { ElementHandle, Page } from 'puppeteer';
import { getLlama } from 'node-llama-cpp';
import { z } from 'zod';
import LLMScraper from 'llm-scraper';

export default class AIScraper {
  store: StoreConfig | undefined;
  options: AIScraperOptions | undefined;
  productSchema;
  constructor(store?: StoreConfig) {
    this.store = store;
    this.options = store?.options as AIScraperOptions;
    this.productSchema = z
      .object({
        sku: z.string().describe('The sku of the product'),
        name: z.string().describe('The name of the product'),
        price: z.number().describe('The price the product is being sold for'),
        listPrice: z
          .number()
          .optional()
          .describe('The list price of the product'),
        brand: z
          .string()
          .optional()
          .describe('The brand or manufacturer of the product'),
        description: z
          .string()
          .optional()
          .describe('The description of the product'),
        ean: z.string().optional().describe('The ean of the product')
      })
      .describe('A product for sale');
    // this.productsSchema = z.array(productSchema);
  }

  async scrapeSite() {
    const llama = await getLlama();
    // Launch a browser instance
    const browser = await chromium.launch();
    // const browser = await puppeteer.launch({
    //   args: ['--no-sandbox', '--disable-setuid-sandbox']
    // });

    const modelPath = 'models/tinyllama-1.1b-chat-v1.0.Q5_K_M.gguf';
    const llm = llama.loadModel({ modelPath });

    // Initialize a new LLMScraper with local model
    const scraper = new LLMScraper(llm);

    // Open the page
    const page = await browser.newPage();
    await page.goto(
      'https://elko.is/vorur/babyliss-air-wand-3-i-1-352558/26312'
    );

    // Run the scraper
    const { data } = await scraper.run(page, this.productSchema, {
      format: 'text'
    });

    console.log(data);

    await page.close();
    await browser.close();
  }
}
