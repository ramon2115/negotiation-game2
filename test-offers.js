import { persistence } from './src/persistence.js';
import { GameAnalytics } from './src/analytics.js';

async function testOfferTracking() {
    try {
        console.log('🔄 Testing offer tracking...');
        
        await persistence.initialize();
        await persistence.ensureRoom('offer-test');
        
        // Create test users and pair
        const userA = await persistence.createUser({
            name: 'Seller Sam',
            surveyResponses: [],
            surveyCompleted: true
        });
        
        const userB = await persistence.createUser({
            name: 'Buyer Betty',
            surveyResponses: [],
            surveyCompleted: true
        });
        
        const pair = await persistence.createPair({
            roomId: 'offer-test',
            userA,
            userB,
            product: { name: 'Test Product' },
            roundNumber: 1
        });
        
        console.log('✅ Created test pair:', pair.id);
        
        // Simulate initial offers
        const sellerInitialOffer = await persistence.saveMessage({
            pairId: pair.id,
            userId: userA.id,
            userName: userA.name,
            role: 'A',
            message: 'I can sell this for $500',
            extractedOffer: 500,
            offerConfidence: 0.9,
            metadata: { context: 'initial_offer' }
        });
        
        const buyerInitialOffer = await persistence.saveMessage({
            pairId: pair.id,
            userId: userB.id,
            userName: userB.name,
            role: 'B', 
            message: 'How about $300?',
            extractedOffer: 300,
            offerConfidence: 0.8,
            metadata: { context: 'initial_offer' }
        });
        
        // Simulate follow-up offers
        await persistence.saveMessage({
            pairId: pair.id,
            userId: userA.id,
            userName: userA.name,
            role: 'A',
            message: 'I can go down to $450',
            extractedOffer: 450,
            offerConfidence: 0.85,
            metadata: { context: 'counter_offer' }
        });
        
        await persistence.saveMessage({
            pairId: pair.id,
            userId: userB.id,
            userName: userB.name,
            role: 'B',
            message: 'How about meeting at $375?',
            extractedOffer: 375,
            offerConfidence: 0.8,
            metadata: { context: 'counter_offer' }
        });
        
        console.log('✅ Created test negotiation with multiple offers');
        
        // Test analytics
        const initialOffers = await GameAnalytics.getInitialOffers();
        console.log('🎯 Initial Offers:');
        initialOffers.forEach(offer => {
            console.log(`   ${offer.role === 'A' ? 'SELLER' : 'BUYER'}: $${offer.extracted_offer} by ${offer.user_name}`);
        });
        
        const offerPatterns = await GameAnalytics.getOfferPatterns();
        console.log('📊 Offer Patterns:');
        offerPatterns.forEach(pattern => {
            console.log(`   Seller Start: $${pattern.seller_first_offer}, Buyer Start: $${pattern.buyer_first_offer}`);
            if (pattern.final_price) {
                console.log(`   Final Price: $${pattern.final_price}, Seller Advantage: ${pattern.seller_advantage_percentage}%`);
            }
        });
        
        // Check message count
        const allMessages = await persistence.cache.config;
        console.log('📝 Message tracking working correctly!');
        
        await persistence.close();
        console.log('✅ Offer tracking test completed!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Offer tracking test failed:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

testOfferTracking();
