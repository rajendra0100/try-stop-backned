import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthService } from "../auth.service";
import { RegisterSellerDto } from "../dto/register-seller.dto";
import { SendOtpDto } from "../dto/send-otp.dto";
import { VerifyOtpDto } from "../dto/verify-otp.dto";
import { LoginDto } from "../dto/login.dto";

/**
 * Seller Auth Controller — handles only authentication, registration, and OTP verification for sellers.
 *
 * POST /auth/register/seller          — full business registration
 * POST /auth/login/seller             — email/phone + password → JWT tokens
 * POST /auth/login/seller/otp         — request OTP for seller
 * POST /auth/login/seller/otp/verify  — verify OTP for seller
 */
@Controller("auth")
export class SellerAuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Full seller registration — shop info, business docs, bank details.
   * verificationStatus defaults to "pending" — admin approves before activation.
   */
  @Post("register/seller")
  async register(@Body() dto: RegisterSellerDto) {
    return this.authService.registerSeller(dto);
  }

  /** Password-based login with email or phone */
  @Post("login/seller")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.sellerLogin(dto);
  }

  /** Send OTP for seller login */
  @Post("login/seller/otp")
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto, "seller");
  }

  /** Verify OTP and login seller */
  @Post("login/seller/otp/verify")
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtpAndLogin(dto, "seller");
  }
}
