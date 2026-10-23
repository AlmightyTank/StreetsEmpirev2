-- Scratch cards and horse races use CasinoLedgerEntry receipts, so the former
-- reconnect-safe Street Dice state tables are no longer needed.
DROP TABLE IF EXISTS "CasinoStreetDiceAction";
DROP TABLE IF EXISTS "CasinoStreetDiceRound";
