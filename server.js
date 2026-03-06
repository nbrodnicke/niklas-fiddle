const express = require('express');
//const cors = require('cors');
const { Pool } = require('pg');
const app = express();
const port = 3000;

//app.use(cors());
app.use(express.json());

const dbPassword = process.env.password;

const pool = new Pool({
  connectionString: `postgres://app:${dbPassword}@ms-postgres-v1-1333825-landscape-1413831-pg.ms-postgres:5432/app`,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS usage_mins (
	  team_id INTEGER,
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      usage_minutes NUMERIC
    );
  `;
  
  try {
    await pool.query(createTableQuery);
    console.log("Tabelle 'usage_mins' ist bereit!");
  } catch (err) {
    console.error("Fehler beim Erstellen der Tabelle:", err);
  }
}

initDb();

app.get('/hello', (req, res) => {
    res.json({ text: 'Hello World vom Backend!' });
});

app.post('/calculate-usage', async (req, res) => {
    const { apiToken, teamId, startDate, endDate } = req.body;
    console.log('Anfrage für Team:', teamId, 'Von:', startDate, 'Bis:', endDate);

    if (!apiToken || !teamId || !startDate || !endDate) {
        return res.status(400).json({ error: 'Fehlende Parameter' });
    }

    try {
        const checkQuery = `
            SELECT usage_minutes 
            FROM usage_mins
            WHERE team_id = $1 AND start_date = $2 AND end_date = $3
        `;
        const { rows } = await pool.query(checkQuery, [teamId, startDate, endDate]);

        if (rows.length > 0) {
            console.log("Ergebnis in Datenbank gefunden! Lade aus Cache...");
            return res.json({ 
                cpuMinutes: rows[0].usage_minutes,
                teamId: teamId,
                cached: true
            });
        }

        console.log("Keinen Cache gefunden. Berechne Daten neu...");
        const limit = 99;
        let result = 0;
        let offset = 0;
        let itemsToCheck = 1;

        while (offset < itemsToCheck) {
            const url = `https://master-dev.dev.codesphere.com/api/usage/teams/${teamId}/resources/landscape-service/summary?beginDate=${startDate}&endDate=${endDate}&limit=${limit}&offset=${offset}`;

            const response = await fetch(url, {
                headers: { 
                    'accept': 'application/json', 
                    'Authorization': `Bearer ${apiToken}` 
                }
            });

            if (!response.ok) {
                return res.status(response.status).json({ error: 'Fehler bei der Codesphere API' });
            }

            const data = await response.json();
            
            if (!data.totalItems) break;

            itemsToCheck = Number(data.totalItems);
            const intermediateResult = data.summary.reduce((acc, s) => acc + Number(s.usageSeconds), 0);
            result += intermediateResult;
            offset += limit;
        }

        const cpuMinutes = (result / 60).toFixed(1);

        const insertQuery = `
            INSERT INTO usage_mins (team_id, start_date, end_date, usage_minutes) 
            VALUES ($1, $2, $3, $4)
        `;
        await pool.query(insertQuery, [teamId, startDate, endDate, cpuMinutes]);
        console.log("Neues Ergebnis in der Datenbank gespeichert.");

        res.json({ 
            cpuMinutes: cpuMinutes,
            teamId: teamId,
            cached: false
        });

    } catch (error) {
        console.error("Backend Fehler:", error);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
});