console.log('🔍 Testing Backend Connection...');
console.log('Port: 5000');
console.log('URL: http://localhost:5000');

// Test basic server connectivity
fetch('http://localhost:5000/api/projects')
  .then(response => {
    console.log('✅ Backend is reachable!');
    console.log('Status:', response.status);
    return response.text();
  })
  .then(data => {
    console.log('Response:', data.substring(0, 200) + '...');
  })
  .catch(error => {
    console.error('❌ Backend connection failed:', error.message);
    console.log('Possible issues:');
    console.log('1. Backend server not running');
    console.log('2. Wrong port (should be 5000)');
    console.log('3. CORS issues');
  });