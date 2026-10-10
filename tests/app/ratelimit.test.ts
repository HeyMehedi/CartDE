import { describe, expect, it } from "vitest";
import { checkoutAllowed, type Limiter } from "../../src/cartde/app/ratelimit";

const counter = (max: number): Limiter & { keys: string[] } => {
	const seen = new Map<string, number>();
	const keys: string[] = [];
	return {
		keys,
		async limit({ key }) {
			keys.push(key);
			const n = (seen.get(key) ?? 0) + 1;
			seen.set(key, n);
			return { success: n <= max };
		},
	};
};

describe("checkout rate limits", () => {
	it("limits per phone and per IP independently", async () => {
		const ip = counter(3);
		const phone = counter(2);
		const lims = { CHECKOUT_IP_LIMITER: ip, CHECKOUT_PHONE_LIMITER: phone };
		expect(await checkoutAllowed(lims, "1.1.1.1", "01712345678")).toBe(true);
		expect(await checkoutAllowed(lims, "1.1.1.1", "01712345678")).toBe(true);
		expect(await checkoutAllowed(lims, "1.1.1.1", "01712345678")).toBe(false); // phone over 2
		expect(await checkoutAllowed(lims, "1.1.1.1", "01812345678")).toBe(false); // ip over 3
		expect(await checkoutAllowed(lims, "2.2.2.2", "01912345678")).toBe(true);
		expect(phone.keys[0]).toBe("phone:01712345678");
		expect(ip.keys[0]).toBe("ip:1.1.1.1");
	});
	it("allows the order when bindings are missing or fail", async () => {
		expect(await checkoutAllowed({}, "1.1.1.1", "01712345678")).toBe(true);
		const broken: Limiter = { limit: () => Promise.reject(new Error("down")) };
		expect(await checkoutAllowed({ CHECKOUT_IP_LIMITER: broken, CHECKOUT_PHONE_LIMITER: broken }, "1.1.1.1", "017")).toBe(true);
	});
	it("skips the IP check when the IP is unknown", async () => {
		const ip = counter(0);
		expect(await checkoutAllowed({ CHECKOUT_IP_LIMITER: ip }, null, "017")).toBe(true);
		expect(ip.keys).toEqual([]);
	});
});
