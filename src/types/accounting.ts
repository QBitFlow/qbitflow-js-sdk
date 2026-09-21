/**
 * Accounting export types
 */

/**
 * A single row in an accounting export.
 * Covers one-time payments, subscription billings, and refunds.
 */
export interface AccountingEvent {
	/** Unique payment identifier */
	paymentId: string;
	/** Your own reference for the payment, if one was set */
	paymentReference: string;
	/** Transaction type */
	type: 'payment' | 'subscriptionHistory' | 'refund' | 'organizationFee' | 'referralFee';
	/** Transaction timestamp (UTC) */
	txTimeUtc: string;
	/** URL to the payment receipt */
	receiptUrl: string;
	/** For refunds: the payment ID of the original transaction */
	relatedPaymentId: string;
	/** For refunds: your own reference of the original payment, if one was set */
	relatedPaymentReference: string;

	/** Product ID */
	productId: number;
	/** Your own product reference, if one was set */
	productReference: string;
	/** Product name at time of payment */
	productName: string;
	/** Product description at time of payment */
	productDescription: string;
	/** Customer UUID */
	customerUUID: string;
	/** Your own customer reference, if one was set */
	customerReference: string;

	/** Blockchain name (e.g. "bitcoin", "solana", "ethereum") */
	chain: string;
	/** Block number or slot where the transaction was confirmed */
	blockNumberOrSlot: string;
	/** On-chain transaction hash */
	txHash: string;
	/** Sender address */
	fromAddress: string;
	/** Receiver address */
	toAddress: string;

	/** Token symbol (e.g. "USDC", "BTC") */
	tokenSymbol: string;
	/** Number of decimal places for the token */
	currencyDecimals: number;
	/** Token contract address (EVM) or mint address (Solana) */
	tokenContractOrMint: string;

	/** Link to the transaction on a block explorer */
	explorerUrl: string;

	/** Gross amount received (in token units, as a string to preserve precision) */
	grossAmount: string;
	/** Gross amount received in USD */
	grossAmountUsd: number;

	/** Platform fee percentage applied */
	platformFeePercent: number;
	/** Platform fee in USD */
	platformFeeUsd: number;
	/** Platform fee in token units */
	platformFee: string;

	/** Organization fee percentage applied */
	organizationFeePercent: number;
	/** Organization fee in USD */
	organizationFeeUsd: number;
	/** Organization fee in token units */
	organizationFee: string;

	/** Network fees in USD (present when QBitFlow paid the network fee, e.g. for refunds) */
	networkFeesUsd?: number;
	/** Network fees in token units */
	networkFees?: string;

	/** Net amount received in USD (gross minus all fees) */
	netAmountUsd: number;
	/** Net amount received in token units */
	netAmount: string;
}
