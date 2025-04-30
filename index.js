const express = require('express');
const mysql = require('mysql2');

const app = express();

app.use(express.json());

// Debug: Log ENV info
console.log("✅ Application started");

const db = mysql.createConnection( {
  'host': 'metro.proxy.rlwy.net',
  'port': 16791,
  'user': 'root',
  'password': 'MOVJGMFzfkGkMdSyjRdkmTFTbHiWwRBv',
  'database': 'railway'
      
      });

// Final unified item search
app.get('/items/search', (req, res) => {
  const { name, category, min_price, max_price, store_name, rating } = req.query;

  const filters = [];
  const params = [];

  // Build WHERE conditions
  if (name) {
    filters.push("LOWER(f.name) LIKE ?");
    params.push(`%${name.toLowerCase()}%`);
  }
  if (category) {
    filters.push("LOWER(c.main_cat_name) LIKE ?");
    params.push(`%${category.toLowerCase()}%`);
  }
  if (min_price) {
    filters.push("IFNULL(i.discount_price, f.actual_price) >= ?");
    params.push(min_price);
  }
  if (max_price) {
    filters.push("IFNULL(i.discount_price, f.actual_price) <= ?");
    params.push(max_price);
  }
  if (store_name) {
    filters.push("LOWER(s.store_name) LIKE ?");
    params.push(`%${store_name.toLowerCase()}%`);
  }
  if (rating) {
    filters.push("f.rating >= ?");
    params.push(rating);
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT 
      f.name AS item_name,
      f.actual_price,
      i.discount_price,
      f.rating AS item_rating,
      s.store_name,
      s.rating AS seller_rating,
      c.main_cat_name AS category_name,
      f.image
    FROM item_freq f
    JOIN item_infreq i ON f.item_id = i.item_id
    JOIN category c ON i.category_id = c.category_id
    JOIN seller s ON i.seller_id = s.seller_id
    ${whereClause}
  `;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("❌ Query error:", err);
      return res.status(500).json({ error: err.message });
    }
  
    const formatted = results.map(row => ({
      item_name: row.item_name,
      category: row.category_name,
      actual_price: parseFloat(row.actual_price),
      discount_price: row.discount_price ? parseFloat(row.discount_price) : null,
      item_rating: row.item_rating ? parseFloat(row.item_rating) : null,
      image: row.image,
      seller: {
        store_name: row.store_name,
        rating: row.seller_rating ? parseFloat(row.seller_rating) : null
      }
    }));
    
    
  
    res.setHeader('Content-Type', 'application/json');
res.send(JSON.stringify(formatted, null, 2));

  });
});

// Start the server
app.listen(3000, () => {
  console.log('✅ Server is running on http://localhost:3000');
});
