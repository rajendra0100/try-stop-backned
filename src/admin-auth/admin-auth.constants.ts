export const ADMIN_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  ROLE_MISMATCH: (role: string) => `Account does not have the "${role}" role`,
  INVALID_BOOTSTRAP_SECRET: 'Invalid bootstrap secret',
  EMAIL_REGISTERED: 'Email already registered',
  ONLY_SUPERADMIN_ALLOWED: 'Only a superadmin can create subadmin accounts',
};

export const ADMIN_SUCCESS = {
  SUPERADMIN_CREATED: 'SuperAdmin created successfully',
  SUBADMIN_CREATED: 'Subadmin created successfully',
};
