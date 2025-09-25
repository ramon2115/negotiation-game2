import { persistence } from './src/persistence.js';

async function testDatabase() {
    try {
        console.log('🔄 Testing database connection...');
        
        await persistence.initialize();
        console.log('✅ Database initialized successfully');
        
        const config = await persistence.getGameConfig();
        console.log('✅ Game config loaded:', config ? 'Found' : 'Not found');
        
        await persistence.close();
        console.log('✅ Database connection closed');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
        process.exit(1);
    }
}

testDatabase();
