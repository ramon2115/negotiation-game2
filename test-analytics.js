import { persistence } from './src/persistence.js';
import { GameAnalytics } from './src/analytics.js';

async function testAnalytics() {
    try {
        console.log('🔄 Testing deal analytics...');
        
        await persistence.initialize();
        
        // Get deal statistics
        const stats = await GameAnalytics.getDealStats();
        console.log('📊 Deal Statistics:', stats);
        
        // Get deals with duration
        const deals = await GameAnalytics.getDealsWithDuration();
        console.log('📋 Deals with Duration:');
        deals.forEach((deal, i) => {
            console.log(`   ${i + 1}. $${deal.price} - ${deal.duration_formatted} (${deal.user_a_name} vs ${deal.user_b_name})`);
        });
        
        // Get negotiation patterns
        const patterns = await GameAnalytics.getNegotiationPatterns();
        console.log('🎯 Negotiation Patterns:');
        patterns.forEach(pattern => {
            console.log(`   ${pattern.product_name}: ${pattern.success_rate}% success, avg: ${pattern.avg_deal_duration_formatted || 'N/A'}`);
        });
        
        await persistence.close();
        console.log('✅ Analytics test completed!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Analytics test failed:', error);
        process.exit(1);
    }
}

testAnalytics();
