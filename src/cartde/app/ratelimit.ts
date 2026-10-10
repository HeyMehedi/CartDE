/** Checkout rate limiting (SRS NFR-1) using Cloudflare's rate limiting bindings. Missing bindings disable the check. */
export interface Limiter {
	limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface CheckoutLimiters {
	CHECKOUT_IP_LIMITER?: Limiter;
	CHECKOUT_PHONE_LIMITER?: Limiter;
}

/** Returns true when the attempt may proceed. A limiter that errors lets the order through rather than losing a sale. */
export async function checkoutAllowed(limiters: CheckoutLimiters, ip: string | null, phone: string): Promise<boolean> {
	const checks: Promise<{ success: boolean }>[] = [];
	if (limiters.CHECKOUT_IP_LIMITER && ip) checks.push(limiters.CHECKOUT_IP_LIMITER.limit({ key: `ip:${ip}` }));
	if (limiters.CHECKOUT_PHONE_LIMITER && phone) checks.push(limiters.CHECKOUT_PHONE_LIMITER.limit({ key: `phone:${phone}` }));
	const results = await Promise.allSettled(checks);
	return results.every((r) => r.status === "rejected" || r.value.success);
}

export const clientIp = (request: Request): string | null => request.headers.get("cf-connecting-ip");
