-- =========================================================
-- Flyway migration: V1__inventory_schema.sql
-- Inventory Service owns: inventory_categories, suppliers,
-- inventory_items, inventory_item_suppliers, purchase_orders,
-- purchase_order_items, stock_receipts, stock_receipt_items,
-- inventory_movements, waste_logs, recipes, recipe_ingredients,
-- inventory_counts, inventory_count_items, stock_transfers,
-- stock_transfer_items
-- =========================================================

CREATE TABLE inventory_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    name        VARCHAR(100) NOT NULL,
    parent_id   UUID REFERENCES inventory_categories(id),
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    UNIQUE (tenant_id, name)
);
CREATE INDEX idx_cat_tenant ON inventory_categories(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    contact_name        VARCHAR(200),
    email               VARCHAR(255),
    phone               VARCHAR(20),
    whatsapp            VARCHAR(20),
    address             TEXT,
    payment_terms_days  INT NOT NULL DEFAULT 30,
    lead_time_days      INT NOT NULL DEFAULT 1,
    delivery_schedule   JSONB NOT NULL DEFAULT '[]',
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE inventory_items (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL,
    category_id                 UUID REFERENCES inventory_categories(id),
    name                        VARCHAR(200) NOT NULL,
    sku                         VARCHAR(100),
    barcode                     VARCHAR(100),
    description                 TEXT,
    abc_category                CHAR(1) NOT NULL DEFAULT 'C' CHECK (abc_category IN ('A','B','C')),
    abc_override                BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_unit               VARCHAR(50) NOT NULL,
    purchase_unit_qty           NUMERIC(10,4) NOT NULL DEFAULT 1,
    recipe_unit                 VARCHAR(50) NOT NULL,
    count_unit                  VARCHAR(50) NOT NULL,
    purchase_to_recipe_factor   NUMERIC(10,6) NOT NULL DEFAULT 1,
    recipe_to_count_factor      NUMERIC(10,6) NOT NULL DEFAULT 1,
    current_stock               NUMERIC(12,4) NOT NULL DEFAULT 0,
    par_level                   NUMERIC(12,4),
    reorder_quantity            NUMERIC(12,4),
    safety_stock                NUMERIC(12,4) NOT NULL DEFAULT 0,
    avg_cost                    NUMERIC(12,4) NOT NULL DEFAULT 0,
    last_purchase_price         NUMERIC(12,4),
    price_alert_threshold       NUMERIC(5,2) NOT NULL DEFAULT 10,
    is_perishable               BOOLEAN NOT NULL DEFAULT FALSE,
    shelf_life_days             INT,
    expiry_alert_days           INT NOT NULL DEFAULT 2,
    storage_location            VARCHAR(100),
    primary_supplier_id         UUID REFERENCES suppliers(id),
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    notes                       TEXT,
    image_url                   VARCHAR(500),
    version                     INT NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);
CREATE INDEX idx_inv_items_tenant ON inventory_items(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inv_items_barcode ON inventory_items(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX idx_inv_items_name_tenant ON inventory_items(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;

CREATE TABLE inventory_item_suppliers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),
    supplier_sku        VARCHAR(100),
    unit_price          NUMERIC(12,4) NOT NULL,
    is_preferred        BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (inventory_item_id, supplier_id)
);

CREATE TABLE purchase_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    po_number               VARCHAR(50) NOT NULL,
    supplier_id             UUID NOT NULL REFERENCES suppliers(id),
    status                  VARCHAR(30) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','sent','partial','received','closed','cancelled')),
    order_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date  DATE,
    actual_delivery_date    DATE,
    subtotal                NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes                   TEXT,
    sent_via                VARCHAR(20),
    sent_at                 TIMESTAMPTZ,
    created_by              UUID NOT NULL,
    received_by             UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    UNIQUE (tenant_id, po_number)
);
CREATE INDEX idx_po_tenant_status ON purchase_orders(tenant_id, status) WHERE deleted_at IS NULL;

CREATE TABLE purchase_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    ordered_quantity    NUMERIC(12,4) NOT NULL,
    ordered_unit        VARCHAR(50) NOT NULL,
    unit_price          NUMERIC(12,4) NOT NULL,
    line_total          NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(ordered_quantity * unit_price, 2)) STORED,
    received_quantity   NUMERIC(12,4) NOT NULL DEFAULT 0,
    invoice_unit_price  NUMERIC(12,4),
    discrepancy_notes   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_receipts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    purchase_order_id       UUID REFERENCES purchase_orders(id),
    supplier_id             UUID REFERENCES suppliers(id),
    receipt_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    invoice_number          VARCHAR(100),
    invoice_date            DATE,
    invoice_amount          NUMERIC(12,2),
    invoice_image_url       VARCHAR(500),
    three_way_match_status  VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (three_way_match_status IN ('pending','matched','discrepancy','approved')),
    match_notes             TEXT,
    received_by             UUID NOT NULL,
    is_confirmed            BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_receipts_tenant ON stock_receipts(tenant_id);

