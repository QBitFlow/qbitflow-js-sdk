/**
 * The accounting export.
 *
 * @module
 */

import type { AccountingEventType, Chain, NetworkFeesPayer } from '../enums.js';

/**
 * One row of the accounting export: a payment, a bill, a refund, or a fee.
 *
 * The fields are in the CSV's column order, laid out to be read left to right: what happened and
 * when, the USD amounts (gross, the fees, net), the same amounts in the currency paid, the network
 * fees, the rates, the on-chain proof, then the ids. Read CSV columns by header name, not
 * position. Amounts are in the currency's units (`"7.5"` USDC, not `"7500000"`), decimal strings,
 * with the currency's decimals beside them. A `referralFee` row only has `txTimeUtc`, `type`,
 * `chain`, `blockNumberOrSlot`, `currency`, `currencyDecimals`, `currencyPriceUsd`,
 * `tokenContractOrMint` and the referral fee: every other field is absent.
 */
export interface AccountingEvent {
	/** When the transaction's block was mined (UTC): an event is in the export of that day. */
	txTimeUtc: string;
	/** `payment`, `subscriptionHistory`, `refund`, `organizationFee` or `referralFee`. */
	type: AccountingEventType;
	/** The payment's reference, if any. */
	paymentReference?: string;
	/** For a refund of a payment, the payment's reference (a bill has none). */
	relatedPaymentReference?: string;
	/** The product's name. */
	productName?: string;
	/** The merchant's reference of the customer. */
	customerReference?: string;

	/** The gross amount in USD: what was charged (a refund: what was sent back, negative). */
	grossAmountUsd?: number;
	/** QBitFlow's fee in USD, the referrer's share included. */
	platformFeeUsd?: number;
	/** The referral fee in USD. */
	referralFeeUsd: number;
	/** The organization's fee in USD. */
	organizationFeeUsd?: number;
	/**
	 * What the merchant received (a payment or a bill: after the fees) or sent back (a refund: the
	 * refunded amount, negative), in USD. Network fees are never part of it.
	 */
	netAmountUsd?: number;

	/** The chain. */
	chain: Chain;
	/**
	 * What was paid, as markets name it: the token (`USDC`) or the chain's native currency (`ETH`,
	 * `SOL`; Base's is `ETH`). Always set.
	 */
	currency: string;
	/** The currency's decimals: an amount × 10^`currencyDecimals` is its min units on-chain. */
	currencyDecimals: number;
	/**
	 * The currency's USD price the amounts were converted at (`grossAmountUsd / grossAmount`; a
	 * refund: its refunded transaction's). Absent without a gross amount.
	 */
	currencyPriceUsd?: number;
	/** The gross amount in the currency's units (a decimal string). */
	grossAmount?: string;
	/** QBitFlow's fee in the currency's units, the referrer's share included. */
	platformFee?: string;
	/**
	 * The referrer's share, paid out of the platform fee, in the currency's units: what a
	 * `referralFee` event earned. `"0"` when no referral applied.
	 */
	referralFee: string;
	/** The organization's fee in the currency's units (`"0"` when none). */
	organizationFee?: string;
	/**
	 * The net amount in the currency's units (a refund: the refunded amount, negative).
	 * `grossAmount = platformFee + organizationFee + netAmount` exactly.
	 */
	netAmount?: string;

	/**
	 * Whose wallet paid the transaction's network fees, never part of the net: `payer` (a payment
	 * or a bill: on top of the amount), `merchant` (a refund the space sent: book it apart) or
	 * `organization` (a refund of a payment the organization held for its member). Absent on
	 * `referralFee` rows.
	 */
	networkFeesPaidBy?: NetworkFeesPayer;
	/**
	 * The network fees in `networkFeesCurrency`'s units (a decimal string); absent when unknown (a
	 * refund recorded before they were).
	 */
	networkFees?: string;
	/**
	 * What paid them: the event's currency on a payment or a bill (the payer's gas refund, taken
	 * in it), the chain's native currency (`ETH`, `SOL`) on a refund.
	 */
	networkFeesCurrency?: string;
	/** `networkFeesCurrency`'s decimals. */
	networkFeesCurrencyDecimals?: number;
	/**
	 * `networkFeesCurrency`'s USD price `networkFeesUsd` was converted at; absent when unknown (a
	 * refund recorded before it was).
	 */
	networkFeesCurrencyPriceUsd?: number;
	/** The network fees in USD; absent when unknown. */
	networkFeesUsd?: number;

	/** QBitFlow's fee rate on the event, in percent (0.99 = 0.99 %). */
	platformFeePercent?: number;
	/** The referrer's share of the platform fee, in percent (20 = 20 % of it). */
	referralFeePercent: number;
	/** The organization's fee rate on the event, in percent. */
	organizationFeePercent?: number;

	/** The sender; absent on `referralFee` rows. */
	fromAddress?: string;
	/** The receiver; absent on `referralFee` rows. */
	toAddress?: string;
	/** The transaction's hash; absent on `referralFee` rows. */
	txHash?: string;
	/** The block (or slot). */
	blockNumberOrSlot: string;
	/** The token's contract (EVM) or mint (Solana); `''` for a native currency. */
	tokenContractOrMint: string;
	/** The transaction on the chain's explorer; absent on `referralFee` rows. */
	explorerUrl?: string;
	/** The transaction's page for its customer; absent on `referralFee` rows. */
	receiptUrl?: string;

	/**
	 * The event's transaction, prefixed by its type: `pay@` (a payment, an organization fee's),
	 * `sub-hist@` (a bill), `refund@` (a refund); absent on `referralFee` rows.
	 */
	paymentUuid?: string;
	/** For a refund, the refunded payment's (`pay@…`) or bill's (`sub-hist@…`) id. */
	relatedPaymentUuid?: string;
	/** The product; absent when none. */
	productUuid?: string;
	/** The product's reference. */
	productReference?: string;
	/** The product's description. */
	productDescription?: string;
	/** The customer. */
	customerUuid?: string;
	/** The member whose space the event is in; absent for the organization's own. */
	userUuid?: string;
}
