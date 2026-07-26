// E:/FishFarmingGuide/backend/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { poolPromise } = require('./config/db');

// 1. INITIALIZE APP
const app = express();

// 2. MIDDLEWARE
app.use(cors());
app.use(express.json());

// 3. DATABASE MIDDLEWARE
// Attaches the connection pool to every request so routes can use req.pool
app.use(async (req, res, next) => {
    try {
        req.pool = await poolPromise;
        next();
    } catch (err) {
        console.error("Database connection middleware error:", err);
        res.status(500).json({ error: "Internal Server Error: Database Connection Failed" });
    }
});

// 4. IMPORT ROUTE FILES
const authRoutes = require('./routes/authRoutes');
const speciesRoutes = require('./routes/speciesRoutes');
const regionsRoute = require('./routes/regionsRoute');
const pondRoutes = require('./routes/pondRoutes');
const stockingRoutes = require('./routes/stockingRoutes'); // Updated to use the new route file
const waterQualityRoutes = require('./routes/waterQualityRoutes'); // <--- ADD THIS
const fertilizersRoute = require('./routes/fertilizersRoute');
const feedRoutes = require('./routes/feedRoutes'); // <--- 1. ADD THIS IMPORT
const expenseRoutes = require('./routes/expenseRoutes'); // 1. Import your new routes
const harvestRoutes = require('./routes/harvestRoutes'); // 1. Import the new Harvest Routes
const inventoryRoutes = require('./routes/inventoryRoutes');
const farmRoutes = require('./routes/farmRoutes');
const mortalityRoutes = require('./routes/mortalityRoutes');
const liveActivityRoutes = require('./routes/liveActivityRoutes');
const infoRoutes = require('./routes/infoRoutes');
const marketplaceRoutes = require('./routes/marketplaceRoutes');
const taskRoutes = require('./routes/taskRoutes');
const diseaseRoutes = require('./routes/diseaseRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
// 5. REGISTER ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/species', speciesRoutes);
app.use('/api/regions', regionsRoute);
app.use('/api/ponds', pondRoutes);
app.use('/api/stocking', stockingRoutes); // Endpoint updated to /api/stocking
app.use('/api/water-quality', waterQualityRoutes); // <--- ADD THIS
app.use('/api/fertilizers', fertilizersRoute);
app.use('/api/feed', feedRoutes); // <--- 2. REGISTER THE FEED ROUTE
app.use('/api/expenses', expenseRoutes); // 2. Register the expense endpoint
app.use('/api/harvest', harvestRoutes); // 2. Register the Harvest endpoint
app.use('/api/inventory', inventoryRoutes);
app.use('/api/farm', farmRoutes);
app.use('/api/mortality', mortalityRoutes);
app.use('/api/activity', liveActivityRoutes);
app.use('/api/info', infoRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/diseases', diseaseRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/notifications', notificationRoutes);
// 6. HEALTH CHECK & TEST ROUTES
app.get('/test', (req, res) => res.status(200).send("Server is working!"));
app.get('/', (req, res) => res.status(200).send('Fish Farming API is running...'));

// 7. GLOBAL ERROR HANDLER
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({
            error: "Something went wrong!",
            message: err.message
        });
    });

// 8. START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`✅ Table "Stocking" is active at /api/stocking`);
    console.log(`-----------------------------------------`);
});