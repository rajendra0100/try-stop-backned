import {
  Injectable, Logger, BadRequestException, NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

/**
 * CashfreeService — encapsulates Cashfree Payment Gateway API calls.
 */
@Injectable()
export class CashfreeService {
  private readonly logger = new Logger(CashfreeService.name);
  private readonly pgClient: AxiosInstance;
  private readonly apiVersion: string;

  constructor(private readonly configService: ConfigService) {
    const env = this.configService.get<string>("CASHFREE_ENV", "sandbox");
    const pgBaseUrl =
      env === "production"
        ? "https://api.cashfree.com/pg"
        : "https://sandbox.cashfree.com/pg";

    this.apiVersion = "2023-08-01";

    this.pgClient = axios.create({
      baseURL: pgBaseUrl,
      headers: {
        "x-client-id": this.configService.get<string>("CASHFREE_CLIENT_ID", "TEST_CLIENT_ID"),
        "x-client-secret": this.configService.get<string>("CASHFREE_CLIENT_SECRET", "TEST_CLIENT_SECRET"),
        "x-api-version": this.apiVersion,
        "Content-Type": "application/json",
      },
    });
  }

  /** Creates a Cashfree PG order */
  async createOrder(params: {
    orderId: string;
    orderAmount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    returnUrl?: string;
    notifyUrl?: string;
  }): Promise<any> {
    try {
      const response = await this.pgClient.post("/orders", {
        order_id: params.orderId,
        order_amount: params.orderAmount,
        order_currency: "INR",
        customer_details: {
          customer_id: params.orderId.split("_")[1] || "customer",
          customer_name: params.customerName,
          customer_email: params.customerEmail,
          customer_phone: params.customerPhone || "9999999999",
        },
        order_meta: {
          return_url: params.returnUrl || "",
          notify_url: params.notifyUrl || "",
        },
      });

      this.logger.log(`Cashfree order created: ${params.orderId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create Cashfree order: ${params.orderId}`, error?.response?.data || error?.message);
      throw new InternalServerErrorException("Failed to create payment order. Please try again.");
    }
  }

  /** Fetches Cashfree PG order details */
  async getOrder(orderId: string): Promise<any> {
    try {
      const response = await this.pgClient.get("/orders/" + orderId);
      return response.data;
    } catch (error) {
      this.logger.error("Failed to fetch Cashfree order: " + orderId, error?.response?.data || error?.message);
      return null;
    }
  }

  /** Fetches all payment attempts & details for an order directly from Cashfree PG */
  async getOrderPayments(orderId: string): Promise<any[]> {
    try {
      const response = await this.pgClient.get("/orders/" + orderId + "/payments");
      return Array.isArray(response.data) ? response.data : [response.data];
    } catch (error) {
      this.logger.warn("Failed to fetch payments for order " + orderId, error?.response?.data || error?.message);
      return [];
    }
  }

  /** Verifies the Cashfree webhook signature */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const crypto = require("crypto");
      const secret = this.configService.get<string>("CASHFREE_WEBHOOK_SECRET", "TEST_WEBHOOK_SECRET");
      const computedSignature = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("base64");
      return computedSignature === signature;
    } catch (error) {
      this.logger.error("Webhook signature verification failed", error?.message);
      return false;
    }
  }
}
