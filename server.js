const express = require('express');
// const cors = require('cors');
const app = express();
const port = 3000;

// app.use(cors());

app.get('/hello', (req, res) => {
    res.json({ text: 'Hello World vom Backend!' });
});

app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
});