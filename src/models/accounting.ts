/**
 * The accounting export.
 *
 * @module
 */

import type { AccountingEventType, Chain } from '../enums.js';

/** One row of the accounting export: a payment, a bill, a refund, or a fee. */
export interface AccountingEvent {
	/** The event's transaction (prefixed); absent on `referralFee` rows. */
	paymentUuid?: string;
	/** The payment's reference, if any. */
	paymentReference?: string;
	/** `payment`, `subscriptionHistory`, `refund`, `organizationFee` or `referralFee`. */
	type: AccountingEventType;
	/** The transaction's time (the API may send a local offset). */
	txTimeUtc: string;
	/** The transaction's page for its customer. */
	receiptUrl?: string;
	/** For a refund, the refunded payment. */
	relatedPaymentUuid?: string;
	/** For a refund, the refunded payment's reference. */
	relatedPaymentReference?: string;
	/** The member whose space the event is in; absent for the organization's own. */
	userUuid?: string;
	/** The product; absent when none. */
	productUuid?: string;
	/** The product's reference. */
	productReference?: string;
	/** The product's name. */
	productName?: string;
	/** The product's description. */
	productDescription?: string;
	/** The customer. */
	customerUuid?: string;
	/** The customer's reference. */
	customerReference?: string;
	/** The chain. */
	chain: Chain;
	/** The block (or slot). */
	blockNumberOrSlot: string;
	/** The transaction's hash; absent on `referralFee` rows. */
	txHash?: string;
	/** The sender; absent on `referralFee` rows. */
	fromAddress?: string;
	/** The receiver; absent on `referralFee` rows. */
	toAddress?: string;
	/** The token's symbol. */
	tokenSymbol: string;
	/** The token's decimals. */
	currencyDecimals: number;
	/** The token's contract (or mint). */
	tokenContractOrMint: string;
	/** The transaction on the chain's explorer; absent on `referralFee` rows. */
	explorerUrl?: string;
	/** The gross amount in min units (a decimal string). */
	grossAmount?: string;
	/** The gross amount in USD. */
	grossAmountUsd?: number;
	/** QBitFlow's fee rate, in percent (1.5 = 1.5 %). */
	platformFeePercent?: number;
	/** QBitFlow's fee in USD. */
	platformFeeUsd?: number;
	/** QBitFlow's fee in min units. */
	platformFee?: string;
	/** The organization's fee rate, in percent. */
	organizationFeePercent?: number;
	/** The organization's fee in USD. */
	organizationFeeUsd?: number;
	/** The organization's fee in min units. */
	organizationFee?: string;
	/** The referrer's share of the platform fee, in percent. */
	referralFeePercent: number;
	/** The referral fee in USD. */
	referralFeeUsd: number;
	/** The referral fee in min units. */
	referralFee: string;
	/** The network fees in USD. */
	networkFeesUsd?: number;
	/** The network fees in min units. */
	networkFees?: string;
	/** The net amount in USD. */
	netAmountUsd?: number;
	/** The net amount in min units. */
	netAmount?: string;
	/** The member's first name. */
	userName?: string;
	/** The member's last name. */
	userLastName?: string;
	/** The customer's first name. */
	customerName?: string;
	/** The customer's last name. */
	customerLastName?: string;
}
