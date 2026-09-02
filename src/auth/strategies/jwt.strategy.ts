import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { Seller, SellerDocument } from '../schemas/seller.schema';
import { Admin, AdminDocument } from '../../admin-auth/schemas/admin.schema';
import { Role } from '../../common/enums/role.enum';

/**
 * JwtStrategy — validates access tokens for ALL roles.
 * Routes to the correct MongoDB collection based on the role in the JWT payload.
 *
 * JWT payload shape: { sub: id, role: 'user' | 'seller' | 'superadmin' | 'subadmin' }
 */
type AuthenticatedUser = UserDocument | SellerDocument | AdminDocument;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: { sub: string; role: Role }): Promise<AuthenticatedUser> {
    const { sub, role } = payload;
    let user: AuthenticatedUser | null = null;

    switch (role) {
      case Role.USER:
        user = await this.userModel.findById(sub);
        break;
      case Role.SELLER:
        user = await this.sellerModel.findById(sub).select('-password');
        break;
      case Role.SUPERADMIN:
      case Role.SUBADMIN:
        user = await this.adminModel.findById(sub).select('-password');
        break;
      default:
        throw new UnauthorizedException('Unknown role in token');
    }

    if (!user) {
      throw new UnauthorizedException('Account no longer exists or token is invalid');
    }

    return user;
  }
}
