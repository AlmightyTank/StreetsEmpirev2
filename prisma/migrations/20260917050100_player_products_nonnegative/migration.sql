-- 0.4.0-A. Product stock can never go negative, whatever the code does.
ALTER TABLE "PlayerProduct" ADD CONSTRAINT "PlayerProduct_quantity_nonnegative" CHECK ("quantity" >= 0);
