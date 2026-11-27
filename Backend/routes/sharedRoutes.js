const dashboard = Router()
dashboard.get('/', ...sharedHandlers.getDashboardHandlerChain('get', '/'))

router.use('/dashboard', requireAuth, dashboard)

const notifications = Router();
notifications.post(
  '/read',
  ...sharedHandlers.getNotificationsHandlerChain('post', '/read'),
);
notifications.get(
  '/',
  ...sharedHandlers.getNotificationsHandlerChain('get', '/'),
);

router.use('/notifications', requireAuth, notifications);