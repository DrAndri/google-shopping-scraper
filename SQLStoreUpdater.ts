import {
  createPool,
  Pool,
  PoolConfig,
  PoolConnection,
  UpsertResult
} from 'mariadb';
import {
  ProductPrice,
  Category,
  StoreConfig,
  Product,
  AttributeToProduct,
  DbId,
  IdLookup
} from './types/db-types.js';
import {
  ProductSnapshot,
  ProductAttributeGroup,
  StoreUpdateResult
} from './types/types.js';

export const poolConfig: PoolConfig = {
  host: process.env.MARIADB_HOST,
  database: process.env.MARIADB_DATABASE,
  user: process.env.MARIADB_SCRAPER_USER,
  password: process.env.MARIADB_SCRAPER_PASSWORD,
  connectionLimit: 1,
  acquireTimeout: 30000
};

export default class SQLStoreUpdater {
  storeConfig: StoreConfig;
  currentDate: Date;
  productsPool: Pool;
  pricePool: Pool;
  salePricePool: Pool;
  attributesPool: Pool;
  categoriesPool: Pool;
  manufacturersPool: Pool;
  result: StoreUpdateResult;

  constructor(
    storeConfig: StoreConfig,
    currentDate: Date,
    attributesPool: Pool,
    categoriesPool: Pool,
    manufacturersPool: Pool
  ) {
    this.storeConfig = storeConfig;
    this.currentDate = currentDate;
    this.productsPool = createPool(poolConfig);
    this.pricePool = createPool(poolConfig);
    this.salePricePool = createPool(poolConfig);
    this.attributesPool = attributesPool;
    this.categoriesPool = categoriesPool;
    this.manufacturersPool = manufacturersPool;
    this.result = {
      newProducts: 0,
      updatedProducts: 0,
      newPrices: 0,
      updatedPrices: 0,
      newSalePrices: 0,
      updatedSalePrices: 0,
      newAttributes: 0,
      newCategories: 0,
      updatedCategories: 0,
      newManufacturers: 0,
      updatedManufacturers: 0,
      newAttributeGroups: 0,
      newAttributesToProducts: 0,
      updatedAttributesToProducts: 0,
      deletedAttributesToProducts: 0,
      nameUpdates: 0,
      descriptionUpdates: 0,
      imageUpdates: 0,
      inStockUpdates: 0,
      gtinUpdates: 0,
      urlUpdates: 0
    };
  }

  async queryPool<T>(
    pool: Pool,
    query: (conn: PoolConnection) => Promise<T>
  ): Promise<T> {
    const conn = await pool.getConnection();
    let res;
    try {
      res = await query(conn);
    } finally {
      await conn.release();
    }
    return res;
  }

  getFirstDbId(res: IdLookup[]): DbId | undefined {
    return this.getFirstResult(res)?.id;
  }

  getFirstResult<T>(res: T[]): T | undefined {
    return res.length > 0 ? res[0] : undefined;
  }

  async updateLastChangeDate(product: Product): Promise<void> {
    if (product.lastChangeDate < this.currentDate) {
      await this.queryPool(this.productsPool, async (productsConn) => {
        return await productsConn.query<UpsertResult>(
          'UPDATE products SET lastChangeDate = ? WHERE id = ?',
          [this.currentDate, product.id]
        );
      });
    }
  }

