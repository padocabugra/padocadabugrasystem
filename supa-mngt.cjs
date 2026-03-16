const fs = require('fs');
const http = require('https');

const token = process.argv[2];
const projectId = process.argv[3];

if (!token || !projectId) {
  console.log("Provide token and project id");
  process.exit(1);
}

const req = http.request({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${projectId}/database/tables`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log("Supabase Project Info retrieved successfully (Tables):");
      const tables = JSON.parse(data);
      console.log(`Total tables found: ${tables.length}`);
      const publicTables = tables.filter(t => t.schema === 'public');
      console.log(`Public tables: ${ सार्वजनिक = publicTables.map(t => t.name).join(', ')}`);
    } else {
      console.log(`HTTP Status: ${res.statusCode}`);
      console.log(data);
    }
  });
});

req.on('error', (err) => console.error(err));
req.end();
