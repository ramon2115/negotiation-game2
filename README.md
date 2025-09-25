# Negotiation Game Platform

A real-time multiplayer negotiation game with comprehensive analytics and data persistence, designed for behavioral economics research and educational use.

## 🎯 Features

### Core Game Mechanics
- **Multi-room support** with different product categories
- **Balanced role assignment** (buyer/seller with history tracking)
- **Real-time chat** with automatic offer extraction
- **Deal confirmation system** with timing analytics
- **Moderator dashboard** for session management

### Data Persistence & Analytics
- **PostgreSQL database** for complete data persistence
- **Deal duration tracking** from negotiation start to completion
- **Initial offer analysis** (seller vs buyer opening positions)
- **Negotiation pattern analysis** and success rate tracking
- **Complete chat history** with offer extraction confidence
- **Research-ready data export** for academic studies

### User Experience
- **Survey system** for participant data collection
- **Room selection** with e-commerce style interface
- **Real-time updates** via Socket.IO
- **Responsive design** for desktop and mobile

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- PostgreSQL 12+

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ramon2115/negotiation-game2.git
   cd negotiation-game2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb negotiation_game
   
   # Run schema
   npm run db:setup
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

6. **Access the game**
   - Game: http://localhost:3000
   - Moderator Dashboard: http://localhost:3000/moderator-dashboard.html

## 🏗️ Architecture

### Backend
- **Node.js/Express** server with Socket.IO for real-time communication
- **PostgreSQL** database with JSON columns for flexible data storage
- **Hybrid persistence** - in-memory cache with database synchronization
- **Analytics engine** for negotiation research insights

### Frontend
- **Vanilla JavaScript** with Socket.IO client
- **Progressive enhancement** for real-time features
- **Mobile-responsive** CSS design

### Database Schema
- **Users**: Survey responses, game history, role tracking
- **Rooms**: Product configurations, session management
- **Pairs**: Game sessions, final deals, timing data
- **Messages**: Complete negotiation history with offer extraction

## 📊 Analytics Features

### Deal Analytics
- Average, min, max negotiation duration
- Success rates by product/room
- Final price distributions
- Deal completion timeline

### Offer Analysis
- Initial offer tracking (first seller vs buyer offers)
- Offer progression patterns (increases/decreases)
- Concession analysis and anchoring effects
- Settlement point analysis

### Research Exports
- CSV/JSON data export for academic research
- Anonymized participant data
- Complete negotiation transcripts
- Statistical summaries

## 🔧 Development

### Available Scripts
- `npm start` - Production server
- `npm run dev` - Development server with auto-restart
- `npm run db:setup` - Initialize database schema
- `npm run db:reset` - Reset database (destructive)

### Testing
- `node test-db.js` - Test database connection
- `node test-deals.js` - Test deal persistence
- `node test-offers.js` - Test offer tracking
- `node test-analytics.js` - Test analytics functions

### Database Management
See `database/setup.md` for detailed database setup instructions for different environments.

## 🌐 Deployment

### Local Development
1. PostgreSQL locally installed
2. Environment configured in `.env`
3. `npm run dev`

### Production Options
- **Heroku**: Add PostgreSQL addon, set DATABASE_URL
- **Railway**: PostgreSQL service + environment variables
- **VPS**: Manual PostgreSQL setup + PM2 process management
- **Cloud**: AWS RDS/GCP Cloud SQL + container deployment

### Environment Variables
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PORT=3000
MODERATOR_TOKEN=your-secret-token
ALLOWED_ORIGINS=https://yourdomain.com
```

## 📈 Research Applications

This platform is designed for:
- **Behavioral Economics** research on negotiation strategies
- **Psychology** studies on decision-making under uncertainty
- **Business Education** for negotiation skill development
- **Game Theory** experiments with real-time data collection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Support

For questions or issues:
- Check `AGENTS.md` for development guidelines
- Review `database/setup.md` for database help
- Open an issue on GitHub
