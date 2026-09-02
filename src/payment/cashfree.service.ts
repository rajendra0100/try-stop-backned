import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

@Injectable()
export class CashfreeService {
  private readonly logger = new Logger(CashfreeService.name);
  private readonly pgClient: AxiosInstance;
  private readonly payoutClient: AxiosInstance;
  private readonly isSandbox: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isSandbox = this.configService.get<string>("CASHFREE_ENV", "sandbox") !== "production";

    const pgBaseUrl = this.isSandbox
      ? "https://sandbox.cashfree.com/pg"
      : "https://api.cashfree.com/pg";

    const payoutBaseUrl = this.isSandbox
      ? "https://payout-gamma.cashfree.com/payout/v1"
      : "https://payout-api.cashfree.com/payout/v1";

    this.pgClient = axios.create({
      baseURL: pgBaseUrl,
      headers: {
        "x-client-id": this.configService.get<string>("CASHFREE_CLIENT_ID"),
        "x-client-secret": this.configService.get<string>("CASHFREE_CLIENT_SECRET"),
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
      },
    });

    this.payoutClient = axios.create({
      baseURL: payoutBaseUrl,
      headers: {
        "x-client-id": this.configService.get<string>("CASHFREE_PAYOUT_CLIENT_ID"),
        "x-client-secret": this.configService.get<string>("CASHFREE_PAYOUT_CLIENT_SECRET"),
        "Content-Type": "application/json",
      },
    });
  }

  /** Creates a payment order on Cashfree PG */
  async createOrder(params: any): Promise<any> {
    try {
      const orderId = params.orderId || params.order_id;
      const orderAmount = params.orderAmount !== undefined ? Number(params.orderAmount) : Number(params.order_amount);
      const orderCurrency = params.orderCurrency || params.order_currency || "INR";

      const customerId =
        params.customer_details?.customer_id ||
        (orderId ? String(orderId).split("_")[1] : undefined) ||
        "customer";
      const customerName = params.customerName || params.customer_details?.customer_name || "Customer";
      const customerEmail = params.customerEmail || params.customer_details?.customer_email || "customer@trystop.com";
      const customerPhone = params.customerPhone || params.customer_details?.customer_phone || "9999999999";

      const returnUrl = params.returnUrl || params.order_meta?.return_url || "";
      const notifyUrl = params.notifyUrl || params.order_meta?.notify_url || "";

      const orderPayload: any = {
        order_id: orderId,
        order_amount: orderAmount,
        order_currency: orderCurrency,
        customer_details: {
          customer_id: customerId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
        },
      };

      if (returnUrl || notifyUrl) {
        orderPayload.order_meta = {};
        if (returnUrl) orderPayload.order_meta.return_url = returnUrl;
        if (notifyUrl) orderPayload.order_meta.notify_url = notifyUrl;
      }

      this.logger.log(`Creating Cashfree order ${orderId} for ₹${orderAmount}`);
      const response = await this.pgClient.post("/orders", orderPayload);
      return response.data;
    } catch (error) {
      this.logger.error("Failed to create Cashfree PG order", error?.response?.data || error?.message);
      throw error;
    }
  }

  async createPgOrder(orderPayload: any): Promise<any> {
    return this.createOrder(orderPayload);
  }

  /** Fetches order details directly from Cashfree PG */
  async getOrder(orderId: string): Promise<any> {
    try {
      const response = await this.pgClient.get("/orders/" + orderId);
      return response.data;
    } catch (error) {
      this.logger.error("Failed to get Cashfree PG order", error?.response?.data || error?.message);
      throw error;
    }
  }

  async getPgOrder(orderId: string): Promise<any> {
    return this.getOrder(orderId);
  }

  /** Transfers payout amount to seller bank account via Cashfree Payouts API */
  async requestPayoutTransfer(transferPayload: any): Promise<any> {
    try {
      const response = await this.payoutClient.post("/requestTransfer", transferPayload);
      return response.data;
    } catch (error) {
      this.logger.error("Failed to execute Cashfree Payout transfer", error?.response?.data || error?.message);
      throw error;
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
      const secret = this.configService.get<string>("CASHFREE_WEBHOOK_SECRET", "TEST_WEBHOOK_SECRET");
      // In sandbox mode without configured webhook secret, gracefully accept for testing
      if (this.isSandbox && (secret === "TEST_WEBHOOK_SECRET" || !signature)) {
        return true;
      }

      if (!signature) {
        return false;
      }

      const crypto = require("crypto");
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
