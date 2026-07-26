-- Adds species mix and applicable size fields to StockingRules.
-- Run once against the FishFarm database.

IF COL_LENGTH('StockingRules', 'SpeciesMix') IS NULL
BEGIN
    ALTER TABLE StockingRules ADD SpeciesMix NVARCHAR(MAX) NULL;
END

IF COL_LENGTH('StockingRules', 'MinFishSizeInches') IS NULL
BEGIN
    ALTER TABLE StockingRules ADD MinFishSizeInches DECIMAL(4, 2) NULL;
END

IF COL_LENGTH('StockingRules', 'MaxFishSizeInches') IS NULL
BEGIN
    ALTER TABLE StockingRules ADD MaxFishSizeInches DECIMAL(4, 2) NULL;
END

IF COL_LENGTH('StockingRules', 'MinPondSizeAcres') IS NULL
BEGIN
    ALTER TABLE StockingRules ADD MinPondSizeAcres DECIMAL(6, 2) NULL;
END

IF COL_LENGTH('StockingRules', 'MaxPondSizeAcres') IS NULL
BEGIN
    ALTER TABLE StockingRules ADD MaxPondSizeAcres DECIMAL(6, 2) NULL;
END
