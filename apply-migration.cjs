// Aplica uma migration SQL no Supabase (transaction pooler).
// Uso: node apply-migration.cjs migrations/022_senha_exclusao.sql
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const CONN = process.env.PADOCA_DB_URL
if (!CONN) { console.error('Defina PADOCA_DB_URL com a connection string do Supabase.'); process.exit(1) }

async function main() {
    const rel = process.argv[2]
    if (!rel) { console.error('Informe o arquivo da migration.'); process.exit(1) }
    const file = path.resolve(__dirname, rel)
    const sql = fs.readFileSync(file, 'utf8')

    const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } })
    await client.connect()
    try {
        await client.query(sql)
        console.log('OK: migration aplicada ->', rel)
    } catch (err) {
        console.error('ERRO ao aplicar:', err.message)
        process.exitCode = 1
    } finally {
        await client.end()
    }
}
main()
