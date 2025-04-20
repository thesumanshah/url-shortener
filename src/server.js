require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const dns = require('dns');
const { MongoClient } = require('mongodb');
const { nanoid } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 4100;
const MONGO_URI = process.env.DATABASE;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// URL shortening logic
const shortenURL = (db, url) => {
  const collection = db.collection('shortenedURLs');
  return collection.findOneAndUpdate(
    { original_url: url },
    {
      $setOnInsert: {
        original_url: url,
        short_id: nanoid(7),
      },
    },
    {
      returnOriginal: false,
      upsert: true,
    }
  );
};

const checkIfShortIdExists = (db, code) => {
  return db.collection('shortenedURLs').findOne({ short_id: code });
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/new', (req, res) => {
  let originalUrl;
  try {
    originalUrl = new URL(req.body.url);
  } catch (err) {
    return res.status(400).json({ error: 'invalid URL' });
  }

  dns.lookup(originalUrl.hostname, (err) => {
    if (err) {
      return res.status(404).json({ error: 'Address not found' });
    }

    const db = req.app.locals.db;
    shortenURL(db, originalUrl.href)
      .then(result => {
        const doc = result.value;
        res.json({
          original_url: doc.original_url,
          short_id: doc.short_id,
        });
      })
      .catch(err => {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
      });
  });
});

app.get('/:short_id', (req, res) => {
  const db = req.app.locals.db;
  const shortId = req.params.short_id;

  checkIfShortIdExists(db, shortId)
    .then(doc => {
      if (!doc) {
        return res.status(404).send('Uh oh. We could not find a link at that URL');
      }
      res.redirect(doc.original_url);
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('Server error');
    });
});

// Start server after DB connection
async function startServer() {
  try {
    const client = await MongoClient.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Set the database in app locals
    app.locals.db = client.db('shortener');

    const server = app.listen(PORT, () => {
      console.log(`🚀 Express running → PORT ${server.address().port}`);
    });
  } catch (err) {
    console.error('❌ Failed to connect to the database', err);
    process.exit(1);
  }
}

startServer();
