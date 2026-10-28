/**
 * The accounting export.
 *
 * @module
 */

import type { AccountingEventType, Chain, NetworkFeesPayer } from '../enums.js';

/**
 * One row of the accounting export (`accounting.exportJson`): a payment, a bill or a refund of
 * the space, or a fee it earned on another space's payment or bill.
 *
 * The export is flat on purpose, for spreadsheets: one column per key, the currency named by its
 * symbol, chain and decimals (no nested currency object). Every amount is a decimal string, in
 * the currency's units (`"7.5"` USDC, not `"7500000"`) with its on-chain twin `…MinUnits` beside
 * it; a value the row doesn't have (a fee that doesn't apply, an amount not known) is absent,
 * never `"0"`. The fields are in the CSV's column order, laid out to be read left to right: what
 * happened and when, the USD amounts (gross, the fees, net), the same amounts in the currency
 * paid, the network fees, the rates, the on-chain proof, then the ids. Read CSV columns by header
 * name, not position. Rows are ordered by `txTimeUtc`, then `type`, then `txUuid`.
 *
 * `grossAmount = platformFee + organizationFee + netAmount` exactly (an absent fee counts 0); a
 * refund's net is its gross, both negative. A `referralFee` row only tells what the referrer
 * earned, when and on which chain: `type`, `txTimeUtc`, `chain`, `blockNumberOrSlot`, `currency`,
 * `currencyDecimals`, `currencyPriceUsd`, `tokenContractOrMint`, `referralFeePercent`,
 * `referralFeeUsd`, `referralFee` and `referralFeeMinUnits`; every other field is absent.
 */
export interface AccountingEvent {
	/** When the transaction's block was mined (UTC): an event is in the export of that day. */
	txTimeUtc: string;
	/** `payment`, `bill`, `refund`, `organizationFee` or `referralFee`. */
	type: AccountingEventType;
	/** The payment's own reference (yours), when it has one. */
	reference?: string;
	/** For a refund of a payment, the payment's reference (a bill has none). */
	relatedReference?: string;
	/** The product's name. */
	productName?: string;
	/** Your reference of the customer. */
	customerReference?: string;

	/** What the customer paid in USD (a refund: what went back, negative). */
	grossAmountUsd?: string;
	/** QBitFlow's fee in USD, the referrer's share included; absent when none (a refund). */
	platformFeeUsd?: string;
	/** The referrer's share of the platform fee in USD; absent when no referral applied. */
	referralFeeUsd?: string;
	/** The organization's fee on a member's payment in USD; absent when none. */
	organizationFeeUsd?: string;
	/**
	 * What the merchant received (a payment or a bill: after the fees) or sent back (a refund: the
	 * refunded amount, negative), in USD. Network fees are never part of it.
	 */
	netAmountUsd?: string;

	/** The chain. */
	chain: Chain;
	/**
	 * What was paid, as markets name it: the token (`USDC`) or the chain's native currency (`ETH`,
	 * `SOL`; Base's is `ETH`). Always set.
	 */
	currency: string;
	/** The currency's decimals: an amount × 10^currencyDecimals is its min units on-chain. */
	currencyDecimals: number;
	/**
	 * The currency's USD price the amounts were converted at: `grossAmountUsd / grossAmount`, to 8
	 * decimals (a refund: its refunded transaction's). Absent without a gross amount.
	 */
	currencyPriceUsd?: string;
	/** The gross amount in the currency's units. */
	grossAmount?: string;
	/** The same on-chain: an integer string. */
	grossAmountMinUnits?: string;
	/** QBitFlow's fee in the currency's units, the referrer's share included. */
	platformFee?: string;
	/** The same on-chain. */
	platformFeeMinUnits?: string;
	/**
	 * The referrer's share, paid out of the platform fee, in the currency's units: what a
	 * `referralFee` event earned. Absent when no referral applied (none, or past its deadline).
	 */
	referralFee?: string;
	/** The same on-chain. */
	referralFeeMinUnits?: string;
	/** The organization's fee in the currency's units; absent when none. */
	organizationFee?: string;
	/** The same on-chain. */
	organizationFeeMinUnits?: string;
	/** The net amount in the currency's units (a refund: the refunded amount, negative). */
	netAmount?: string;
	/** The same on-chain. */
	netAmountMinUnits?: string;

	/**
	 * Whose wallet paid the transaction's network fees, never part of the net: `payer` (a payment
	 * or a bill: on top of the amount), `merchant` (a refund the space sent: book it apart) or
	 * `organization` (a refund of a payment the organization held for its member). Absent on
	 * `referralFee` rows.
	 */
	networkFeesPaidBy?: NetworkFeesPayer;
	/** The network fees in `networkFeesCurrency`'s units; absent when not recorded. */
	networkFees?: string;
	/** The same in `networkFeesCurrency`'s min units. */
	networkFeesMinUnits?: string;
	/**
	 * What paid them: the event's currency on a payment or a bill (the payer's gas refund, taken
	 * in it), the chain's native currency (`ETH`, `SOL`) on a refund.
	 */
	networkFeesCurrency?: string;
	/** `networkFeesCurrency`'s decimals. */
	networkFeesCurrencyDecimals?: number;
	/** `networkFeesCurrency`'s USD price `networkFeesUsd` was converted at; absent when unknown. */
	networkFeesCurrencyPriceUsd?: string;
	/** The network fees in USD; absent when unknown. */
	networkFeesUsd?: string;

	/** QBitFlow's fee rate on the event, a percent string (`"0.99"` = 0.99 %). */
	platformFeePercent?: string;
	/** The referrer's share of the platform fee (`"20"` = 20 % of it), when a referral applied. */
	referralFeePercent?: string;
	/** The organization's fee rate on the event, when it took one. */
	organizationFeePercent?: string;

	/** The sender; absent on `referralFee` rows. */
	fromAddress?: string;
	/** The receiver; absent on `referralFee` rows. */
	toAddress?: string;
	/** The transaction's hash; absent on `referralFee` rows. */
	txHash?: string;
	/** The block (or slot). */
	blockNumberOrSlot?: string;
	/** The token's contract (EVM) or mint (Solana); absent for a native currency. */
	tokenContractOrMint?: string;
	/** The transaction on the chain's explorer; absent on `referralFee` rows. */
	explorerUrl?: string;
	/** The transaction's public page for its customer; absent on `referralFee` rows. */
	receiptUrl?: string;

	/**
	 * The event's transaction, prefixed by its type: `pay@` (a payment), `sub-hist@` (a bill),
	 * `refund@` (a refund); absent on `referralFee` rows.
	 */
	txUuid?: string;
	/** For a refund, the refunded payment's (`pay@…`) or bill's (`sub-hist@…`) id. */
	relatedTxUuid?: string;
	/** The product; absent when the event has none. */
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