  async updateProductInDb(scrapedProduct: ProductSnapshot): Promise<void> {
    const existingProduct = await this.queryPool(
      this.productsPool,
      async (productsConn) => this.upsertProduct(productsConn, scrapedProduct)
    );

    const promises = [];
    promises.push(
      this.queryPool(this.pricePool, async (priceConn) => {
        const priceResult = await this.upsertPrice(
          priceConn,
          existingProduct.id,
          scrapedProduct.price,
          'prices'
        );
        if (priceResult === 'newPrice') this.result.newPrices++;
        else if (priceResult === 'updatedPrice') this.result.updatedPrices++;
        return priceResult;
      })
    );
    if (scrapedProduct.salePrice !== undefined) {
      const salePrice = scrapedProduct.salePrice;
      promises.push(
        this.queryPool(this.salePricePool, async (priceConn) => {
          const salePriceResult = await this.upsertPrice(
            priceConn,
            existingProduct.id,
            salePrice,
            'salePrices'
          );
          if (salePriceResult === 'newPrice') this.result.newSalePrices++;
          else if (salePriceResult === 'updatedPrice')
            this.result.updatedSalePrices++;
          return salePriceResult;
        })
      );
    }

    promises.push(
      this.queryPool(this.categoriesPool, async (categoriesConn) => {
        let categoryChanged = false;
        if (scrapedProduct.categories && scrapedProduct.categories.length > 0) {
          categoryChanged = await this.updateCategories(
            categoriesConn,
            existingProduct,
            scrapedProduct.categories
          );
        } else if (existingProduct.categoryId) {
          await categoriesConn.query(
            'UPDATE products SET categoryId = NULL WHERE id = ?',
            [existingProduct.id]
          );
          categoryChanged = true;
        }
        if (categoryChanged) {
          if (existingProduct.categoryId) this.result.updatedCategories++;
          else this.result.newCategories++;
        }
        return categoryChanged;
      })
    );

    promises.push(
      this.queryPool(this.manufacturersPool, async (manufacturersConn) => {
        let manufacturerChanged = false;
        if (scrapedProduct.brand) {
          manufacturerChanged = await this.updateManufacturer(
            manufacturersConn,
            existingProduct,
            scrapedProduct.brand
          );
        } else if (existingProduct.manufacturerId) {
          await manufacturersConn.query(
            'UPDATE products SET manufacturerId = NULL WHERE id = ?',
            [existingProduct.id]
          );
          manufacturerChanged = true;
        }
        if (manufacturerChanged) {
          if (existingProduct.manufacturerId)
            this.result.updatedManufacturers++;
          else this.result.newManufacturers++;
        }
        return manufacturerChanged;
      })
    );

    if (scrapedProduct.attributes && scrapedProduct.attributes.length > 0) {
      const attributes = scrapedProduct.attributes;
      promises.push(
        this.queryPool(this.attributesPool, async (attributesConn) => {
          const attributesChanged = await this.upsertAttributes(
            attributesConn,
            existingProduct,
            attributes
          );
          return attributesChanged;
        })
      );
    }
    const results = await Promise.all(promises);
    if (results.some((r) => r)) {
      await this.updateLastChangeDate(existingProduct);
    }
  }