CREATE TABLE stock_receipt_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_receipt_id    UUID NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    expected_quantity   NUMERIC(12,4),
    received_quantity   NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4) NOT NULL,
    expiry_date         DATE,
    batch_number        VARCHAR(100),
    storage_location    VARCHAR(100),
    condition           VARCHAR(20) NOT NULL DEFAULT 'good'
                        CHECK (condition IN ('good','damaged','rejected')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- APPEND-ONLY STOCK LEDGER — never updated or deleted
CREATE TABLE inventory_movements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    movement_type       VARCHAR(50) NOT NULL
                        CHECK (movement_type IN (
                            'receipt','waste','transfer_out','transfer_in',
                            'count_adjust','opening_stock','void'
                        )),
    quantity_delta      NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4),
    reference_id        UUID,
    reference_type      VARCHAR(50),
    notes               TEXT,
    performed_by        UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_inv_movements_item ON inventory_movements(inventory_item_id, created_at DESC);
CREATE INDEX idx_inv_movements_tenant_date ON inventory_movements(tenant_id, created_at DESC);

CREATE TABLE waste_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    quantity            NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    reason              VARCHAR(50) NOT NULL
                        CHECK (reason IN ('spoilage','expiration','prep_waste','overproduction',
                                          'cooking_error','plate_waste','contamination','incorrect_order')),
    station             VARCHAR(100),
    estimated_cost      NUMERIC(12,2),
    photo_url           VARCHAR(500),
    notes               TEXT,
    logged_by           UUID NOT NULL,
    movement_id         UUID REFERENCES inventory_movements(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_waste_logs_tenant_date ON waste_logs(tenant_id, logged_at DESC);
CREATE INDEX idx_waste_logs_item ON waste_logs(inventory_item_id, logged_at DESC);

CREATE TABLE stock_transfers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    from_location   VARCHAR(100) NOT NULL,
    to_location     VARCHAR(100) NOT NULL,
    transfer_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    transferred_by  UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_transfer_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_transfer_id   UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    quantity            NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4)
);

CREATE TABLE inventory_counts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    count_type              VARCHAR(20) NOT NULL DEFAULT 'full'
                            CHECK (count_type IN ('full','cycle')),
    abc_filter              CHAR(1) CHECK (abc_filter IN ('A','B','C')),
    status                  VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress','completed','verified')),
    count_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    verified_at             TIMESTAMPTZ,
    counted_by              UUID NOT NULL,
    verified_by             UUID,
    notes                   TEXT,
    total_variance_cost     NUMERIC(12,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_count_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_count_id  UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    expected_quantity   NUMERIC(12,4) NOT NULL,
    counted_quantity    NUMERIC(12,4),
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4) NOT NULL,
    variance_quantity   NUMERIC(12,4) GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
    variance_cost       NUMERIC(12,2),
    notes               TEXT,
    counted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recipes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    name                    VARCHAR(200) NOT NULL,
    category                VARCHAR(100),
    menu_price              NUMERIC(10,2) NOT NULL DEFAULT 0,
    serving_size            NUMERIC(10,3),
    serving_unit            VARCHAR(50),
    prep_time_minutes       INT,
    cook_time_minutes       INT,
    yield_percent           NUMERIC(5,2) NOT NULL DEFAULT 100,
    total_cost              NUMERIC(10,4) NOT NULL DEFAULT 0,
    food_cost_percent       NUMERIC(5,2) NOT NULL DEFAULT 0,
    menu_matrix_category    VARCHAR(20)
                            CHECK (menu_matrix_category IN ('star','plowhorse','puzzle','dog')),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    notes                   TEXT,
    image_url               VARCHAR(500),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_recipes_name_tenant ON recipes(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;

CREATE TABLE recipe_ingredients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id           UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    inventory_item_id   UUID REFERENCES inventory_items(id),
    sub_recipe_id       UUID REFERENCES recipes(id),
    quantity            NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    waste_percent       NUMERIC(5,2) NOT NULL DEFAULT 0,
    unit_cost           NUMERIC(12,4) NOT NULL DEFAULT 0,
    line_cost           NUMERIC(12,4) NOT NULL DEFAULT 0,
    sort_order          INT NOT NULL DEFAULT 0,
    CONSTRAINT ingredient_xor_sub_recipe CHECK (
        (inventory_item_id IS NOT NULL AND sub_recipe_id IS NULL) OR
        (inventory_item_id IS NULL AND sub_recipe_id IS NOT NULL)
    )
);

-- =========================================================
-- Row-Level Security
-- =========================================================

ALTER TABLE inventory_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_item_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts         ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON inventory_categories
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON suppliers
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON inventory_items
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON inventory_item_suppliers
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON purchase_orders
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON stock_receipts
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON inventory_movements
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON waste_logs
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON recipes
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation ON inventory_counts
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

-- =========================================================
-- Audit trigger
-- =========================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_suppliers_updated_at
    BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inv_items_updated_at
    BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_purchase_orders_updated_at
    BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_recipes_updated_at
    BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
