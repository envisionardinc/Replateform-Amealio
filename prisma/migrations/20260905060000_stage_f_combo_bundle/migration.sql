-- Stage F — food combo / meal-deal bundle (doc 109).
-- Additive. Historical orders and cart item rows are unchanged.
-- Combo is a separate commercial entity; components reference MenuItem.

CREATE TABLE "Combo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchantId" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "availability" "ItemAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "substitutable" BOOLEAN NOT NULL DEFAULT false,
    "comboPriceMinor" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboSlot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comboId" UUID NOT NULL,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComboSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboSlotOption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slotId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComboSlotOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboSection" (
    "comboId" UUID NOT NULL,
    "menuSectionId" UUID NOT NULL,

    CONSTRAINT "ComboSection_pkey" PRIMARY KEY ("comboId","menuSectionId")
);

ALTER TABLE "CartItem" ADD COLUMN "comboId" UUID;

CREATE INDEX "CartItem_comboId_idx" ON "CartItem"("comboId");

CREATE INDEX "Combo_restaurantId_idx" ON "Combo"("restaurantId");
CREATE INDEX "Combo_merchantId_idx" ON "Combo"("merchantId");
CREATE INDEX "ComboSlot_comboId_idx" ON "ComboSlot"("comboId");
CREATE UNIQUE INDEX "ComboSlotOption_slotId_menuItemId_key" ON "ComboSlotOption"("slotId", "menuItemId");
CREATE INDEX "ComboSlotOption_menuItemId_idx" ON "ComboSlotOption"("menuItemId");
CREATE INDEX "ComboSection_menuSectionId_idx" ON "ComboSection"("menuSectionId");

ALTER TABLE "Combo" ADD CONSTRAINT "Combo_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboSlot" ADD CONSTRAINT "ComboSlot_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboSlotOption" ADD CONSTRAINT "ComboSlotOption_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ComboSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboSlotOption" ADD CONSTRAINT "ComboSlotOption_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComboSection" ADD CONSTRAINT "ComboSection_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboSection" ADD CONSTRAINT "ComboSection_menuSectionId_fkey" FOREIGN KEY ("menuSectionId") REFERENCES "MenuSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