  async insertProduct(
    productsConn: PoolConnection,
    scrapedProduct: ProductSnapshot
  ): Promise<Product> {
    const res = await productsConn.query<UpsertResult>(
      'INSERT INTO products (storeId, sku, name, image, ean, description, url, inStock, firstSeenDate, lastChangeDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        this.storeConfig.id,
        scrapedProduct.sku,
        scrapedProduct.title,
        scrapedProduct.image,
        scrapedProduct.gtin,
        scrapedProduct.description,
        scrapedProduct.url,
        scrapedProduct.inStock,
        this.currentDate,
        this.currentDate
      ]
    );
    this.result.newProducts++;
    return {
      id: res.insertId,
      storeId: this.storeConfig.id,
      sku: scrapedProduct.sku,
      name: scrapedProduct.title,
      image: scrapedProduct.image,
      ean: scrapedProduct.gtin,
      description: scrapedProduct.description,
      url: scrapedProduct.url,
      inStock: scrapedProduct.inStock,
      firstSeenDate: this.currentDate,
      lastChangeDate: this.currentDate
    };
  }

  async updateProduct(
    productsConn: PoolConnection,
    existingProduct: Product,
    scrapedProduct: ProductSnapshot
  ): Promise<Product> {
    const colsToUpdate = [];
    if (scrapedProduct.title !== existingProduct.name) {
      colsToUpdate.push({ name: 'name', value: scrapedProduct.title });
      this.result.nameUpdates++;
    }
    if (scrapedProduct.image !== existingProduct.image) {
      colsToUpdate.push({ name: 'image', value: scrapedProduct.image });
      this.result.imageUpdates++;
    }
    if (scrapedProduct.gtin !== existingProduct.ean) {
      colsToUpdate.push({ name: 'ean', value: scrapedProduct.gtin });
      this.result.gtinUpdates++;
    }
    if (scrapedProduct.description !== existingProduct.description) {
      colsToUpdate.push({
        name: 'description',
        value: scrapedProduct.description
      });
      this.result.descriptionUpdates++;
    }
    if (scrapedProduct.url !== existingProduct.url) {
      colsToUpdate.push({ name: 'url', value: scrapedProduct.url });
      this.result.urlUpdates++;
    }
    if (scrapedProduct.inStock !== existingProduct.inStock) {
      colsToUpdate.push({ name: 'inStock', value: scrapedProduct.inStock });
      this.result.inStockUpdates++;
    }
    if (colsToUpdate.length === 0) return existingProduct;
    await productsConn.query(
      'UPDATE products SET ' +
        colsToUpdate.map((c) => `${c.name} = ?`).join(', ') +
        ', lastChangeDate = ? WHERE id = ?',
      [
        ...colsToUpdate.map((c) => c.value),
        this.currentDate,
        existingProduct.id
      ]
    );
    this.result.updatedProducts++;

    // if (
    //   scrapedProduct.title !== existingProduct.name ||
    //   scrapedProduct.image !== existingProduct.image ||
    //   scrapedProduct.gtin !== existingProduct.ean ||
    //   scrapedProduct.description !== existingProduct.description ||
    //   scrapedProduct.url !== existingProduct.url ||
    //   scrapedProduct.inStock !== existingProduct.inStock
    // ) {
    //   //TODO: optimise by only updating changed fields
    //   await productsConn.query(
    //     'UPDATE products SET name = ?, image = ?, ean = ?, description = ?, url = ?, inStock = ?, lastChangeDate = ? WHERE id = ?',
    //     [
    //       scrapedProduct.title,
    //       scrapedProduct.image,
    //       scrapedProduct.gtin,
    //       scrapedProduct.description,
    //       scrapedProduct.url,
    //       scrapedProduct.inStock,
    //       this.currentDate,
    //       existingProduct.id
    //     ]
    //   );
    existingProduct.name = scrapedProduct.title;
    existingProduct.image = scrapedProduct.image;
    existingProduct.ean = scrapedProduct.gtin;
    existingProduct.description = scrapedProduct.description;
    existingProduct.url = scrapedProduct.url;
    existingProduct.inStock = scrapedProduct.inStock;
    existingProduct.lastChangeDate = this.currentDate;
    // }
    return existingProduct;
  }

  async upsertProduct(
    productsConn: PoolConnection,
    scrapedProduct: ProductSnapshot
  ): Promise<Product> {
    const existingProduct = await productsConn
      .query<
        Product[]
      >('SELECT * FROM products WHERE sku = ? AND storeId = ? LIMIT 1', [scrapedProduct.sku, this.storeConfig.id])
      .then((res) => this.getFirstResult(res));
    if (existingProduct) {
      return await this.updateProduct(
        productsConn,
        existingProduct,
        scrapedProduct
      );
    } else {
      return await this.insertProduct(productsConn, scrapedProduct);
    }
  }

  async upsertPrice(
    conn: PoolConnection,
    productId: DbId,
    newPrice: number,
    table: 'prices' | 'salePrices'
  ): Promise<'newPrice' | 'updatedPrice' | false> {
    const lastPrice = await conn
      .query<
        ProductPrice[]
      >(`SELECT price, start, end FROM ${table} WHERE productId = ? ORDER BY start DESC LIMIT 1`, [productId])
      .then((res) => this.getFirstResult(res));
    if (
      lastPrice?.price !== newPrice ||
      this.storeConfig.lastScanDate > lastPrice.end
    ) {
      //If the scraped price is different from the last price or the product was not found during last scan, insert a new price entry
      await conn.query(
        `INSERT INTO ${table} (productId, price, start, end) VALUES (?, ?, ?, ?)`,
        [productId, newPrice, this.currentDate, this.currentDate]
      );
      return 'newPrice';
    } else if (
      lastPrice.price === newPrice &&
      lastPrice.end < this.currentDate
    ) {
      await conn.query(
        `UPDATE ${table} SET end = ? WHERE productId = ? AND start = ?`,
        [this.currentDate, productId, lastPrice.start]
      );
      return 'updatedPrice';
    }
    return false;
  }

  async assignProductToCategory(
    conn: PoolConnection,
    productId: DbId,
    categoryId: DbId
  ): Promise<void> {
    await conn.query('UPDATE products SET categoryId = ? WHERE id = ?', [
      categoryId,
      productId
    ]);
  }
  async upsertCategories(
    conn: PoolConnection,
    categories: string[]
  ): Promise<DbId> {
    let existingRootId = await conn
      .query<
        IdLookup[]
      >('SELECT id FROM categories WHERE name = ? AND parentId IS NULL LIMIT 1', [categories[0]])
      .then((res) => this.getFirstDbId(res));
    if (!existingRootId) {
      const res = await conn.query<UpsertResult>(
        'INSERT INTO categories (name) VALUES (?)',
        [categories[0]]
      );
      existingRootId = res.insertId;
    }

    let parentId = existingRootId;
    for (let i = 1; i < categories.length; i++) {
      const existingCategoryId = await conn
        .query<
          IdLookup[]
        >('SELECT id FROM categories WHERE name = ? AND parentId = ? LIMIT 1', [categories[i], parentId])
        .then((res) => this.getFirstDbId(res));
      if (!existingCategoryId) {
        const res = await conn.query<UpsertResult>(
          'INSERT INTO categories (name, parentId) VALUES (?, ?)',
          [categories[i], parentId]
        );
        parentId = res.insertId;
      } else {
        parentId = existingCategoryId;
      }
    }
    return parentId;
  }

  async updateCategories(
    conn: PoolConnection,
    product: Product,
    categories: string[]
  ): Promise<boolean> {
    const leafCategoryName = categories[categories.length - 1];
    const existingCategories = await conn.query<Category[]>(
      'SELECT id, parentId, name FROM categories WHERE name = ?',
      [leafCategoryName]
    );
    let match = false;
    for (const category of existingCategories) {
      let i = categories.length - 2;
      let currentCategory = category;
      while (i >= 0 && !match) {
        if (!currentCategory.parentId) {
          match = true;
          break;
        }
        const parent = await conn
          .query<
            Category[]
          >('SELECT id, parentId FROM categories WHERE id = ? AND name = ? LIMIT 1', [currentCategory.parentId, categories[i]])
          .then((res) => this.getFirstResult(res));
        if (parent) {
          i--;
          currentCategory = parent;
        } else match = true;
      }
      if (match) {
        if (category.id !== product.categoryId) {
          await this.assignProductToCategory(conn, product.id, category.id);
          return true;
        } else return false;
      }
    }
    if (!match) {
      const lastCategoryId = await this.upsertCategories(conn, categories);
      await this.assignProductToCategory(conn, product.id, lastCategoryId);
      return true;
    }
    return false;
  }

  async updateManufacturer(
    conn: PoolConnection,
    product: Product,
    manufacturer: string
  ): Promise<boolean> {
    let existingManufacturerId = await conn
      .query<
        IdLookup[]
      >('SELECT id FROM manufacturers WHERE name = ? LIMIT 1', [manufacturer])
      .then((res) => this.getFirstDbId(res));
    if (!existingManufacturerId) {
      const res = await conn.query<UpsertResult>(
        'INSERT INTO manufacturers (name) VALUES (?)',
        [manufacturer]
      );
      existingManufacturerId = res.insertId;
    }
    if (existingManufacturerId !== product.manufacturerId) {
      await conn.query('UPDATE products SET manufacturerId = ? WHERE id = ?', [
        existingManufacturerId,
        product.id
      ]);
      return true;
    }
    return false;
  }

  async upsertAttributes(
    conn: PoolConnection,
    product: Product,
    attributes: ProductAttributeGroup[]
  ): Promise<boolean> {
    const existingAttributeToProduct = await conn.query<AttributeToProduct[]>(
      'SELECT * FROM attributeToProducts WHERE productId = ?',
      [product.id]
    );

    let attributesChanged = false;

    for (const attributeGroup of attributes) {
      let existingAttributeGroupId = await conn
        .query<
          IdLookup[]
        >('SELECT id FROM attributeGroups WHERE name = ? LIMIT 1', [attributeGroup.name])
        .then((res) => this.getFirstDbId(res));
      if (!existingAttributeGroupId) {
        const res = await conn.query<UpsertResult>(
          'INSERT INTO attributeGroups (name) VALUES (?)',
          [attributeGroup.name]
        );
        existingAttributeGroupId = res.insertId;
        this.result.newAttributeGroups++;
      }
      for (const attribute of attributeGroup.attributes) {
        try {
          let existingAttributeId = await conn
            .query<
              IdLookup[]
            >('SELECT id FROM attributes WHERE name = ? AND groupId = ? LIMIT 1', [attribute.name, existingAttributeGroupId])
            .then((res) => this.getFirstDbId(res));
          if (!existingAttributeId) {
            const res = await conn.query<UpsertResult>(
              'INSERT INTO attributes (name, groupId) VALUES (?, ?)',
              [attribute.name, existingAttributeGroupId]
            );
            existingAttributeId = res.insertId;
            this.result.newAttributes++;
          }
          const existingAttributeToProductEntry =
            existingAttributeToProduct.find(
              (a) => a.attributeId === existingAttributeId
            );
          if (!existingAttributeToProductEntry) {
            await conn.query(
              'INSERT INTO attributeToProducts (attributeId, productId, value) VALUES (?, ?, ?)',
              [existingAttributeId, product.id, attribute.value]
            );
            attributesChanged = true;
            this.result.newAttributesToProducts++;
          } else if (
            existingAttributeToProductEntry.value !== attribute.value
          ) {
            await conn.query(
              'UPDATE attributeToProducts SET value = ? WHERE attributeId = ? AND productId = ?',
              [attribute.value, existingAttributeId, product.id]
            );
            attributesChanged = true;
            this.result.updatedAttributesToProducts++;
          }
        } catch (e) {
          console.error(
            'Error upserting attributes for product',
            product.id,
            attributeGroup.name,
            attribute.name,
            attribute.value
          );
          console.error(e);
        }
      }
      //TODO: delete attributeToProduct entries that are not present in scraped data anymore
    }
    return attributesChanged;
  }
}
