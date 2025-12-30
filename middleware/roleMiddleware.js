// Middleware pour vérifier le rôle admin
export const isAdmin = (req, res, next) => {
  if (req.rootUser?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Admin requis.'
    });
  }
  next();
};

// Middleware pour vérifier le rôle modérateur
export const isModerator = (req, res, next) => {
  if (!['admin', 'moderator'].includes(req.rootUser?.role)) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Modérateur ou Admin requis.'
    });
  }
  next();
};

// Middleware pour vérifier les permissions spécifiques
export const hasPermission = (permissions) => {
  return (req, res, next) => {
    const userRole = req.rootUser?.role;
    const userPermissions = req.rootUser?.permissions || [];
    
    // Vérifier le rôle
    if (permissions.roles && !permissions.roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Rôle insuffisant.'
      });
    }
    
    // Vérifier les permissions spécifiques
    if (permissions.permissions) {
      const hasAllPermissions = permissions.permissions.every(perm => 
        userPermissions.includes(perm)
      );
      
      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          message: 'Accès refusé. Permissions insuffisantes.'
        });
      }
    }
    
    next();
  };
};