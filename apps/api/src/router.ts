/**
 * Application Router
 *
 * Central router configuration that maps API endpoints to their respective route handlers.
 * Routes are organized by feature and mounted at their respective base paths.
 */
import { connectRouter } from './routes/connect.router';
import { publishRouter } from './routes/publish.router';
import { historyRouter } from './routes/history.router';
import { App } from '.';

/**
 * Register all routes with the main application
 *
 * This centralizes route configuration and makes it easy to add new routes
 * without modifying the main application entry point.
 *
 * @param app The Hono application instance
 */
export function registerRoutes(app: App): void {
  // WebSocket connection management
  app.route('/connect', connectRouter);

  // Message publishing endpoint
  app.route('/publish', publishRouter);

  // Channel history endpoint
  app.route('/history', historyRouter);

  // Additional routes can be added here as the application grows
}
