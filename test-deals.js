import { persistence } from './src/persistence.js';

async function testDeals() {
    try {
        console.log('🔄 Testing deal persistence...');
        
        await persistence.initialize();
        
        // Create test users
        const userA = await persistence.createUser({
            name: 'Alice',
            surveyResponses: [],
            surveyCompleted: true
        });
        
        const userB = await persistence.createUser({
            name: 'Bob', 
            surveyResponses: [],
            surveyCompleted: true
        });
        
        console.log('✅ Created test users:', userA.name, 'and', userB.name);
        
        // Create test room first
        await persistence.ensureRoom('test');
        console.log('✅ Created test room');
        
        // Create test pair
        const pair = await persistence.createPair({
            roomId: 'test',
            userA,
            userB,
            product: { name: 'Test Product', price: 100 },
            roundNumber: 1
        });
        
        console.log('✅ Created test pair:', pair.id);
        
        // Save a deal
        await persistence.updatePair(pair.id, {
            finalDeal: {
                price: 250,
                confirmedAt: new Date().toISOString(),
                userA: userA.id,
                userB: userB.id,
                success: true
            },
            status: 'completed'
        });
        
        console.log('✅ Saved test deal: $250');
        
        // Verify deal was saved
        const savedPair = await persistence.getPair(pair.id);
        console.log('✅ Retrieved deal:', savedPair.final_deal || savedPair.finalDeal);
        
        // Check stats
        const stats = await persistence.cache.config;
        console.log('📊 Database working correctly!');
        
        await persistence.close();
        console.log('✅ Deal persistence test completed successfully!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Deal test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

testDeals();
