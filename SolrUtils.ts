import {
  Attribute,
  AttributeGroup,
  AttributeToProduct,
  Category,
  Manufacturer,
  Product
} from './types/db-types.js';

interface SolrResponse {
  responseHeader: {
    status: number;
    QTime: number;
  };
}

export type SolrProduct = Omit<Product, 'firstSeenDate' | 'lastChangeDate'> & {
  price?: number;
  // Solr doesn't support Date objects, so we convert to string
  firstSeenDate: string;
  lastChangeDate: string;
  [key: `attr_${string}`]: string | undefined;
};

const SOLR_URI = process.env.SOLR_URI ?? 'http://localhost:8983/solr';

const submitUpdate = async (
  core: string,
  data:
    | SolrProduct[]
    | Manufacturer[]
    | Category[]
    | AttributeGroup[]
    | Attribute[]
): Promise<SolrResponse> => {
  const url = `${SOLR_URI}/${core}/update?commit=true`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    console.error(await response.json());
    throw new Error(`Failed to submit update: ${response.statusText}`);
  }
  return (await response.json()) as SolrResponse;
};
export const getSolrProduct = (
  product: Product,
  price?: number,
  attributes?: AttributeToProduct[]
): SolrProduct => {
  const solrProduct: SolrProduct = {
    ...product,
    firstSeenDate: product.firstSeenDate.toISOString().split('T')[0],
    lastChangeDate: product.lastChangeDate.toISOString().split('T')[0]
  };
  if (price !== undefined) {
    solrProduct.price = price;
  }
  if (attributes !== undefined) {
    for (const attribute of attributes) {
      solrProduct[`attr_${attribute.attributeId}`] = attribute.value;
    }
  }
  return solrProduct;
};

export const indexProduct = async (
  product: Product,
  price?: number,
  attributes?: AttributeToProduct[]
): Promise<void> => {
  const solrProduct = getSolrProduct(product, price, attributes);
  await submitUpdate('products', [solrProduct]);
  console.log('Indexed product', product.sku);
};
export const indexProducts = async (products: SolrProduct[]): Promise<void> => {
  await submitUpdate('products', products);
  console.log('Indexed products', products.length);
};
export const indexManufacturer = async (
  manufacturer: Manufacturer
): Promise<void> => {
  await submitUpdate('manufacturers', [manufacturer]);
  console.log('Indexed manufacturer', manufacturer.name);
};
export const indexManufacturers = async (
  manufacturers: Manufacturer[]
): Promise<void> => {
  await submitUpdate('manufacturers', manufacturers);
  console.log('Indexed manufacturers', manufacturers.length);
};
export const indexCategory = async (category: Category): Promise<void> => {
  await submitUpdate('categories', [category]);
  console.log('Indexed category', category.name);
};
export const indexCategories = async (
  categories: Category[]
): Promise<void> => {
  await submitUpdate('categories', categories);
  console.log('Indexed categories', categories.length);
};
export const indexAttributeGroup = async (
  attributeGroup: AttributeGroup
): Promise<void> => {
  await submitUpdate('attribute-groups', [attributeGroup]);
  console.log('Indexed attribute group', attributeGroup.name);
};
export const indexAttributeGroups = async (
  attributeGroups: AttributeGroup[]
): Promise<void> => {
  await submitUpdate('attribute-groups', attributeGroups);
  console.log('Indexed attribute groups', attributeGroups.length);
};
export const indexAttribute = async (attribute: Attribute): Promise<void> => {
  await submitUpdate('attributes', [attribute]);
  console.log('Indexed attribute', attribute.name);
};
export const indexAttributes = async (
  attributes: Attribute[]
): Promise<void> => {
  await submitUpdate('attributes', attributes);
  console.log('Indexed attributes', attributes.length);
};
