const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

// Tecto de ligações simultâneas à BD por instância da API. Dimensionado para
// ~100 utilizadores activos em simultâneo numa VPS típica de 2 vCPU (nem
// todos batem na BD no mesmo instante exacto, mas o pool tem de aguentar
// picos sem enfileirar pedidos atrás de só 10 ligações). Fica bem abaixo do
// max_connections por omissão do MySQL (151) — ajustável sem tocar no
// código via DB_CONNECTION_LIMIT (suba se o servidor de BD tiver mais
// CPU/RAM do que 2 vCPU).
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 20,
    queueLimit: 0
});

// Teste rápido para ver se conectou quando o arquivo for chamado
pool.getConnection()
    .then(connection => {
        console.log(`✅ Conectado ao banco de dados MySQL (${process.env.DB_NAME}) com sucesso!`);
        connection.release();
    })
    .catch(err => {
        console.error('❌ Erro ao conectar ao MySQL:', err.message);
    });

module.exports = pool;