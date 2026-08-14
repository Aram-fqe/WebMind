import express from 'express';
import healthRoutes from './routes/health.js';

const app = express();

app.use(express.json());

// Routes
app.use('/', healthRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

export default app;
