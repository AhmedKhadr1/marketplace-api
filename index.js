const express = require('express');
const mysql = require('mysql2');

const app = express();

app.use(express.json());

// Add CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static files from the project root
app.use(express.static('.'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'show_result.html'));
});

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
  const { name, category, min_price, max_price, store_name, rating, sort, order, page = 1, item_id } = req.query;
  const itemsPerPage = 15;
  const offset = (page - 1) * itemsPerPage;

  const filters = [];
  const params = [];

  // Add specific item filter
  if (item_id) {
    filters.push("f.item_id = ?");
    params.push(item_id);
  }

  // Build WHERE conditions
  if (name) {
    filters.push("LOWER(f.name) LIKE ?");
    params.push(`%${name.toLowerCase()}%`);
  }
  if (category) {
    filters.push("LOWER(c.main_cat_name) = LOWER(?)");
    params.push(category);
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
  
  // Add ORDER BY clause based on sort parameter
  let orderByClause = '';
  if (sort) {
    switch(sort) {
      case 'price_asc':
        orderByClause = 'ORDER BY IFNULL(i.discount_price, f.actual_price) ASC';
        break;
      case 'price_desc':
        orderByClause = 'ORDER BY IFNULL(i.discount_price, f.actual_price) DESC';
        break;
      case 'rating':
        orderByClause = 'ORDER BY f.rating DESC';
        break;
    }
  }

  const query = `
    SELECT 
      f.item_id,
      f.name AS item_name,
      f.actual_price,
      i.discount_price,
      f.rating AS item_rating,
      s.store_name,
      s.rating AS seller_rating,
      c.main_cat_name AS category_name,
      f.image,
      f.stock_quantity,
      i.tax_rate,
      i.warranty_period
    FROM item_freq f
    JOIN item_infreq i ON f.item_id = i.item_id
    JOIN category c ON i.category_id = c.category_id
    JOIN seller s ON i.seller_id = s.seller_id
    ${filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : ''}
    ${!item_id ? orderByClause : ''}
  `;

  // Add pagination to query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM item_freq f
    JOIN item_infreq i ON f.item_id = i.item_id
    JOIN category c ON i.category_id = c.category_id
    JOIN seller s ON i.seller_id = s.seller_id
    ${whereClause}
  `;

  // Add a query to get all categories
  const categoryQuery = `
    SELECT DISTINCT c.main_cat_name
    FROM category c
    JOIN item_infreq i ON c.category_id = i.category_id
    ORDER BY c.main_cat_name;
  `;

  // Execute all queries
  db.query(categoryQuery, (err, categoryResults) => {
    if (err) {
      console.error("❌ Category query error:", err);
      return res.status(500).json({ error: err.message });
    }

    db.query(countQuery, params, (err, countResult) => {
      if (err) {
        console.error("❌ Count query error:", err);
        return res.status(500).json({ error: err.message });
      }

      const totalItems = countResult[0].total;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      db.query(`${query} LIMIT ${itemsPerPage} OFFSET ${offset}`, params, (err, results) => {
        if (err) {
          console.error("❌ Query error:", err);
          return res.status(500).json({ error: err.message });
        }

        const formatted = results.map(row => ({
          item_id: row.item_id,
          item_name: row.item_name,
          category: row.category_name,
          actual_price: parseFloat(row.actual_price),
          discount_price: row.discount_price ? parseFloat(row.discount_price) : null,
          item_rating: row.item_rating ? parseFloat(row.item_rating) : null,
          image: row.image,
          stock_quantity: row.stock_quantity,
          tax_rate: row.tax_rate,
          warranty_period: row.warranty_period,
          seller: {
            store_name: row.store_name,
            rating: row.seller_rating ? parseFloat(row.seller_rating) : null
          }
        }));

        res.json({
          items: formatted,
          categories: categoryResults.map(cat => cat.main_cat_name),
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems,
            itemsPerPage
          }
        });
      });
    });
  });
});

// Add new endpoint for price ranges
app.get('/items/price-range', (req, res) => {
  const { category } = req.query;
  
  let query = `
    SELECT 
      MIN(IFNULL(i.discount_price, f.actual_price)) as min_price,
      MAX(IFNULL(i.discount_price, f.actual_price)) as max_price
    FROM item_freq f
    JOIN item_infreq i ON f.item_id = i.item_id
    JOIN category c ON i.category_id = c.category_id
  `;

  if (category) {
    query += ` WHERE LOWER(c.main_cat_name) LIKE ?`;
  }

  db.query(query, category ? [`%${category.toLowerCase()}%`] : [], (err, results) => {
    if (err) {
      console.error("❌ Query error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results[0]);
  });
});

// Add new endpoint for related products
app.get('/items/related', (req, res) => {
  const { category, current_id } = req.query;
  
  const query = `
    SELECT 
      f.item_id,
      f.name AS item_name,
      f.actual_price,
      i.discount_price,
      f.rating AS item_rating,
      f.image,
      c.main_cat_name AS category_name
    FROM item_freq f
    JOIN item_infreq i ON f.item_id = i.item_id
    JOIN category c ON i.category_id = c.category_id
    WHERE c.main_cat_name = ? AND f.item_id != ?
    ORDER BY RAND()
    LIMIT 4
  `;

  db.query(query, [category, current_id], (err, results) => {
    if (err) {
      console.error("❌ Related products query error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.get('/debug/all-tables', (req, res) => {
  db.query('SHOW TABLES', (err, tables) => {
    if (err) {
      console.error('❌ Error getting tables:', err);
      return res.status(500).json({ error: 'Failed to fetch tables' });
    }

    const tableNames = tables.map(row => Object.values(row)[0]);
    const result = {};
    let completed = 0;

    tableNames.forEach(table => {
      db.query(`SELECT * FROM \`${table}\` LIMIT 100`, (err, rows) => {
        if (err) {
          result[table] = { error: err.message };
        } else {
          result[table] = rows;
        }

        completed++;
        if (completed === tableNames.length) {
          res.json(result);
        }
      });
    });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
