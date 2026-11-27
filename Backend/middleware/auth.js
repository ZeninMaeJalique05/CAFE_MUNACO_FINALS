export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const data = verifyToken(
      header.startsWith('Bearer ') ? header.slice(7) : '',
    )

    if (!data) {
      return res.status(401).json({ error: 'Please sign in again.' })
    }

    const user = await findById(data.id)
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'This account is not active.' })
    }

    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({
          error: 'Your role does not have permission to do that.',
        })