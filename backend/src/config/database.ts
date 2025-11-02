import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sitesmith';

export const connectDatabase = async (): Promise<void> => {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    console.log('Connection string:', MONGODB_URI.replace(/:[^:@]*@/, ':****@')); // Hide password in logs
    
    await mongoose.connect(MONGODB_URI, {
      dbName: 'sitesmith' // Explicitly specify database name
    });
    
    console.log('✅ Connected to MongoDB Atlas successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.error('💡 Troubleshooting tips:');
    console.error('  1. Check if your IP address is whitelisted in MongoDB Atlas');
    console.error('  2. Verify your username and password are correct');
    console.error('  3. Make sure the database user has the correct permissions');
    console.error('  4. Check if the cluster is running and accessible');
    
    // Don't exit the process immediately, let the app handle it gracefully
    console.log('⚠️  Running without database connection...');
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});