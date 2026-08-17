import { query } from '../db/client.js';

export const getHealth = async (req, res) => {
  try {
    const dbResult = await query('SELECT 1 as alive;');
    const isDbConnected = dbResult.rows[0]?.alive === 1;

    res.status(200).json({
      status: 'ok',
      message: 'WebMind API is running',
      database: isDbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'degraded',
      message: 'WebMind API is running, but database connection failed',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

