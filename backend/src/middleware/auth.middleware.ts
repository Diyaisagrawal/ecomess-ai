import express from 'express';
import { AuthService } from '../services/auth.service';
import { JwtPayload } from '../types/auth';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Authenticate JWT token
export const authenticateToken = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer token

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided',
    });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    // 401 so the frontend knows to refresh the access token
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }

  req.user = payload;
  next();
};

// Authorize by roles
export const authorize = (allowedRoles: string[]) => {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

// Role-based middleware factory
export const requireRole = (role: string) => {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        error: `Only ${role} can access this resource`,
      });
    }

    next();
  };
};

// Admin only
export const requireAdmin = authorize(['ADMIN']);

// Manager or Admin
export const requireManagerOrAdmin = authorize(['MANAGER', 'ADMIN']);

// Logging middleware
export const loggingMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.path} - ${res.statusCode} (${duration}ms) - User: ${req.user?.id || 'anonymous'}`
    );
  });

  next();
};

// Request validation middleware
export const validateRequestBody = (requiredFields: string[]) => {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const missingFields = requiredFields.filter((field) => !(field in req.body));

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    next();
  };
};

// Rate limiting helper
const requestCounts = new Map<string, number[]>();

export const rateLimit = (maxRequests: number, windowMs: number) => {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    if (!requestCounts.has(key)) {
      requestCounts.set(key, []);
    }

    const timestamps = requestCounts.get(key)!;
    const recentRequests = timestamps.filter((t) => now - t < windowMs);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
      });
    }

    recentRequests.push(now);
    requestCounts.set(key, recentRequests);

    next();
  };
};

// Error handler middleware
export const errorHandler = (
  err: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.message,
    });
  }

  if (err.name === 'AuthenticationError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }

  if (err.name === 'AuthorizationError') {
    return res.status(403).json({
      success: false,
      error: 'Authorization failed',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
};