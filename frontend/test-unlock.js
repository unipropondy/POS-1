const http = require('http');

const tableId = "9234C3CA-8491-4792-9562-9B5B9318C9C2";
const body = JSON.stringify({
  tableId: tableId
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/tables/unlock-persistent',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('BODY:', data);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

console.log('Unlocking table:', tableId);
req.write(body);
req.end();
