const dashboard = Router()
dashboard.get('/', ...sharedHandlers.getDashboardHandlerChain('get', '/'))

router.use('/dashboard', requireAuth, dashboard)