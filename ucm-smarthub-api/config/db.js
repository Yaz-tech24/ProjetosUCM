const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Teste rápido para ver se conectou quando o arquivo for chamado
pool.getConnection()
    .then(connection => {
        console.log('✅ Conectado ao banco de dados MySQL (ucm_smarthub) com sucesso!');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Erro ao conectar ao MySQL:', err.message);
    });

module.exports = pool;