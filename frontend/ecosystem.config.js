module.exports = {
  apps: [
    {
      name: "vector-loader",
      script: "npm",
      args: "run start",
      env: {
        HOST: "0.0.0.0",
        PORT: 8089,
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "http://34.41.241.77:8073"
      }
    }
  ]
};