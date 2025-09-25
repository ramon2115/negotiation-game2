# Database Setup Guide

## Local Development

### 1. Install PostgreSQL

**Mac (using Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download from https://www.postgresql.org/download/windows/

### 2. Create Database

```bash
# Connect to PostgreSQL as superuser
psql postgres

# Create database and user
CREATE DATABASE negotiation_game;
CREATE USER nego_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE negotiation_game TO nego_user;
\q
```

### 3. Run Schema

```bash
# Run the schema file
psql -d negotiation_game -f database/schema.sql
```

### 4. Configure Environment

```bash
# Copy environment file
cp .env.example .env

# Edit .env file with your database credentials
DATABASE_URL=postgresql://nego_user:your_password@localhost:5432/negotiation_game
```

## Production Deployment

### Heroku
```bash
# Add Heroku Postgres addon
heroku addons:create heroku-postgresql:mini

# Get database URL (automatically set as DATABASE_URL)
heroku config:get DATABASE_URL

# Run schema on Heroku database
heroku pg:psql < database/schema.sql
```

### Railway
1. Add PostgreSQL service in Railway dashboard
2. Set DATABASE_URL environment variable
3. Use Railway's web console to run schema.sql

### DigitalOcean/VPS
1. Install PostgreSQL on server
2. Create database and user
3. Configure firewall for database access
4. Set DATABASE_URL in production environment

## Database Management

### Backup
```bash
pg_dump negotiation_game > backup.sql
```

### Restore
```bash
psql negotiation_game < backup.sql
```

### Migrations
For schema changes, create migration files:

```sql
-- migrations/001_add_user_preferences.sql
ALTER TABLE users ADD COLUMN preferences JSONB;
```

### Monitoring
- Monitor connection pool usage
- Watch for slow queries
- Set up alerts for database errors

## Performance Tips

1. **Indexes**: Already included in schema.sql
2. **Connection Pooling**: Configured in database.js
3. **Query Optimization**: Use EXPLAIN ANALYZE for slow queries
4. **Cleanup**: Run periodic cleanup of old data

```sql
-- Remove old messages (older than 30 days)
DELETE FROM messages WHERE timestamp < NOW() - INTERVAL '30 days';

-- Remove inactive users (older than 7 days)
DELETE FROM users WHERE last_active < NOW() - INTERVAL '7 days' AND socket_id IS NULL;
```
