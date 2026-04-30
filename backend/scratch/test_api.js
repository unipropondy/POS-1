const http = require('http');

const url = 'http://localhost:3000/api/sales/day-end-summary?startDate=2026-04-29&endDate=2026-04-30';
console.log('Testing URL:', url);

http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    try {
      console.log('Response Data:', JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log('Raw Data:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
