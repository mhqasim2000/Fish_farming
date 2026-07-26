const express = require('express');
const router = express.Router();
const { sql } = require('../config/db');
const auth = require('../middleware/auth');

router.get('/feed', auth, async (req, res) => {
       try {
              // This 'id' comes from your JWT token (currently 22)
              const loggedInUserId = req.user.id;
              const pool = req.pool;

              const result = await pool.request()
                     .input('activeUser', sql.Int, loggedInUserId)
                     .query(`
            -- DEFAULT: Fetch top 20 latest activities to save bandwidth
            -- PANEL REQUEST: If panel wants to see all history, delete "TOP 20" below
            SELECT 
                Category, 
                Description, 
                ActivityTime,
                CASE 
                    WHEN DATEDIFF(SECOND, ActivityTime, GETDATE()) < 60 THEN 'Just now'
                    WHEN DATEDIFF(MINUTE, ActivityTime, GETDATE()) < 60 THEN CAST(DATEDIFF(MINUTE, ActivityTime, GETDATE()) AS VARCHAR) + ' mins ago'
                    WHEN DATEDIFF(HOUR, ActivityTime, GETDATE()) < 24 THEN CAST(DATEDIFF(HOUR, ActivityTime, GETDATE()) AS VARCHAR) + ' hrs ago'
                    ELSE CAST(DATEDIFF(DAY, ActivityTime, GETDATE()) AS VARCHAR) + ' days ago'
                END AS RelativeTime
            FROM (
                -- 1. YOUR SETUP: Only shows setup for the logged-in UserId
                SELECT 'System' as Category, 
                       'Farm setup completed: ' + FarmName as Description, 
                       CreatedAt as ActivityTime,
                       UserId
                FROM Users
                WHERE UserId = @activeUser

                UNION ALL

                -- 2. YOUR PONDS: Only shows ponds created by the logged-in UserId
                SELECT 'System' as Category, 
                       'New pond created: ' + PondName as Description, 
                       CreatedAt as ActivityTime,
                       UserId
                FROM Ponds 
                WHERE UserId = @activeUser

                UNION ALL

                -- 3. YOUR MORTALITY: Joins with Ponds to verify owner is @activeUser
                SELECT 'Mortality' as Category, 
                       CAST(M.Quantity_dead as VARCHAR) + ' fish loss in ' + P.PondName as Description, 
                       M.LogDate as ActivityTime,
                       P.UserId
                FROM Mortality_Logs M 
                INNER JOIN Ponds P ON M.PondId = P.PondId 
                WHERE P.UserId = @activeUser

                UNION ALL

                -- 4. YOUR FEEDING: Joins with Ponds to verify owner is @activeUser
                SELECT 'Feeding' as Category, 
                       CAST(FL.Quantity_kg as VARCHAR) + 'kg feed added to ' + P.PondName as Description, 
                       FL.FeedDate as ActivityTime,
                       P.UserId
                FROM Feed_Logs FL 
                INNER JOIN Ponds P ON FL.PondId = P.PondId 
                WHERE P.UserId = @activeUser

                UNION ALL

                -- 5. STOCKING
                SELECT 'Stocking' as Category,
                       'Pond ' + P.PondName + ' stocked with ' + CAST(S.Quantity as VARCHAR) + ' ' + SP.Name as Description,
                       S.StockingDate as ActivityTime,
                       P.UserId
                FROM Stocking S
                INNER JOIN Ponds P ON S.CurrentPondId = P.PondId
                INNER JOIN Species SP ON S.SpeciesId = SP.SpeciesID
                WHERE P.UserId = @activeUser

                UNION ALL

                -- 6. HARVEST
                SELECT 'Harvest' as Category,
                       CAST(H.Quantity_pieces as VARCHAR) + ' ' + SP.Name + ' harvested from ' + P.PondName as Description,
                       H.HarvestDate as ActivityTime,
                       P.UserId
                FROM Harvest_Logs H
                INNER JOIN Ponds P ON H.PondId = P.PondId
                INNER JOIN Species SP ON H.SpeciesId = SP.SpeciesID
                WHERE P.UserId = @activeUser

                UNION ALL

                -- 7. EXPENSES
                SELECT 'Expense' as Category,
                       E.Category + ' expense: ' + CAST(E.Amount as VARCHAR) + CASE WHEN P.PondName IS NOT NULL THEN ' for ' + P.PondName ELSE ' (General)' END as Description,
                       E.ExpenseDate as ActivityTime,
                       E.UserId
                FROM Expense_log E
                LEFT JOIN Ponds P ON E.PondId = P.PondId
                WHERE E.UserId = @activeUser

                UNION ALL

                -- 8. FERTILIZERS
                SELECT 'Fertilizer' as Category,
                       CAST(QuantityApplied as VARCHAR) + 'kg ' + ProductName + ' applied to ' + P.PondName as Description,
                       ApplicationDate as ActivityTime,
                       P.UserId
                FROM Fertilizers_Logs FL
                INNER JOIN Ponds P ON FL.PondId = P.PondId
                WHERE P.UserId = @activeUser

                UNION ALL

                -- 9. WATER QUALITY
                SELECT 'Water Quality' as Category,
                       'Water check recorded for ' + P.PondName as Description,
                       recorded_at as ActivityTime,
                       P.UserId
                FROM water_quality_logs W
                INNER JOIN Ponds P ON W.PondId = P.PondId
                WHERE P.UserId = @activeUser

                UNION ALL

                -- 10. GROWTH UPDATES
                SELECT 'Growth Update' as Category,
                       'Updated ' + SP.Name + ' size to ' + CAST(S.CurrentSizeInches AS VARCHAR) + ' inches in ' + P.PondName as Description,
                       S.LastSizeUpdateDate as ActivityTime,
                       P.UserId
                FROM Stocking S
                INNER JOIN Ponds P ON S.CurrentPondId = P.PondId
                INNER JOIN Species SP ON S.SpeciesId = SP.SpeciesId
                WHERE P.UserId = @activeUser AND S.LastSizeUpdateDate IS NOT NULL

                UNION ALL

                -- 11. TRANSFERS
                SELECT 'Transfer' as Category,
                       'Transferred ' + SP.Name + ' to ' + P.PondName as Description,
                       S.TransferDate as ActivityTime,
                       P.UserId
                FROM Stocking S
                INNER JOIN Ponds P ON S.CurrentPondId = P.PondId
                INNER JOIN Species SP ON S.SpeciesId = SP.SpeciesId
                WHERE P.UserId = @activeUser AND S.TransferDate IS NOT NULL

                UNION ALL

                -- 12. SALES
                SELECT 'Marketplace' as Category,
                       'Listed ' + CAST(S.QuantityForSale AS VARCHAR) + ' ' + SP.Name + ' for sale' as Description,
                       S.SaleDate as ActivityTime,
                       P.UserId
                FROM Stocking S
                INNER JOIN Ponds P ON S.CurrentPondId = P.PondId
                INNER JOIN Species SP ON S.SpeciesId = SP.SpeciesId
                WHERE P.UserId = @activeUser AND S.SaleDate IS NOT NULL

                UNION ALL

                -- 13. DISEASE OUTBREAKS
                SELECT 'Disease Alert' as Category,
                       'Outbreak detected in ' + P.PondName + ': ' + ISNULL(DC.DiseaseName, D.CustomDiseaseName) + ' (' + D.Severity + ' severity)' as Description,
                       D.NotedAt as ActivityTime,
                       D.UserId
                FROM Disease_Outbreaks D
                INNER JOIN Ponds P ON D.PondId = P.PondId
                LEFT JOIN Disease_Catalog DC ON D.DiseaseId = DC.DiseaseId
                WHERE D.UserId = @activeUser

                UNION ALL

                -- 14. TREATMENTS
                SELECT 'Treatment' as Category,
                       'Applied ' + T.TreatmentType + ' for ' + ISNULL(DC.DiseaseName, D.CustomDiseaseName) + ' in ' + P.PondName as Description,
                       T.AppliedAt as ActivityTime,
                       T.UserId
                FROM Treatment_Logs T
                INNER JOIN Disease_Outbreaks D ON T.OutbreakId = D.OutbreakId
                INNER JOIN Ponds P ON D.PondId = P.PondId
                LEFT JOIN Disease_Catalog DC ON D.DiseaseId = DC.DiseaseId
                WHERE T.UserId = @activeUser

                UNION ALL

                -- 15. FEED STOCK PURCHASES
                SELECT 'Stock Purchase' as Category,
                       'Purchased ' + CAST(InitialQuantity_kg AS VARCHAR) + 'kg of ' + FeedType + ' feed stock' as Description,
                       PurchaseDate as ActivityTime,
                       UserId
                FROM Feed_Stock
                WHERE UserId = @activeUser

                UNION ALL

                -- 16. FERTILIZER STOCK PURCHASES
                SELECT 'Stock Purchase' as Category,
                       'Purchased ' + CAST(InitialQuantity_kg AS VARCHAR) + 'kg of ' + ProductName + ' (' + Category + ') fertilizer' as Description,
                       PurchaseDate as ActivityTime,
                       UserId
                FROM Fertilizer_Stock
                WHERE UserId = @activeUser

                UNION ALL

                -- 17. TREATMENT STOCK PURCHASES
                SELECT 'Stock Purchase' as Category,
                       'Purchased ' + CAST(InitialQuantity AS VARCHAR) + ' ' + ISNULL(Unit, 'units') + ' of ' + MedicineName + ' medicine' as Description,
                       PurchaseDate as ActivityTime,
                       UserId
                FROM Treatment_Stock
                WHERE UserId = @activeUser
            ) AS AllMyActivities
            ORDER BY ActivityTime ASC
        `);

              // If you see [], it means UserId 22 has no data in the tables yet
              res.json(result.recordset);

       } catch (err) {
              console.error("Feed Error:", err.message);
              res.status(500).json({ error: "Failed to fetch your specific activity feed." });
       }
});

module.exports = router;