import { persistence } from './src/persistence.js';
import { GameAnalytics } from './src/analytics.js';

async function testQuickDeal() {
    try {
        console.log('🔄 Testing quick deal timing...');
        
        await persistence.initialize();
        await persistence.ensureRoom('quick-test');
        
        // Create pair with current timestamp
        const pair = {
            id: 'test-quick-pair',
            startedAt: new Date().toISOString(),
            userA: { id: 'user1' },
            userB: { id: 'user2' }
        };
        
        // Wait 3 seconds to simulate negotiation
        console.log('⏳ Simulating 3-second negotiation...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Create deal data
        const dealData = GameAnalytics.createDealData(pair, 150);
        console.log('📊 Deal Data:', dealData);
        
        // Test duration formatting
        console.log('⏱️  Duration Examples:');
        console.log(`   30 seconds: ${GameAnalytics.formatDuration(30)}`);
        console.log(`   90 seconds: ${GameAnalytics.formatDuration(90)}`);
        console.log(`   3665 seconds: ${GameAnalytics.formatDuration(3665)}`);
        
        await persistence.close();
        console.log('✅ Quick deal test completed!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Quick deal test failed:', error);
        process.exit(1);
    }
}

testQuickDeal();
