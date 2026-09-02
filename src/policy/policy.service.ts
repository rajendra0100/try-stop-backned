import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Policy, PolicyDocument } from './schemas/policy.schema';
import { UpdatePolicyDto } from './dto/policy.dto';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    @InjectModel(Policy.name) private readonly policyModel: Model<PolicyDocument>,
  ) {}

  /**
   * Gets policy of a specific type.
   * Auto-initializes default points if policy doesn't exist.
   */
  async getPolicy(type: string): Promise<PolicyDocument> {
    let policy = await this.policyModel.findOne({ type }).exec();
    if (!policy) {
      if (type === 'voucher_guidelines') {
        policy = await this.policyModel.create({
          type: 'voucher_guidelines',
          points: [
            'Buy Trystop vouchers and get instant cashback/discounts applied directly to your wallet.',
            'Your voucher balance is stored in your secure wallet to pay any partner shop.',
            'Search for partner shops directly in the app and pay the owner without needing to scan a QR code.',
            'You can also pay by scanning the shop owner\'s QR code at checkout.',
            'A platform fee of ₹1 is charged per voucher purchase.',
          ],
          description: 'Guidelines on how to use Trystop vouchers, shown in Order Summary screen.',
        });
      } else if (type === 'terms_and_conditions') {
        policy = await this.policyModel.create({
          type: 'terms_and_conditions',
          description: 'Trystop Terms & Conditions',
          points: [
            '1. Acceptance of Terms: By registering or using the Trystop application, you agree to comply with all terms and conditions.',
            '2. Account Eligibility: You must provide accurate mobile/email credentials. Each user account is strictly personal and non-transferable.',
            '3. Cashback & Vouchers: Cashback earned is non-transferable and applicable up to 70%-80% of bill amount. Purchased vouchers can be used 100% at partner merchants.',
            '4. Anti-Abuse Policy: Account deletion does not reset offer caps or historical purchasing limits. Re-registering with the same mobile number preserves previous user status.',
            '5. Merchant Payments: Merchants reserve the right to verify voucher authenticity at checkout.',
            '6. Termination: Trystop reserves the right to suspend or terminate accounts engaging in fraudulent transactions or policy violations.',
          ],
        });
      } else if (type === 'privacy_policy') {
        policy = await this.policyModel.create({
          type: 'privacy_policy',
          description: 'Trystop Privacy Policy',
          points: [
            '1. Data Collection: We collect account profile info (name, email, phone number) and location data to deliver localized merchant offers.',
            '2. Usage of Information: Your data is used exclusively to facilitate order processing, cashback calculation, and customer support.',
            '3. Data Protection: We employ industry-standard encryption standards to secure your personal data and wallet transactions.',
            '4. Third-Party Sharing: We do not sell or trade your personal data. Limited transaction info is shared with partner merchants solely for order verification.',
            '5. User Rights & Account Deletion: You can update your profile or request account deletion at any time. Archived records are retained in compliance with regulatory and anti-abuse policies.',
          ],
        });
      } else if (type === 'support_contact') {
        policy = await this.policyModel.create({
          type: 'support_contact',
          description: '{"email":"support@trystop.com","whatsapp":"919876543210"}',
          points: [
            'Email: support@trystop.com',
            'WhatsApp: +91 9876543210',
            'Operating Hours: 24/7 Assistance',
          ],
        });
      } else if (type === "seller_terms_and_conditions") {
        policy = await this.policyModel.create({
          type: "seller_terms_and_conditions",
          description: "Trystop Merchant Partner Terms & Conditions",
          points: [
            "1. Merchant Onboarding & Accuracy: Merchants agree to provide authentic business details, valid bank account information, and honest product/pricing details.",
            "2. Payment Processing & Payouts: Online customer payments processed through Trystop are settled to the registered bank account as per the platform payout cycle.",
            "3. Cashback & Customer Vouchers: Partner merchants agree to honor customer voucher redemptions and cashbacks applied through the Trystop platform.",
            "4. Platform Commissions: Platform fees and payment gateway charges are computed based on agreed vendor rates and deducted automatically from gross transaction amounts.",
            "5. Staff & Executive Access: Merchant owners are responsible for adding, editing, or revoking store permissions granted to staff members.",
            "6. Store Deletion & Termination: Merchants may archive their store via Settings. Deletion requests require secure passcode confirmation and pending payouts must be settled prior to account closure.",
          ],
        });
      } else if (type === "seller_privacy_policy") {
        policy = await this.policyModel.create({
          type: "seller_privacy_policy",
          description: "Trystop Merchant Privacy Policy",
          points: [
            "1. Business Information: We collect shop name, location, owner contact, bank details, and business media to publish your merchant profile.",
            "2. Financial & Bank Details: Bank account numbers and IFSC details are securely stored with encryption solely for direct payout processing.",
            "3. Transaction Records: Historical sales, settlement figures, and customer order records are maintained for accounting, reporting, and anti-fraud purposes.",
            "4. Data Confidentiality: Trystop does not share confidential merchant financial data or customer phone numbers with unauthorized third parties.",
            "5. Account Security: Your merchant passcode is securely encrypted. Store staff members only access modules explicitly granted by the store owner.",
          ],
        });
      } else if (type === "seller_support_contact") {
        policy = await this.policyModel.create({
          type: "seller_support_contact",
          description: JSON.stringify({ email: "merchants@trystop.com", whatsapp: "919876543210", hours: "Merchant priority desk available 24/7" }),
          points: [
            "Email: merchants@trystop.com",
            "WhatsApp: +91 9876543210",
            "Operating Hours: 24/7 Dedicated Merchant Desk",
          ],
        });
      } else if (type === "seller_faqs" || type === "seller_help_center") {
        policy = await this.policyModel.create({
          type: "seller_faqs",
          description: "Trystop Merchant Help Center & FAQs",
          points: [
            JSON.stringify({
              id: "faq_seller_settlements",
              category: "Payouts & Settlements",
              question: "When and how do I receive my daily payouts?",
              answer: "Payments received from customer transactions are processed and transferred directly to your registered bank account according to the daily settlement cycle. You can track individual transactions and settlement status in the Orders and Daily Settlements tabs.",
            }),
            JSON.stringify({
              id: "faq_seller_qr",
              category: "Store QR & Profile",
              question: "How do customers pay at my shop?",
              answer: "Customers can pay instantly by scanning your store QR code placed at your counter, or by finding your store on the Trystop app and selecting Direct Pay. You will receive an instant push notification on every successful payment.",
            }),
            JSON.stringify({
              id: "faq_seller_passcode",
              category: "Security & Bank Details",
              question: "How do I change my bank details or security passcode?",
              answer: "Go to the Account tab and select Bank & Payout Details. You will be prompted to enter your 4-digit security passcode to view or update your bank credentials securely.",
            }),
            JSON.stringify({
              id: "faq_seller_staff",
              category: "Staff & Team Access",
              question: "How do I add store executives and manage their access?",
              answer: "Tap Staff Management under the Account tab. You can onboard new staff members using their email/mobile with OTP verification and customize their permissions for Store Profile, Analytics, and Staff Management.",
            }),
            JSON.stringify({
              id: "faq_seller_delete",
              category: "Account Management",
              question: "How do I delete or archive my merchant account?",
              answer: "Go to the Account tab, tap Settings under Legal & Settings, and select Delete Account. You will be required to verify your security passcode and provide an account archive reason.",
            }),
          ],
        });
      } else if (type === 'faqs' || type === 'help_center') {
        policy = await this.policyModel.create({
          type,
          description: 'Trystop Help Center & FAQs',
          points: [
            JSON.stringify({
              id: 'faq_cashback_works',
              category: 'Cashback & Payments',
              question: 'How does Cashback work on payments?',
              answer: 'When you pay a seller, you earn instant cashback. On future payments, if you pay using a combination of Wallet Balance and UPI/Card, cashback is calculated ONLY on the amount paid via UPI/Card. The portion paid using Wallet Balance will not earn cashback.',
            }),
            JSON.stringify({
              id: 'faq_store_cashback',
              category: 'Cashback & Payments',
              question: 'How do I earn cashback at partner stores?',
              answer: 'You can earn instant cashback at partner stores by scanning the store QR code at checkout, or by opening the store details page in the app and selecting the Direct Pay option to complete your payment without scanning.',
            }),
            JSON.stringify({
              id: 'faq_vouchers',
              category: 'Vouchers & Offers',
              question: 'How do I purchase and use store vouchers?',
              answer: 'Go to the Home tab to explore available store vouchers at discounted rates. Once purchased, the voucher amount is added directly to your wallet and can be used 100% to pay the seller at payment time.',
            }),
            JSON.stringify({
              id: 'faq_wallet_diff',
              category: 'Wallet & Benefits',
              question: 'What is the difference between Cashback and Voucher Money?',
              answer: 'Cashback earned on transactions can be used to pay up to 70% - 80% of your bill amount at partner stores, whereas Voucher Money can be used up to 100% of your bill amount to pay sellers.',
            }),
            JSON.stringify({
              id: 'faq_referrals',
              category: 'Referral Rewards',
              question: 'How do I earn money by referring friends?',
              answer: 'Share your unique referral link or code with your friends. Once your friend registers and completes their first store transaction, you will earn an instant referral bonus in your wallet!',
            }),
          ],
        });
      } else {
        policy = await this.policyModel.create({
          type,
          points: [],
          description: `Auto-initialized dynamic policy for ${type}`,
        });
      }
    }
    return policy;
  }

  /**
   * Upserts policy configuration.
   */
  async updatePolicy(type: string, dto: UpdatePolicyDto): Promise<PolicyDocument> {
    const updateData: any = { points: dto.points };
    if (dto.numericValue !== undefined) {
      updateData.numericValue = dto.numericValue;
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }

    return this.policyModel.findOneAndUpdate(
      { type },
      { type, ...updateData },
      { upsert: true, new: true },
    ).exec();
  }
}
