const express = require('express');
const mysql = require('mysql2');

const app = express();
app.use(express.json()); // Allows us to read JSON in requests

// Region 1 (item data)
const dbRegion1 = mysql.createPool({
  host: 'yamabiko.proxy.rlwy.net',
  user: 'root',
  password: 'KgweKTgBGTEPnCcfXeDHWWFCfUyFzgWJ',
  database: 'region_1',
  port: 31329
});

// Region 2 (item data)
const dbRegion2 = mysql.createPool({
  host: 'nozomi.proxy.rlwy.net',
  user: 'root',
  password: 'oXgWHuDdAWsrYqixVirtgYVJOyCyxmT',
  database: 'region_2',
  port: 35771
});


// Metro (user/account database)
const dbMetro = mysql.createPool({
  host: 'metro.proxy.rlwy.net',
  user: 'root',
  password: 'MOVJGMFzfkGkMdSyjRdkmTFTbHiWwRBv',
  database: 'railway',
  port: 16791
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
