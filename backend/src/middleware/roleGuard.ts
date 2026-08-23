import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types';

/**
 * Higher-order middleware that restricts access to specific roles.
 * Must be used after the authenticate middleware.
 */
export function roleGuard(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
      return;
    }

    next();
  };
}
