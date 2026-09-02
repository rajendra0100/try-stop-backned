export const OTP_ERRORS = {
  NOT_FOUND: 'No active OTP found. Please request a new one.',
  EXPIRED: 'OTP has expired. Please request a new one.',
  MAX_ATTEMPTS_EXCEEDED: 'Maximum verification attempts exceeded. Please request a new OTP.',
  INVALID_OTP: (remaining: number) => `Invalid OTP. ${remaining} attempt(s) remaining.`,
};
