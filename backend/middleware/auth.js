const jwt = require('jsonwebtoken');
const sql = require('mssql/msnodesqlv8');

let ensureIsActiveColumnPromise = null;

const ensureIsActiveColumn = pool => {
    if (!ensureIsActiveColumnPromise) {
        ensureIsActiveColumnPromise = pool.request().query(`
            IF NOT EXISTS (
                SELECT 1
                FROM sys.columns
                WHERE object_id = OBJECT_ID('Users')
                AND name = 'IsActive'
            )
            BEGIN
                ALTER TABLE Users ADD IsActive BIT NOT NULL DEFAULT 1
            END
        `).catch(err => {
            ensureIsActiveColumnPromise = null;
            throw err;
        });
    }

    return ensureIsActiveColumnPromise;
};

module.exports = async (req, res, next) => {
    // Look for the token in the 'Authorization' header
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    // Usually, tokens are sent as "Bearer <token>"
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SECRET_KEY';
    let verified;

    try {
        verified = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        res.status(401).json({ error: "Invalid or expired session" });
        return;
    }

    try {
        // Verify user is still active in the database
        if (req.pool) {
            await ensureIsActiveColumn(req.pool);

            const result = await req.pool.request()
                .input('uid', sql.Int, verified.id)
                .query('SELECT IsActive FROM Users WHERE UserId = @uid');
            
            if (result.recordset.length === 0) {
                return res.status(401).json({ error: "User account no longer exists." });
            }

            if (result.recordset[0].IsActive === false || result.recordset[0].IsActive === 0) {
                return res.status(401).json({ error: "Your account has been suspended." });
            }
        }

        req.user = verified; // This adds the user ID and Role to the request
        next();
    } catch (err) {
        console.error("Auth account status check error:", err.message);
        res.status(500).json({ error: "Unable to verify account status" });
    }
};