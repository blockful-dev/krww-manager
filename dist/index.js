"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const logger_1 = require("./utils/logger");
async function main() {
    const app = new app_1.KRWWManagerApp();
    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
        logger_1.logger.info('SIGTERM received, shutting down gracefully');
        await app.stop();
        process.exit(0);
    });
    process.on('SIGINT', async () => {
        logger_1.logger.info('SIGINT received, shutting down gracefully');
        await app.stop();
        process.exit(0);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger_1.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (error) => {
        logger_1.logger.error('Uncaught Exception:', error);
        process.exit(1);
    });
    try {
        await app.start();
    }
    catch (error) {
        logger_1.logger.error('Failed to start application:', error);
        process.exit(1);
    }
}
main().catch((error) => {
    logger_1.logger.error('Application startup failed:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map