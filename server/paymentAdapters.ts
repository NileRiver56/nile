import type { PaymentMethod, PaymentStatus } from '../src/shared/types.ts';

export interface PaymentIntentInput {
  orderNumber: string;
  amountUsdCents: number;
  method: PaymentMethod;
  transferReference?: string;
  whishAccountNumber?: string;
  cardEnabledInSettings?: boolean;
}

export interface PaymentResult {
  paymentStatus: PaymentStatus;
  gatewayName: string;
  reference: string;
  note: string;
}

export interface PaymentGatewayAdapter {
  readonly method: PaymentMethod;
  authorize(input: PaymentIntentInput): PaymentResult;
}

export function isCardGatewayConfigured(): boolean {
  return Boolean(
    (process.env.CARD_GATEWAY_PROVIDER || '').trim() &&
      (process.env.CARD_GATEWAY_MERCHANT_ID || '').trim() &&
      (process.env.CARD_GATEWAY_SECRET_KEY || '').trim()
  );
}

class CodPaymentAdapter implements PaymentGatewayAdapter {
  readonly method: PaymentMethod = 'cod';
  authorize(input: PaymentIntentInput): PaymentResult {
    return {
      paymentStatus: 'pending',
      gatewayName: 'Cash on Delivery (Lebanon)',
      reference: `COD-${input.orderNumber}`,
      note: 'Amount due upon delivery; seller or courier marks collected.',
    };
  }
}

class WhishManualAdapter implements PaymentGatewayAdapter {
  readonly method: PaymentMethod = 'whish_manual';
  authorize(input: PaymentIntentInput): PaymentResult {
    if (!input.whishAccountNumber || input.whishAccountNumber.trim().length < 4) {
      throw new Error('Whish / OMT receiving account is not configured yet by platform admin.');
    }
    const ref = (input.transferReference || '').trim();
    if (ref.length < 4) {
      throw new Error('Whish / OMT transfer reference number is required (minimum 4 characters).');
    }
    return {
      paymentStatus: 'pending_verification',
      gatewayName: 'Whish Money / OMT (Manual Verification)',
      reference: ref,
      note: 'Awaiting admin verification of transfer receipt.',
    };
  }
}

class CardGatewayAdapter implements PaymentGatewayAdapter {
  readonly method: PaymentMethod = 'card';
  authorize(input: PaymentIntentInput): PaymentResult {
    if (!isCardGatewayConfigured() || !input.cardEnabledInSettings) {
      throw new Error(
        'Needs my input: Card payments are disabled until Lebanese acquiring gateway credentials (CARD_GATEWAY_PROVIDER, CARD_GATEWAY_MERCHANT_ID, CARD_GATEWAY_SECRET_KEY) are configured.'
      );
    }
    throw new Error('Live card gateway webhook verification is required before marking card orders paid.');
  }
}

const ADAPTERS: Record<PaymentMethod, PaymentGatewayAdapter> = {
  cod: new CodPaymentAdapter(),
  whish_manual: new WhishManualAdapter(),
  card: new CardGatewayAdapter(),
};

export function getPaymentAdapter(method: PaymentMethod): PaymentGatewayAdapter {
  const adapter = ADAPTERS[method];
  if (!adapter) {
    throw new Error(`Unsupported payment method: ${method}`);
  }
  return adapter;
}
