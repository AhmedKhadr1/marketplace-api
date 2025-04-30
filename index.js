const express = require('express');
const mysql = require('mysql2');

const app = express();
console.log('🧪 DB_HOST:', process.env.DB_HOST);
console.log('🧪 DB_USER:', process.env.DB_USER);
console.log('🧪 DB_PASS:', process.env.DB_PASS ? '✅ loaded' : '❌ missing');
console.log('🧪 DB_PORT:', process.env.DB_PORT);
console.log('🧪 DB_NAME:', process.env.DB_NAME);

app.use(express.json()); // Allows us to read JSON in requests

const dbRegion1 = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT)
});

const dbRegion2 = mysql.createPool({
  host: process.env.DB_REGION2_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_REGION2_NAME,
  port: parseInt(process.env.DB_REGION2_PORT)
});

const dbShinkansen = mysql.createPool({
  host: process.env.DB_SHINKANSEN_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_SHINKANSEN_NAME,
  port: parseInt(process.env.DB_SHINKANSEN_PORT)
});

const dbMetro = mysql.createPool({
  host: process.env.DB_METRO_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_METRO_NAME,
  port: parseInt(process.env.DB_METRO_PORT)
});


// ----------------------------
// Function V - Search Items
// ----------------------------
app.get('/items/search', async (req, res) => {
  const { name, category, max_price, user_id } = req.query;

  const buildQuery = () => {
    let query = `
      SELECT i.item_id, i.name, i.actual_price, i.stock_quantity, i.category_id, i.seller_id
      FROM Item i
      WHERE i.stock_quantity > 0
    `;
    const params = [];

    if (name) {
      query += " AND i.name LIKE ?";
      params.push(`%${name}%`);
    }

    if (max_price) {
      query += " AND i.actual_price <= ?";
      params.push(max_price);
    }

    if (user_id) {
      query += " AND i.seller_id != ?";
      params.push(user_id);
    }

    return { query, params };
  };

  const { query, params } = buildQuery();

  const runQuery = (db) => {
    return new Promise((resolve, reject) => {
      db.query(query, params, (err, results) => {
        if (err) {
          console.error("❌ Query Error:", err);
          return reject(err);
        }
        resolve(results);
      });
    });
  };

  try {
    // Parallel querying across regions
    const [region1Items, region2Items] = await Promise.all([
      runQuery(dbRegion1),
      runQuery(dbRegion2)
    ]);

    let allItems = [...region1Items, ...region2Items];

    // If filtering by category, get matching category IDs from shinkansen DB
    if (category) {
      const categoryQuery = "SELECT category_id FROM Category WHERE Main_Cat_Name LIKE ?";
      const categoryParams = [`%${category}%`];

      const categoryResults = await new Promise((resolve, reject) => {
        dbShinkansen.query(categoryQuery, categoryParams, (err, results) => {
          if (err) {
            console.error("❌ Category Query Error:", err);
            return reject(err);
          }
          resolve(results.map(r => r.category_id));
        });
      });

      allItems = allItems.filter(item =>
        categoryResults.includes(item.category_id)
      );
    }

    res.json(allItems);
  } catch (err) {
    console.error("❌ FULL ERROR:", err.message);
    res.status(500).json({ error: err.message });
    
  }
});
app.get('/test', (req, res) => {
    res.send('✅ Test route is working!');
  });
  
// ----------------------------
// Start the server
// ----------------------------
app.listen(3000, () => {
  console.log('✅ Server is running on http://localhost:3000');
});
