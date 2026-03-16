require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase keys in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Verificando Supabase:", supabaseUrl);
  
  const tablesToTest = [
    'produtos',
    'receitas',
    'pedidos',
    'itens_pedido',
    'clientes',
    'usuarios',
    'metas',
    'caixa',
    'movimentacao_estoque'
  ];

  const results = {};
  let allHealthy = true;

  for (const table of tablesToTest) {
    const { data, error } = await supabase.from(table).select('id').limit(1);
    if (error) {
       results[table] = { status: "ERROR", error: error.message };
       allHealthy = false;
    } else {
       results[table] = { status: "OK" };
    }
  }

  require('fs').writeFileSync('test-res.json', JSON.stringify(results, null, 2));
}

test();
