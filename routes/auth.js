const express = require('express');
const router = express.Router();
const db = require('../db/connection');

router.get('/', (req, res) => {
  res.send('PharmaSeek is running!');
});

module.exports = router;