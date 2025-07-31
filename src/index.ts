import { KRWWManagerApp } from './app';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const app = new KRWWManagerApp();

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await app.stop();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  try {
    await app.start();
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Application startup failed:', error);
  process.exit(1);
});