export const AUTH_ERRORS = {
  PROVIDE_CONTACT: "Provide at least an email or phone number",
  ACCOUNT_EXISTS: "Account already exists. Please login via OTP.",
  INVALID_OTP: "Invalid OTP",
  OTP_EXPIRED: "OTP has expired",
  SELLER_EMAIL_REGISTERED: "Email already registered as a seller",
  INVALID_CREDENTIALS: "Invalid credentials",
  INVALID_REFRESH_TOKEN: "Invalid or expired refresh token",
  ACCOUNT_DELETED: "Account no longer exists",
  PHONE_SMS_NOT_IMPLEMENTED: "Phone OTP via SMS is coming soon. Please use your email address for now.",
};

export const AUTH_SUCCESS = {
  USER_PRE_REGISTERED: "Registered successfully. Please verify via OTP to login.",
  SELLER_REGISTERED: "Seller registration submitted. Pending admin verification.",
  OTP_SENT: "OTP sent successfully. Valid for 5 minutes.",
};
