// Test script for the relay server
// Run this to verify the server is working

const testServer = async () => {
    const BASE_URL = 'http://localhost:3000';
    const APP_SECRET = 'my-super-secret-app-key-67890';

    console.log('🧪 Testing Relay Server...\n');

    // Test 1: Health Check
    console.log('1️⃣ Testing health endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/health`);
        const data = await response.json();
        console.log('✅ Health check:', data);
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
    }

    // Test 2: Get State
    console.log('\n2️⃣ Testing state endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/api/state`);
        const data = await response.json();
        console.log('✅ Current state:', data);
    } catch (error) {
        console.error('❌ State check failed:', error.message);
    }

    // Test 3: Send Command (will fail if ESP32 not connected, which is expected)
    console.log('\n3️⃣ Testing command endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/api/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: APP_SECRET,
                action: 'OPEN',
                channel: 1
            })
        });
        const data = await response.json();

        if (response.status === 503) {
            console.log('⚠️  Command endpoint working, but ESP32 not connected (expected)');
        } else {
            console.log('✅ Command sent:', data);
        }
    } catch (error) {
        console.error('❌ Command failed:', error.message);
    }

    console.log('\n✨ Tests complete!\n');
    console.log('📝 Next steps:');
    console.log('   1. Update ESP32 firmware to connect to this server');
    console.log('   2. Build mobile app');
    console.log('   3. Deploy server to production (Render, Heroku, etc.)');
};

// Run tests
testServer();
