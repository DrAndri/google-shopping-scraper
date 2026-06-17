-- Create database
CREATE DATABASE IF NOT EXISTS webstorinator;

CREATE TABLE IF NOT EXISTS webstorinator.stores (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    createdDate DATE DEFAULT CURRENT_DATE,
    lastScanDate DATE,
    scraperEnabled BOOLEAN NOT NULL DEFAULT FALSE,
    apiEnabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS webstorinator.storeScans (
    storeId TINYINT UNSIGNED NOT NULL,
    date DATE NOT NULL,

    totalRequests INT UNSIGNED,
    totalProcessed INT UNSIGNED,
    totalErrored INT UNSIGNED,
    descriptionError INT UNSIGNED,
    attributeError INT UNSIGNED,
    imageError INT UNSIGNED,
    brandError INT UNSIGNED,
    nameError INT UNSIGNED,
    inStockError INT UNSIGNED,
    categoriesError INT UNSIGNED,

    crawler BOOLEAN NOT NULL,

    PRIMARY KEY (storeId, date),
    CONSTRAINT fk_storeScans_store FOREIGN KEY (storeId) REFERENCES webstorinator.stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webstorinator.manufacturers (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(127) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS webstorinator.categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parentId INT UNSIGNED,
    name VARCHAR(127) NOT NULL,
    CONSTRAINT fk_parentCategory FOREIGN KEY (parentId) REFERENCES webstorinator.categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webstorinator.products (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    storeId TINYINT UNSIGNED NOT NULL,
    manufacturerId SMALLINT UNSIGNED,
    categoryId INT UNSIGNED,
    sku VARCHAR(64) NOT NULL,
    name VARCHAR(127),
    image VARCHAR(255),
    ean VARCHAR(64),
    description TEXT,
    url VARCHAR(255),
    inStock BOOLEAN,
    firstSeenDate DATE NOT NULL,
    lastChangeDate DATE NOT NULL,
    CONSTRAINT uq_store_sku UNIQUE INDEX (storeId, sku),
    CONSTRAINT fk_products_store FOREIGN KEY (storeId) REFERENCES webstorinator.stores(id) ON DELETE CASCADE,
    CONSTRAINT fk_products_manufacturer FOREIGN KEY (manufacturerId) REFERENCES webstorinator.manufacturers(id) ON DELETE SET NULL,
    CONSTRAINT fk_products_category FOREIGN KEY (categoryId) REFERENCES webstorinator.categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS webstorinator.prices (
    productId INT UNSIGNED NOT NULL,
    price MEDIUMINT UNSIGNED NOT NULL,
    start DATE NOT NULL,
    end DATE NOT NULL,
    PRIMARY KEY (productId, start),
    INDEX ix_end (end),
    CONSTRAINT fk_prices_product FOREIGN KEY (productId) REFERENCES webstorinator.products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webstorinator.salePrices (
    productId INT UNSIGNED,
    price INT UNSIGNED NOT NULL,
    start DATE NOT NULL,
    end DATE NOT NULL,
    PRIMARY KEY (productId, start),
    INDEX ix_end (end),
    CONSTRAINT fk_salePrices_product FOREIGN KEY (productId) REFERENCES webstorinator.products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webstorinator.attributeGroups (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(127) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS webstorinator.attributes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    groupId INT UNSIGNED,
    name VARCHAR(127) NOT NULL,
    CONSTRAINT fk_attributes_attributeGroup FOREIGN KEY (groupId) REFERENCES webstorinator.attributeGroups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webstorinator.attributeToProducts (
    attributeId INT UNSIGNED,
    productId INT UNSIGNED,
    value VARCHAR(255) NOT NULL,
    PRIMARY KEY (attributeId, productId),
    CONSTRAINT fk_attributeToProducts_attribute FOREIGN KEY (attributeId) REFERENCES webstorinator.attributes(id) ON DELETE CASCADE,
    CONSTRAINT fk_attributeToProducts_product FOREIGN KEY (productId) REFERENCES webstorinator.products(id) ON DELETE CASCADE
);

-- Create scraper user
CREATE USER 'webstore-scraper'@'%' IDENTIFIED BY 'pass1';
GRANT ALL PRIVILEGES ON webstorinator.* TO 'webstore-scraper'@'%';

-- Create api user
CREATE USER 'webstore-api'@'%' IDENTIFIED BY 'pass2';
GRANT SELECT ON webstorinator.* TO 'webstore-api'@'%';

FLUSH PRIVILEGES;