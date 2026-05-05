export interface ProductScrapeResult {
  product: ProductSnapshot;
  errors: ProductScrapeErrors;
}

export interface ProductScrapeErrors {
  description: unknown;
  attributes: unknown;
  image: unknown;
  brand: unknown;
  name: unknown;
  inStock: unknown;
  categories: unknown;
}

export interface ScrapeResult {
  totalRequests: number;
  totalProcessed: number;
  totalErrored: number;
  descriptionError: number;
  attributeError: number;
  imageError: number;
  brandError: number;
  nameError: number;
  inStockError: number;
  categoriesError: number;
}

export interface ProductSnapshot {
  sku: string;
  price: number;
  title?: string;
  brand?: string;
  gtin?: string;
  salePrice?: number;
  image?: string;
  description?: string;
  inStock?: boolean;
  attributes?: ProductAttributeGroup[];
  url?: string;
  categories?: string[];
}

export interface ProductAttributeGroup {
  name?: string;
  attributes: ProductAttribute[];
}

export interface ProductAttribute {
  name: string;
  value: string | number | boolean;
}

export interface StoreUpdateResult {
  newProducts: number;
  updatedProducts: number;
  newPrices: number;
  updatedPrices: number;
  newSalePrices: number;
  updatedSalePrices: number;
  newAttributes: number;
  newAttributeGroups: number;
  newAttributesToProducts: number;
  updatedAttributesToProducts: number;
  deletedAttributesToProducts: number;
  newCategories: number;
  updatedCategories: number;
  newManufacturers: number;
  updatedManufacturers: number;

  nameUpdates: number;
  descriptionUpdates: number;
  imageUpdates: number;
  inStockUpdates: number;
  gtinUpdates: number;
  urlUpdates: number;
}

export interface UpsertManyResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
}

export interface CacheItem {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  expires: number;
}

export type CacheItems = Record<string, CacheItem>;
