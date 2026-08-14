export const getHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'WebMind API is running',
    timestamp: new Date().toISOString()
  });
};
