-- Red de seguridad: ningún lote puede quedar con existencia negativa.
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_quantity_no_negativa" CHECK ("quantity" >= 0);
